from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.response import Response
from rest_framework.test import APIClient

from .models import BoletoBB, Empresa, Funcionario


class BoletoProviderTests(TestCase):
    def setUp(self):
        media_dir = TemporaryDirectory()
        self.addCleanup(media_dir.cleanup)
        self.enterContext(override_settings(MEDIA_ROOT=media_dir.name))
        self.client = APIClient()
        self.user = Funcionario.objects.create_user(
            username='admin-boleto',
            password='senha-segura',
            cargo='admin',
            is_staff=True,
        )
        self.client.force_authenticate(self.user)
        self.empresa = Empresa.objects.create(
            nome='Empresa Teste Boleto',
            cnpj='11222333000181',
            telefone='11999999999',
            valor_honorario='100.00',
        )

    def test_new_company_uses_inter_by_default(self):
        self.assertEqual(
            self.empresa.banco_emissor_boleto,
            Empresa.BANCO_BOLETO_INTER,
        )

    @patch('empresas.views._gerar_boleto_inter')
    def test_inter_company_uses_inter_flow(self, gerar_inter):
        gerar_inter.return_value = Response({'provider': 'inter'})

        response = self.client.post(
            reverse('gerar_boleto'),
            {'empresa_id': self.empresa.id, 'competencia': '202611', 'action': 'gerar'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['provider'], 'inter')
        gerar_inter.assert_called_once()

    @patch('empresas.views.salvar_boleto_honorario')
    @patch('empresas.views.pdfkit.configuration')
    @patch('empresas.views.pdfkit.from_string', return_value=b'%PDF-test')
    @patch('empresas.views.requests.post')
    @patch('empresas.views.get_bb_access_token', return_value='test-token')
    @patch('empresas.views._gerar_boleto_inter')
    def test_saved_banco_do_brasil_preference_controls_new_issues(
        self, gerar_inter, get_bb_token, bb_post, render_pdf, pdf_config, salvar_pdf,
    ):
        empresa_url = reverse('empresas-detail', args=[self.empresa.id])
        selected_bank = Empresa.BANCO_BOLETO_BANCO_DO_BRASIL
        response = self.client.patch(empresa_url, {'banco_emissor_boleto': selected_bank}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['banco_emissor_boleto'], selected_bank)
        companies = self.client.get(reverse('empresas-list'), {'all': 'true'}).data
        self.assertEqual(companies[0]['banco_emissor_boleto'], selected_bank)

        bb_post.return_value = Mock(status_code=201, text='', json=lambda: {
            'numero': '00012345670000000001',
            'linhaDigitavel': '00190000090283470000000000000000000000000010000',
        })
        salvar_pdf.return_value = Mock(
            nome_arquivo='honorario.pdf',
            caminho_arquivo=Mock(url='/media/honorario.pdf'),
        )
        salvar_pdf.return_value.caminho_arquivo.name = 'honorario.pdf'

        response = self.client.post(
            reverse('gerar_boleto'),
            {'empresa_id': self.empresa.id, 'competencia': '202611', 'action': 'gerar'},
            format='json',
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['success'])
        boleto = BoletoBB.objects.get(empresa=self.empresa)
        self.assertEqual(boleto.nosso_numero, '00012345670000000001')
        self.assertEqual(bb_post.call_args.kwargs['json']['valorOriginal'], 100.00)

        response = self.client.patch(
            empresa_url, {'banco_emissor_boleto': Empresa.BANCO_BOLETO_INTER}, format='json',
        )
        self.assertEqual(response.status_code, 200)
        response = self.client.post(
            reverse('gerar_boleto'),
            {'empresa_id': self.empresa.id, 'competencia': '202611', 'action': 'gerar'},
            format='json',
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data['boleto_id'], boleto.id)
        gerar_inter.assert_not_called()
        get_bb_token.assert_called_once()
        bb_post.assert_called_once()
