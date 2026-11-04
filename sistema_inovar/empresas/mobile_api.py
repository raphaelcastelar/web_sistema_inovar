import mimetypes
import re
from datetime import timedelta

from django.core.cache import cache
from django.db import transaction
from django.http import FileResponse
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from .document_storage import find_reusable_document, save_generated_das, save_generated_fiscal_document
from .models import (
    DocumentoEmpresa,
    Empresa,
    Notificacao,
    SimplesApiUsage,
    SolicitacaoCliente,
)
from .serpro_service import (
    consultar_parcelas_parcsn_serpro,
    gerar_das_parcsn_serpro,
    gerar_das_serpro,
    orquestrar_consulta_extrato,
)


def client_company(user):
    if not user.is_authenticated or user.cargo != 'cliente':
        raise PermissionDenied('Este acesso é exclusivo para clientes da Inovar.')
    companies = list(Empresa.objects.filter(usuarios=user, ativo=True)[:2])
    if len(companies) != 1:
        raise PermissionDenied('O login deve estar vinculado a uma única empresa ativa.')
    return companies[0]


class IsMobileClient(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        client_company(request.user)
        return True


class MobileTokenSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        client_company(self.user)
        return data


class MobileTokenView(TokenObtainPairView):
    serializer_class = MobileTokenSerializer


class MobileAPIView(APIView):
    permission_classes = [IsAuthenticated, IsMobileClient]

    def company(self, request):
        return client_company(request.user)


def _document_url(request, document):
    return request.build_absolute_uri(f'/api/mobile/files/{document.pk}/')


def _serialize_document(request, document):
    is_untyped_other = document.folder_key == 'outros'
    return {
        'id': document.pk,
        # A pasta Outros é um arquivo livre: cada item é identificado pelo
        # próprio nome, sem expor a classificação interna usada pelo banco.
        'tipo_documento': document.nome_arquivo if is_untyped_other else document.tipo_documento.nome,
        'tipo_codigo': None if is_untyped_other else document.tipo_documento.codigo,
        'categoria': document.tipo_documento.categoria,
        'nome_arquivo': document.nome_arquivo,
        'caminho_arquivo': _document_url(request, document),
        'ano': document.ano,
        'mes': document.mes,
        'entregue': document.entregue,
        'competencia': document.competencia,
        'versao': document.versao,
        'status': document.status,
        'criado_em': document.criado_em,
    }


DOCUMENT_FOLDERS = {
    'documentos-constitutivos': ('constitutivos_',),
    'departamento-pessoal': ('pessoal_folha_pagamento', 'pessoal_guias', 'pessoal_relatorios'),
    'simples-nacional': ('fiscal_guias',),
    'xml': ('fiscal_xml',),
    'outros': ('outros',),
}


class MobileDocumentsView(MobileAPIView):
    source = ''

    def get(self, request):
        company = self.company(request)
        folders = DOCUMENT_FOLDERS[self.source]
        query = DocumentoEmpresa.objects.select_related('tipo_documento').filter(
            empresa=company, visivel_no_app=True, status='disponivel',
        )
        if folders == ('constitutivos_',):
            query = query.filter(folder_key__startswith='constitutivos_')
        else:
            query = query.filter(folder_key__in=folders)
        if self.source == 'simples-nacional':
            query = query.filter(tipo_documento__codigo__in=(
                'das_simples', 'extrato_simples', 'recibo_simples', 'guia_parcelamento_simples',
            ))
        return Response([_serialize_document(request, item) for item in query[:500]])


class SecureDocumentDownloadView(MobileAPIView):
    def get(self, request, document_id):
        document = DocumentoEmpresa.objects.filter(
            pk=document_id, empresa=self.company(request), visivel_no_app=True, status='disponivel',
        ).first()
        if not document or not document.caminho_arquivo:
            return Response({'detail': 'Arquivo não encontrado.'}, status=status.HTTP_404_NOT_FOUND)
        storage = document.caminho_arquivo.storage
        if not storage.exists(document.caminho_arquivo.name):
            return Response({'detail': 'Arquivo indisponível.'}, status=status.HTTP_404_NOT_FOUND)
        content_type = mimetypes.guess_type(document.nome_arquivo)[0] or 'application/octet-stream'
        return FileResponse(
            storage.open(document.caminho_arquivo.name, 'rb'),
            as_attachment=True,
            filename=document.nome_arquivo,
            content_type=content_type,
        )


class CurrentUserView(MobileAPIView):
    def get(self, request):
        company = self.company(request)
        return Response({
            'id': request.user.pk,
            'username': request.user.username,
            'cpf': request.user.username,
            'nome': company.nome,
            'first_name': request.user.first_name,
            'last_name': request.user.last_name,
            'email': request.user.email or company.email,
            'cargo': 'cliente',
            'empresa_id': company.pk,
        })


class CompaniesView(MobileAPIView):
    def get(self, request):
        company = self.company(request)
        return Response([{
            'id': company.pk,
            'nome': company.nome,
            'razao_social': company.razao_social,
            'cnpj': company.cnpj,
            'email': company.email,
            'telefone': company.telefone,
            'regime_tributario': company.regime_tributario,
        }])


class ClientRequestsView(MobileAPIView):
    def get(self, request):
        items = SolicitacaoCliente.objects.filter(empresa=self.company(request))[:200]
        return Response([self._data(item) for item in items])

    def post(self, request):
        tipo = str(request.data.get('tipo', '')).strip()
        assunto = str(request.data.get('assunto', '')).strip()
        mensagem = str(request.data.get('mensagem', '')).strip()
        if tipo not in dict(SolicitacaoCliente.TIPO_CHOICES) or not assunto:
            raise ValidationError({'detail': 'Informe um tipo e um assunto válidos.'})
        item = SolicitacaoCliente.objects.create(
            empresa=self.company(request), usuario=request.user, tipo=tipo,
            assunto=assunto[:180], mensagem=mensagem,
        )
        return Response(self._data(item), status=status.HTTP_201_CREATED)

    @staticmethod
    def _data(item):
        return {
            'id': item.pk, 'tipo': item.tipo, 'assunto': item.assunto,
            'mensagem': item.mensagem, 'status': item.status,
            'criada_em': item.criada_em, 'atualizada_em': item.atualizada_em,
        }


class NotificationsView(MobileAPIView):
    def get(self, request):
        items = Notificacao.objects.filter(destinatario=request.user)[:200]
        return Response([{
            'id': item.pk, 'message': item.mensagem, 'timestamp': item.timestamp, 'read': item.lida,
        } for item in items])

    def patch(self, request, notification_id):
        item = Notificacao.objects.filter(pk=notification_id, destinatario=request.user).first()
        if not item:
            return Response({'detail': 'Notificação não encontrada.'}, status=404)
        item.lida = bool(request.data.get('read', True))
        item.save(update_fields=['lida'])
        return Response({'id': item.pk, 'read': item.lida})


def _period(value):
    normalized = re.sub(r'\D', '', str(value or ''))
    if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', normalized):
        raise ValidationError({'periodo': 'Use uma competência válida no formato AAAAMM.'})
    return normalized


def _das_document(company, period):
    return find_reusable_document(company, 'das_simples', period, visible_only=True)


def _pdf_response(document):
    return FileResponse(
        document.caminho_arquivo.storage.open(document.caminho_arquivo.name, 'rb'),
        as_attachment=True, filename=document.nome_arquivo, content_type='application/pdf',
    )


def _usage_key(action, now):
    return now.strftime('%Y%m') if action == 'gerar_das' else now.strftime('%Y%m%d')


class GuideLimitsView(MobileAPIView):
    def get(self, request):
        company = self.company(request)
        now = timezone.localtime()
        monthly = _usage_key('gerar_das', now)
        daily = _usage_key('recalcular_das', now)
        used = set(SimplesApiUsage.objects.filter(
            empresa=company,
            period_key__in=(monthly, daily),
        ).values_list('action', flat=True))
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        next_month = (now.replace(day=28) + timedelta(days=4)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return Response({
            'generate_available': 'gerar_das' not in used,
            'recalculate_available': 'recalcular_das' not in used,
            'statement_available': 'gerar_extrato' not in used,
            'generation_resets_at': next_month,
            'daily_resets_at': tomorrow,
        })


class GuideActionView(MobileAPIView):
    action = ''

    def post(self, request):
        company = self.company(request)
        period = _period(request.data.get('periodo'))
        das = _das_document(company, period)
        existing = (
            find_reusable_document(company, 'extrato_simples', period, visible_only=True)
            if self.action == 'gerar_extrato' else das
        )
        if self.action in ('gerar_das', 'gerar_extrato') and existing:
            return _pdf_response(existing)
        if self.action == 'recalcular_das' and not das:
            raise ValidationError({'detail': 'Gere a guia desta competência antes de recalculá-la.'})

        now = timezone.localtime()
        key = _usage_key(self.action, now)
        with transaction.atomic():
            usage, created = SimplesApiUsage.objects.get_or_create(
                empresa=company, action=self.action, period_key=key,
                defaults={'usuario': request.user, 'competencia': period},
            )
        if not created:
            message = 'Este recurso já foi utilizado no período permitido.'
            return Response({'detail': message}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            if self.action == 'gerar_extrato':
                result = orquestrar_consulta_extrato(company.cnpj, period)
            else:
                result = gerar_das_serpro(company.cnpj, period)
            if not result.get('sucesso'):
                raise serializers.ValidationError({'detail': result.get('erro', 'Não foi possível concluir a solicitação.')})
            if self.action == 'gerar_extrato':
                document = save_generated_fiscal_document(company.cnpj, period, 'extrato_simples', result['pdf_content'])
            else:
                document = save_generated_das(
                    company.cnpj, period, result['pdf_content'],
                    force_new_version=self.action == 'recalcular_das', generated_by=request.user,
                )
            return _pdf_response(document)
        except Exception:
            usage.delete()
            raise


class DctfWebView(MobileAPIView):
    def get(self, request):
        company = self.company(request)
        docs = DocumentoEmpresa.objects.filter(
            empresa=company, tipo_documento__codigo='guia_inss',
            visivel_no_app=True, status='disponivel',
        )[:200]
        result = []
        for doc in docs:
            if not doc.ano or not doc.mes:
                continue
            competence = f'{doc.ano}-{str(doc.mes).zfill(2)}-01'
            result.append({
                'id': doc.pk, 'competencia': competence, 'status': 'transmitida',
                'status_display': 'Guia disponível', 'valor_debito': '0.00',
                'vencimento': None, 'numero_recibo': None, 'transmitida_em': None,
                'recibo': None, 'darf': _document_url(request, doc),
                'observacao': None, 'atualizada_em': doc.criado_em,
            })
        return Response(result)


class InstallmentsView(MobileAPIView):
    def get(self, request):
        company = self.company(request)
        docs = list(DocumentoEmpresa.objects.filter(
            empresa=company, tipo_documento__codigo='guia_parcelamento_simples',
            visivel_no_app=True, status='disponivel',
        )[:200])
        if not docs:
            return Response([])
        installments = []
        for index, doc in enumerate(reversed(docs), start=1):
            year = int(doc.ano or timezone.localdate().year)
            month = int(doc.mes or 1)
            due = timezone.datetime(year, month, 20).date()
            installments.append({
                'id': doc.pk, 'numero': index, 'vencimento': due,
                'valor': '0.00', 'status': 'em_aberto', 'status_display': 'Guia disponível',
                'paga_em': None, 'guia': _document_url(request, doc),
            })
        return Response([{
            'id': company.pk, 'numero': 'Parcelamento Simples Nacional',
            'data_adesao': docs[-1].criado_em.date(), 'status': 'ativo',
            'status_display': 'Ativo', 'valor_consolidado': '0.00',
            'total_parcelas': len(installments), 'comprovante': None,
            'observacao': 'Guias disponíveis no sistema Inovar.', 'parcelas': installments,
        }])

    def post(self, request):
        company = self.company(request)
        cache_key = f'mobile:parcelas-simples:{company.pk}'
        parcels = cache.get(cache_key)
        if parcels is None:
            result = consultar_parcelas_parcsn_serpro(company.cnpj)
            if not result.get('sucesso'):
                message = result.get('erro') or 'Não foi possível consultar o parcelamento.'
                normalized_message = message.casefold()
                no_active_installment = (
                    'nenhuma parcela' in normalized_message
                    or 'não há parcelamento ativo' in normalized_message
                    or 'nao ha parcelamento ativo' in normalized_message
                    or 'não possui parcelamento ativo' in normalized_message
                    or 'nao possui parcelamento ativo' in normalized_message
                )
                if no_active_installment:
                    parcels = []
                else:
                    raise ValidationError({'detail': message})
            else:
                parcels = result.get('parcelas') or []
            cache.set(cache_key, parcels, timeout=300)

        saved_documents = DocumentoEmpresa.objects.filter(
            empresa=company,
            tipo_documento__codigo='guia_parcelamento_simples',
            visivel_no_app=True,
            status='disponivel',
        )
        saved_by_period = {
            item.competencia or f'{item.ano or ""}{str(item.mes or "").zfill(2)}': item
            for item in saved_documents
        }
        response_items = []
        for raw in parcels:
            period = re.sub(r'\D', '', str(raw.get('parcela') or ''))
            if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', period):
                continue
            saved = saved_by_period.get(period)
            response_items.append({
                'parcela': period,
                'valor': raw.get('valor') or '0.00',
                'arquivo': _document_url(request, saved) if saved else None,
                'nome_arquivo': saved.nome_arquivo if saved else None,
            })
        response_items.sort(key=lambda item: item['parcela'])
        return Response({'parcelas': response_items})


class InstallmentGuideView(MobileAPIView):
    def post(self, request, period):
        company = self.company(request)
        normalized_period = re.sub(r'\D', '', str(period or ''))
        if not re.fullmatch(r'\d{4}(0[1-9]|1[0-2])', normalized_period):
            raise ValidationError({'detail': 'Parcela inválida.'})

        existing = find_reusable_document(
            company, 'guia_parcelamento_simples', normalized_period,
        )
        if existing:
            return _pdf_response(existing)

        result = gerar_das_parcsn_serpro(company.cnpj, normalized_period)
        if not result.get('sucesso'):
            raise ValidationError({
                'detail': result.get('erro') or 'Não foi possível gerar a guia da parcela.',
            })
        document = save_generated_fiscal_document(
            company.cnpj,
            normalized_period,
            'parcelamento_sn',
            result['file_content'],
        )
        return _pdf_response(document)
