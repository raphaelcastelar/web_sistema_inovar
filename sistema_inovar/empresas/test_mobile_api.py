import shutil
import tempfile
from unittest.mock import patch

from django.core.files.base import ContentFile
from django.test import override_settings
from rest_framework.test import APITestCase

from .document_storage import save_generated_das
from .models import DocumentoEmpresa, Empresa, Funcionario, SimplesApiUsage, TipoDocumento


TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix='inovar-mobile-tests-')


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT)
class MobileApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        self.company = Empresa.objects.create(nome='Empresa Cliente', cnpj='11.111.111/0001-11')
        self.other_company = Empresa.objects.create(nome='Outra Empresa', cnpj='22.222.222/0001-22')
        self.client_user = Funcionario.objects.create_user(
            username='11111111000111', password='senha-segura', cargo='cliente',
        )
        self.company.usuarios.add(self.client_user)
        self.internal_user = Funcionario.objects.create_user(
            username='interno', password='senha-segura', cargo='fiscal',
        )

    def authenticate_client(self):
        self.client.force_authenticate(self.client_user)

    def create_document(self, company=None, name='CONTRATO_SOCIAL.pdf', folder='constitutivos_societario'):
        company = company or self.company
        document = DocumentoEmpresa(
            empresa=company, folder_key=folder, nome_arquivo=name, ano='2026', mes='11',
        )
        document.caminho_arquivo.save(name, ContentFile(b'%PDF-1.4\nteste'), save=True)
        return document

    def test_mobile_token_rejects_internal_user(self):
        response = self.client.post('/api/mobile/token/', {
            'username': 'interno', 'password': 'senha-segura',
        })
        self.assertEqual(response.status_code, 403)

    def test_client_only_sees_and_downloads_own_documents(self):
        own = self.create_document()
        foreign = self.create_document(self.other_company, 'CONTRATO_OUTRA.pdf')
        self.authenticate_client()

        response = self.client.get('/api/mobile/documentos-constitutivos/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json()], [own.pk])
        self.assertEqual(self.client.get(f'/api/mobile/files/{own.pk}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/mobile/files/{foreign.pk}/').status_code, 404)

    def test_document_type_comes_from_metadata_not_filename(self):
        document = DocumentoEmpresa(
            empresa=self.company,
            tipo_documento=TipoDocumento.objects.get(codigo='contrato_social'),
            folder_key='constitutivos_societario',
            nome_arquivo='arquivo_sem_nome_identificavel.pdf',
        )
        document.caminho_arquivo.save(document.nome_arquivo, ContentFile(b'%PDF-1.4\nteste'), save=True)
        self.authenticate_client()

        response = self.client.get('/api/mobile/documentos-constitutivos/')
        item = next(item for item in response.json() if item['id'] == document.pk)
        self.assertEqual(item['tipo_codigo'], 'contrato_social')
        self.assertEqual(item['tipo_documento'], 'Contrato social')
        self.assertEqual(item['categoria'], 'constitutivo')

    def test_hidden_document_is_not_listed_or_downloadable(self):
        document = self.create_document()
        document.visivel_no_app = False
        document.save(update_fields=['visivel_no_app'])
        self.authenticate_client()

        response = self.client.get('/api/mobile/documentos-constitutivos/')
        self.assertNotIn(document.pk, [item['id'] for item in response.json()])
        self.assertEqual(self.client.get(f'/api/mobile/files/{document.pk}/').status_code, 404)

    def test_client_request_is_bound_to_authenticated_company(self):
        self.authenticate_client()
        response = self.client.post('/api/mobile/solicitacoes-clientes/', {
            'tipo': 'documento', 'assunto': 'Certidão', 'mensagem': 'Preciso da certidão.',
            'empresa': self.other_company.pk,
        })
        self.assertEqual(response.status_code, 201)
        request_id = response.json()['id']
        item = self.company.solicitacoes_clientes.get(pk=request_id)
        self.assertEqual(item.usuario, self.client_user)
        self.assertFalse(self.other_company.solicitacoes_clientes.filter(pk=request_id).exists())

    @patch('empresas.mobile_api.gerar_das_serpro')
    def test_existing_das_is_reused_and_does_not_consume_api_limit(self, generate):
        document = self.create_document(name='DAS_11111111000111_202611.pdf', folder='fiscal_guias')
        self.authenticate_client()
        response = self.client.post('/api/mobile/serpro/gerar-das/', {'periodo': '202611'})
        self.assertEqual(response.status_code, 200)
        generate.assert_not_called()
        self.assertFalse(SimplesApiUsage.objects.exists())
        self.assertEqual(document.empresa, self.company)

    @patch('empresas.mobile_api.gerar_das_serpro')
    def test_monthly_generation_limit_is_enforced(self, generate):
        generate.return_value = {'sucesso': True, 'pdf_content': b'%PDF-1.4\ngerado'}
        self.authenticate_client()
        first = self.client.post('/api/mobile/serpro/gerar-das/', {'periodo': '202610'})
        second = self.client.post('/api/mobile/serpro/gerar-das/', {'periodo': '202609'})
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        self.assertEqual(generate.call_count, 1)

    @patch('empresas.mobile_api.orquestrar_consulta_extrato')
    def test_existing_statement_is_reused_without_external_call_or_quota(self, statement):
        self.create_document(
            name='EXTRATO_SIMPLES_11111111000111_202611.pdf', folder='fiscal_extratos',
        )
        self.authenticate_client()
        response = self.client.post('/api/mobile/serpro/consultar-extrato/', {'periodo': '202611'})
        self.assertEqual(response.status_code, 200)
        statement.assert_not_called()
        self.assertFalse(SimplesApiUsage.objects.filter(action='gerar_extrato').exists())

    def test_recalculation_requires_saved_das(self):
        self.authenticate_client()
        response = self.client.post('/api/mobile/serpro/recalcular-das/', {'periodo': '202611'})
        self.assertEqual(response.status_code, 400)

    def test_recalculation_preserves_previous_version(self):
        original = self.create_document(
            name='DAS_11111111000111_202611.pdf', folder='fiscal_guias',
        )
        recalculated = save_generated_das(
            self.company.cnpj, '202611', b'%PDF-1.4\nrecalculado', force_new_version=True,
        )
        original.refresh_from_db()

        self.assertEqual(original.status, 'substituido')
        self.assertIn('_V1.pdf', original.nome_arquivo)
        self.assertEqual(recalculated.status, 'disponivel')
        self.assertEqual(recalculated.versao, 2)
        self.assertEqual(recalculated.documento_anterior, original)
