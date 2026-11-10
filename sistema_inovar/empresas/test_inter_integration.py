import json
from decimal import Decimal
from unittest.mock import Mock, patch

from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse

from . import inter_service
from .models import BoletoBB, Empresa
from .views import _existing_inter_request_code


INTER_TEST_SETTINGS = {
    'INTER_CLIENT_ID': 'client-id',
    'INTER_CLIENT_SECRET': 'client-secret',
    'INTER_CERT_PATH': __file__,
    'INTER_KEY_PATH': __file__,
    'INTER_OAUTH_URL': 'https://inter.test/oauth/v2/token',
    'INTER_API_BASE_URL': 'https://inter.test/cobranca/v3',
    'INTER_SCOPE': 'boleto-cobranca.read boleto-cobranca.write',
    'INTER_CONTA_CORRENTE': '123456',
    'INTER_REQUEST_TIMEOUT': 30,
}


@override_settings(**INTER_TEST_SETTINGS)
class InterServiceTests(SimpleTestCase):
    def setUp(self):
        inter_service.reset_token_cache()

    @patch('empresas.inter_service.requests.post')
    def test_token_is_reused_and_uses_mtls(self, post):
        post.return_value = Mock(
            status_code=200,
            json=lambda: {'access_token': 'token', 'expires_in': 3600},
        )

        first = inter_service.get_access_token()
        second = inter_service.get_access_token()

        self.assertEqual(first, 'token')
        self.assertEqual(second, 'token')
        self.assertEqual(post.call_count, 1)
        self.assertEqual(post.call_args.kwargs['cert'], (__file__, __file__))
        self.assertEqual(
            post.call_args.kwargs['data']['scope'],
            'boleto-cobranca.read boleto-cobranca.write',
        )

    @patch('empresas.inter_service.requests.request')
    @patch('empresas.inter_service.get_access_token', return_value='token')
    def test_issue_billing_sends_account_and_returns_request_code(self, _, request):
        request.return_value = Mock(
            status_code=200,
            json=lambda: {'codigoSolicitacao': 'code-123'},
        )

        code, response = inter_service.issue_billing({'seuNumero': 'I1202610'})

        self.assertEqual(code, 'code-123')
        self.assertEqual(response['codigoSolicitacao'], 'code-123')
        self.assertEqual(
            request.call_args.kwargs['headers']['x-conta-corrente'],
            '123456',
        )
        self.assertEqual(request.call_args.kwargs['cert'], (__file__, __file__))

    def test_extracts_existing_billing_request_code_from_duplicate_error(self):
        request_code = 'b6b75354-2652-4324-a870-7b3a2cdcc797'
        error = inter_service.InterAPIError(
            'A API do Banco Inter recusou a operacao.',
            status_code=400,
            response_body={
                'detail': (
                    'Não será possível emitir a cobrança. Pois, existe uma cobrança '
                    'emitida há poucos minutos com os mesmos dados com a situação '
                    '“a receber” com código de solicitação: ' + request_code + '.'
                ),
            },
        )

        self.assertEqual(_existing_inter_request_code(error), request_code)

    def test_does_not_recover_request_code_from_unrelated_error(self):
        error = inter_service.InterAPIError(
            'A API do Banco Inter recusou a operacao.',
            status_code=400,
            response_body={'detail': 'Pagador inválido.'},
        )

        self.assertIsNone(_existing_inter_request_code(error))


class InterWebhookTests(TestCase):
    def setUp(self):
        self.empresa = Empresa.objects.create(
            nome='Empresa Teste',
            cnpj='11222333000181',
            telefone='11999999999',
        )
        self.boleto = BoletoBB.objects.create(
            empresa=self.empresa,
            numero_convenio='INTER',
            numero_operacao='I1202610',
            numero_titulo_cliente='code-123',
            nosso_numero='123456789',
            valor_original=Decimal('100.00'),
            status='registrado',
            payload_registro={'provider': 'banco_inter'},
        )

    def test_paid_callback_updates_billing(self):
        response = self.client.post(
            reverse('inter_cobranca_webhook'),
            data=json.dumps([{
                'codigoSolicitacao': 'code-123',
                'seuNumero': 'I1202610',
                'situacao': 'RECEBIDO',
                'dataHoraSituacao': '2026-11-10T14:30:00-03:00',
                'valorTotalRecebido': '100.00',
                'origemRecebimento': 'PIX',
            }]),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200)
        self.boleto.refresh_from_db()
        self.assertEqual(self.boleto.status, 'pago')
        self.assertEqual(self.boleto.valor_pago, Decimal('100.00'))
        self.assertEqual(self.boleto.data_pagamento.isoformat(), '2026-11-10')
        self.assertEqual(self.boleto.payload_baixa['origemRecebimento'], 'PIX')

    def test_inter_uuid_fits_legacy_billing_record(self):
        request_code = '12345678-1234-1234-1234-123456789012'

        boleto = BoletoBB.objects.create(
            empresa=self.empresa,
            numero_convenio='INTER',
            numero_operacao='I2202611',
            numero_titulo_cliente=request_code,
            nosso_numero=request_code,
            valor_original=Decimal('100.00'),
        )

        boleto.refresh_from_db()
        self.assertEqual(boleto.numero_titulo_cliente, request_code)
        self.assertEqual(boleto.nosso_numero, request_code)
