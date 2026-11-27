import base64
import json
import shutil
import tempfile
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APITestCase

from . import sitfis_service
from .models import DocumentoEmpresa, Empresa, Funcionario

PDF = b'%PDF-1.4 relatorio de situacao fiscal'
CNPJ = '11222333000181'
TOKENS = {'access_token': 'a', 'jwt_token': 'j'}
TEST_MEDIA_ROOT = tempfile.mkdtemp(prefix='inovar-sitfis-tests-')


class Resposta:
    def __init__(self, status, corpo=None, headers=None):
        self.status_code = status
        self._corpo = corpo
        self.headers = headers or {}
        self.text = json.dumps(corpo) if corpo is not None else ''

    def json(self):
        if self._corpo is None:
            raise ValueError('sem corpo')
        return self._corpo


def corpo(status, dados=None, codigo='[Sucesso-Sitfis-SC01]'):
    return {
        'status': status,
        'dados': json.dumps(dados) if dados is not None else '',
        'mensagens': [{'codigo': codigo, 'texto': 'A requisição foi efetuada com sucesso.'}],
    }


def protocolo(espera=0):
    return Resposta(200, corpo(200, {'protocoloRelatorio': 'PROTO-1', 'tempoEspera': espera}))


def relatorio_pronto():
    return Resposta(200, corpo(200, [{'pdf': base64.b64encode(PDF).decode()}]))


class Relogio:
    def __init__(self):
        self.agora = 0.0
        self.esperas = []

    def __call__(self):
        return self.agora

    def dormir(self, segundos):
        self.esperas.append(segundos)
        self.agora += segundos


@override_settings(MEU_ESCRITORIO_CNPJ='99888777000166')
class FluxoSitfisTests(TestCase):
    def setUp(self):
        cache.clear()
        self.relogio = Relogio()
        patcher = patch.object(sitfis_service, 'get_serpro_token', return_value=dict(TOKENS))
        patcher.start()
        self.addCleanup(patcher.stop)

    def executar(self, respostas, prazo=40):
        with patch.object(sitfis_service.requests, 'post', side_effect=respostas) as post:
            resultado = sitfis_service.obter_relatorio_situacao_fiscal(
                CNPJ, prazo_segundos=prazo, dormir=self.relogio.dormir, relogio=self.relogio,
            )
        return resultado, post

    def test_fluxo_completo_apoiar_e_emitir(self):
        resultado, post = self.executar([protocolo(espera=3000), relatorio_pronto()])
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(resultado['file_content'], PDF)
        self.assertEqual(self.relogio.esperas, [3.0])
        apoiar, emitir = [chamada.kwargs['json'] for chamada in post.call_args_list]
        self.assertTrue(post.call_args_list[0].args[0].endswith('/Apoiar'))
        self.assertTrue(post.call_args_list[1].args[0].endswith('/Emitir'))
        self.assertEqual(apoiar['pedidoDados'], {
            'idSistema': 'SITFIS', 'idServico': 'SOLICITARPROTOCOLO91', 'versaoSistema': '2.0', 'dados': '',
        })
        self.assertEqual(emitir['pedidoDados']['idServico'], 'RELATORIOSITFIS92')
        self.assertEqual(json.loads(emitir['pedidoDados']['dados']), {'protocoloRelatorio': 'PROTO-1'})
        self.assertEqual(apoiar['contribuinte'], {'numero': CNPJ, 'tipo': 2})
        self.assertEqual(apoiar['contratante'], {'numero': '99888777000166', 'tipo': 2})
        # Protocolo usado é descartado: a próxima emissão gera relatório novo.
        self.assertIsNone(cache.get(sitfis_service.chave_cache_protocolo(CNPJ)))

    def test_emitir_em_processamento_202_e_204_aguarda_e_repete(self):
        respostas = [
            protocolo(),
            Resposta(202, corpo(202, {'tempoEspera': 2000}, '[Sucesso-Sitfis-SC02]')),
            Resposta(204, None, {'ETag': '"tempoEspera:5000"'}),
            relatorio_pronto(),
        ]
        resultado, post = self.executar(respostas)
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(self.relogio.esperas, [2.0, 5.0])
        self.assertEqual(post.call_count, 4)

    def test_prazo_esgotado_devolve_pendente_e_reaproveita_protocolo(self):
        resultado, post = self.executar([protocolo(espera=30000)], prazo=10)
        self.assertTrue(resultado['pendente'])
        self.assertEqual(resultado['espera_ms'], 30000)
        self.assertEqual(post.call_count, 1)
        self.assertEqual(cache.get(sitfis_service.chave_cache_protocolo(CNPJ)), 'PROTO-1')

        # Nova tentativa não paga outro /Apoiar.
        self.relogio.agora = 0
        resultado, post = self.executar([relatorio_pronto()])
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(post.call_count, 1)
        self.assertTrue(post.call_args.args[0].endswith('/Emitir'))

    def test_apoiar_pede_espera_av03(self):
        respostas = [
            Resposta(503, corpo(503, {'tempoEspera': 4000}, '[Aviso-Sitfis-AV03]')),
            protocolo(),
            relatorio_pronto(),
        ]
        resultado, _ = self.executar(respostas)
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(self.relogio.esperas, [4.0])

    def test_protocolo_invalido_reinicia_apoiar(self):
        cache.set(sitfis_service.chave_cache_protocolo(CNPJ), 'VELHO')
        respostas = [
            Resposta(500, corpo(500, None, '[Erro-Sitfis-ER05]')),
            protocolo(),
            relatorio_pronto(),
        ]
        resultado, post = self.executar(respostas)
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(json.loads(post.call_args_list[0].kwargs['json']['pedidoDados']['dados']),
                         {'protocoloRelatorio': 'VELHO'})

    def test_erro_funcional_devolve_mensagem_da_receita(self):
        erro = {'status': 400, 'dados': '', 'mensagens': [
            {'codigo': '[EntradaIncorreta-Sitfis-EI01]', 'texto': 'Requisição inválida.'}]}
        resultado, _ = self.executar([Resposta(400, erro)])
        self.assertFalse(resultado['sucesso'])
        self.assertIn('Requisição inválida', resultado['erro'])

    def test_protocolo_no_etag_com_304(self):
        respostas = [Resposta(304, None, {'ETag': 'protocoloRelatorio:PROTO-ETAG'}), relatorio_pronto()]
        resultado, post = self.executar(respostas)
        self.assertTrue(resultado['sucesso'])
        self.assertEqual(json.loads(post.call_args_list[1].kwargs['json']['pedidoDados']['dados']),
                         {'protocoloRelatorio': 'PROTO-ETAG'})

    def test_limita_chamadas_de_emissao(self):
        processando = [Resposta(202, corpo(202, {'tempoEspera': 1000}, '[Sucesso-Sitfis-SC02]'))
                       for _ in range(sitfis_service.MAX_CHAMADAS_EMITIR)]
        resultado, post = self.executar([protocolo(), *processando], prazo=600)
        self.assertTrue(resultado['pendente'])
        self.assertEqual(post.call_count, 1 + sitfis_service.MAX_CHAMADAS_EMITIR)


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, MEU_ESCRITORIO_CNPJ='99888777000166')
class SitfisApiTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEST_MEDIA_ROOT, ignore_errors=True)

    def setUp(self):
        cache.clear()
        self.empresa = Empresa.objects.create(nome='Empresa Sitfis', cnpj='11.222.333/0001-81')
        self.user = Funcionario.objects.create_user(username='contador', password='x', cargo='contador')
        self.client.force_authenticate(self.user)

    def emitir(self, **dados):
        return self.client.post('/api/serpro/sitfis/emitir/', {'cnpj': CNPJ, **dados}, format='json')

    @patch('empresas.sitfis_views.obter_relatorio_situacao_fiscal')
    def test_emite_salva_e_reaproveita_no_mesmo_dia(self, obter):
        obter.return_value = {'sucesso': True, 'file_content': PDF, 'filename': 'x.pdf', 'content_type': 'application/pdf'}
        resposta = self.emitir()
        self.assertEqual(resposta.status_code, 200)
        self.assertEqual(resposta['X-Sitfis-Origem'], 'emitido')
        documento = DocumentoEmpresa.objects.get(tipo_documento__codigo='situacao_fiscal')
        self.assertTrue(documento.nome_arquivo.startswith(f'SITUACAO_FISCAL_{CNPJ}_'))
        self.assertEqual(documento.folder_key, 'fiscal_extratos')
        self.assertFalse(documento.visivel_no_app)

        segunda = self.emitir()
        self.assertEqual(segunda.status_code, 200)
        self.assertEqual(segunda['X-Sitfis-Origem'], 'reaproveitado')
        self.assertEqual(b''.join(segunda.streaming_content), PDF)
        self.assertEqual(obter.call_count, 1)

        forcada = self.emitir(forcar=True)
        self.assertEqual(forcada.status_code, 200)
        self.assertEqual(obter.call_count, 2)
        self.assertEqual(DocumentoEmpresa.objects.filter(tipo_documento__codigo='situacao_fiscal').count(), 1)

        ultimos = self.client.get('/api/serpro/sitfis/ultimos/').json()['ultimos']
        self.assertEqual(ultimos[str(self.empresa.id)]['id'], documento.id)
        baixado = self.client.get(f'/api/serpro/sitfis/documento/{documento.id}/')
        self.assertEqual(b''.join(baixado.streaming_content), PDF)

    @patch('empresas.sitfis_views.obter_relatorio_situacao_fiscal')
    def test_pendente_devolve_202(self, obter):
        obter.return_value = {'sucesso': False, 'pendente': True, 'espera_ms': 8000, 'mensagem': 'gerando'}
        resposta = self.emitir()
        self.assertEqual(resposta.status_code, 202)
        self.assertEqual(resposta.json()['espera_ms'], 8000)

    def test_empresa_nao_cadastrada(self):
        resposta = self.client.post('/api/serpro/sitfis/emitir/', {'cnpj': '11222333000262'}, format='json')
        self.assertEqual(resposta.status_code, 404)

    def test_exige_autenticacao(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.emitir().status_code, 401)
