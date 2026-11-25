from django.core.management.base import BaseCommand
from django.utils import timezone

from monitor_fiscal import alertas
from monitor_fiscal.auditoria import auditar_empresa
from monitor_fiscal.models import ConfiguracaoMonitorFiscal, DocumentoFiscal


class Command(BaseCommand):
    help = 'Rotinas diárias: alertas de certificado, manifestações pendentes e auditoria inicial.'

    def handle(self, *args, **opcoes):
        certificados = alertas.verificar_certificados()
        pendentes = 0
        limite = timezone.now() - timezone.timedelta(days=15)
        for doc in DocumentoFiscal.objects.filter(
            situacao_manifestacao__in=['nao_manifestada', 'ciencia'], situacao_fiscal='autorizado',
            data_emissao__lt=limite, empresa__monitor_fiscal__ativo=True,
        ).select_related('empresa')[:2000]:
            if alertas.alerta_documento('manifestacao_pendente', doc.empresa, doc):
                pendentes += 1
        ocorrencias = 0
        for config in ConfiguracaoMonitorFiscal.objects.filter(ativo=True).select_related('empresa'):
            ocorrencias += auditar_empresa(config.empresa, config.ambiente)
        self.stdout.write(self.style.SUCCESS(
            f'Alertas de certificado: {certificados}; manifestações pendentes: {pendentes}; ocorrências: {ocorrencias}.'
        ))
