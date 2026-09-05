import importlib
import os
import tempfile
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.core.files.storage import FileSystemStorage

from .folder_structure import create_company_folder_structure
from .management.commands.migrar_estrutura_pastas_2026 import Command
from .management.commands.inventariar_arquivos import _relative_path, scan_media_root
from .utils import gerar_nome_pasta_empresa_padronizado, normalizar_nome_empresa
from .views import _ensure_sync_safe_filename, _repair_surrogate_escapes, normalize_bb_emission_date
from .serpro_service import gerar_das_serpro, orquestrar_consulta_extrato
from .document_storage import _atomic_storage_write
from .management.commands.migrar_arquivos_para_nuvem import _safe_directory, _source_directories


class NomeEmpresaTest(SimpleTestCase):
    def test_remove_cedilha_acentos_e_normaliza_espacos(self):
        self.assertEqual(
            normalizar_nome_empresa('  Açougue   Pontês  '),
            'ACOUGUE PONTES',
        )

    def test_remove_caracteres_invalidos_para_pasta(self):
        self.assertEqual(
            gerar_nome_pasta_empresa_padronizado('Empresa: Teste/ES'),
            'EMPRESA TESTEES',
        )


class EstruturaPastasTest(SimpleTestCase):
    def test_cria_nova_arvore_com_mes_apenas_numerico(self):
        with tempfile.TemporaryDirectory() as company_path:
            create_company_folder_structure(company_path, years=('2026',))
            self.assertTrue(os.path.isdir(os.path.join(company_path, 'CONSTITUTIVOS', 'OUTROS')))
            self.assertTrue(os.path.isdir(os.path.join(company_path, 'PESSOAL', 'GUIAS', '2026', '08')))
            self.assertTrue(os.path.isdir(os.path.join(company_path, 'FISCAL', 'DECLARACOES', '2026')))
            self.assertFalse(os.path.exists(os.path.join(company_path, 'PESSOAL', 'GUIAS', '2026', '082026')))

    def test_migracao_preserva_somente_constitutivos_e_pessoal_agosto_2026(self):
        with tempfile.TemporaryDirectory() as media_root:
            company_path = os.path.join(media_root, 'EMPRESA TESTE')
            paths = {
                'constitutivo': os.path.join(company_path, 'DOCUMENTOS CONSTITUTIVOS', 'contrato.pdf'),
                'pessoal': os.path.join(company_path, 'DEPARTAMENTO PESSOAL', '2026', '082026', 'guia.pdf'),
                'antigo': os.path.join(company_path, 'XML', '2025', '012025', 'apagar.xml'),
            }
            for path in paths.values():
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'w', encoding='utf-8') as file:
                    file.write('teste')

            command = Command()
            command._cleanup_database = lambda *args: None
            stats = command._migrate_company(company_path, 'EMPRESA TESTE', execute=True)

            self.assertEqual(stats, {'preserve': 2, 'delete': 1})
            self.assertTrue(os.path.isfile(os.path.join(company_path, 'CONSTITUTIVOS', 'OUTROS', 'contrato.pdf')))
            self.assertTrue(os.path.isfile(os.path.join(company_path, 'PESSOAL', 'GUIAS', '2026', '08', 'guia.pdf')))
            self.assertFalse(os.path.exists(os.path.join(company_path, 'XML')))


class NomeArquivoSincronizacaoTest(SimpleTestCase):
    def test_repara_byte_cp1252_exposto_como_surrogate_escape(self):
        self.assertEqual(
            _repair_surrogate_escapes('CONTRIBUI\udcc7AO.pdf'),
            'CONTRIBUIÇAO.pdf',
        )

    @patch('empresas.views.os.path.exists', return_value=False)
    @patch('empresas.views.os.replace')
    def test_renomeia_arquivo_invalido_para_nome_compativel_com_utf8(
        self,
        replace_mock,
        _exists_mock,
    ):
        safe_name = _ensure_sync_safe_filename('/documentos', 'CONTRIBUI\udcc7AO.pdf')

        self.assertEqual(safe_name, 'CONTRIBUICAO.pdf')
        replace_mock.assert_called_once_with(
            os.path.join('/documentos', 'CONTRIBUI\udcc7AO.pdf'),
            os.path.join('/documentos', 'CONTRIBUICAO.pdf'),
        )


class PeriodoDocumentoEmpresaTest(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.migration = importlib.import_module(
            'empresas.migrations.0024_normalizar_periodos_documento_empresa'
        )

    def test_pasta_sem_periodo_converte_mes_zero_para_nulo(self):
        document = SimpleNamespace(
            folder_key='constitutivos_outros',
            ano=None,
            mes='00',
        )

        self.assertEqual(self.migration._normalized_period(document), (None, None))

    def test_pasta_mensal_normaliza_mes_para_dois_digitos(self):
        document = SimpleNamespace(
            folder_key='pessoal_guias',
            ano='2026',
            mes='8',
        )

        self.assertEqual(self.migration._normalized_period(document), ('2026', '08'))


class DataEmissaoBoletoTest(SimpleTestCase):
    def test_corrige_data_futura_causada_por_virada_do_utc(self):
        brazil_today = importlib.import_module('datetime').date(2026, 9, 4)

        self.assertEqual(
            normalize_bb_emission_date('2026-09-05', brazil_today),
            '04.09.2026',
        )

    def test_preserva_data_de_emissao_valida(self):
        brazil_today = importlib.import_module('datetime').date(2026, 9, 4)

        self.assertEqual(
            normalize_bb_emission_date('2026-09-04', brazil_today),
            '04.09.2026',
        )

def _serpro_response(status_code, payload=None, text=''):
    response = Mock()
    response.status_code = status_code
    response.ok = 200 <= status_code < 400
    response.text = text
    if payload is None:
        response.json.side_effect = ValueError('resposta sem JSON')
    else:
        response.json.return_value = payload
    return response


class TratamentoErrosDasSerproTest(SimpleTestCase):
    tokens = {'access_token': 'access', 'jwt_token': 'jwt'}

    @patch('empresas.serpro_service.get_serpro_token', return_value=tokens)
    @patch('empresas.serpro_service.requests.post')
    def test_explica_quando_nao_existe_valor_devido(self, post_mock, _token_mock):
        post_mock.return_value = _serpro_response(200, {
            'dados': '',
            'mensagens': [{
                'codigo': '[Aviso-PGDASD-MSG_E0139]',
                'texto': 'MSG_E0139 - Não foi gerado DAS por não haver valor devido.',
            }],
        })

        resultado = gerar_das_serpro('51.541.297/0001-33', '202606')

        self.assertFalse(resultado['sucesso'])
        self.assertIn('Não há DAS a emitir', resultado['erro'])
        self.assertIn('06/2026', resultado['erro'])
        self.assertIn('não existe valor devido', resultado['erro'])

    @patch('empresas.serpro_service.time.sleep')
    @patch('empresas.serpro_service.get_serpro_token', return_value=tokens)
    @patch('empresas.serpro_service.requests.post')
    def test_tenta_novamente_e_explica_indisponibilidade(self, post_mock, _token_mock, sleep_mock):
        post_mock.return_value = _serpro_response(500, text='Internal Server Error')

        resultado = gerar_das_serpro('51541297000133', '202608')

        self.assertFalse(resultado['sucesso'])
        self.assertIn('temporariamente indisponível', resultado['erro'])
        self.assertIn('08/2026', resultado['erro'])
        self.assertEqual(post_mock.call_count, 3)
        self.assertEqual(sleep_mock.call_count, 2)

    @patch('empresas.serpro_service.get_serpro_token', return_value=tokens)
    @patch('empresas.serpro_service.requests.post')
    def test_extrato_explica_quando_competencia_nao_tem_das(self, post_mock, _token_mock):
        post_mock.return_value = _serpro_response(200, {
            'dados': '{"anoCalendario": 2026, "periodos": []}',
            'mensagens': [{'codigo': '[Sucesso-PGDASD]', 'texto': 'Requisição efetuada com sucesso.'}],
        })

        resultado = orquestrar_consulta_extrato('51541297000133', '202608')

        self.assertFalse(resultado['sucesso'])
        self.assertIn('Não existe DAS gerado', resultado['erro'])
        self.assertIn('declaração do período', resultado['erro'])

    def test_valida_competencia_antes_de_chamar_serpro(self):
        resultado = gerar_das_serpro('51541297000133', '202613')

        self.assertFalse(resultado['sucesso'])
        self.assertIn('competência válida', resultado['erro'])


class InventarioArquivosTest(SimpleTestCase):
    def test_scan_contabiliza_sem_modificar_arquivos(self):
        with tempfile.TemporaryDirectory() as media_root:
            folder = os.path.join(media_root, 'EMPRESA', 'FISCAL', 'GUIAS', '2026', '08')
            os.makedirs(folder)
            file_path = os.path.join(folder, 'DAS.pdf')
            with open(file_path, 'wb') as document:
                document.write(b'%PDF-test')
            original_mtime = os.stat(file_path).st_mtime_ns

            result = scan_media_root(media_root)

            self.assertEqual(len(result['files']), 1)
            self.assertEqual(result['files']['EMPRESA/FISCAL/GUIAS/2026/08/DAS.pdf']['size'], 9)
            self.assertEqual(result['extensions'], {'.pdf': 1})
            self.assertEqual(os.stat(file_path).st_mtime_ns, original_mtime)

    def test_caminho_de_banco_nao_pode_sair_do_media_root(self):
        with tempfile.TemporaryDirectory() as media_root:
            self.assertIsNone(_relative_path(media_root, '../segredo.txt'))
            self.assertIsNone(_relative_path(media_root, '/etc/passwd'))
            self.assertEqual(
                _relative_path(media_root, r'EMPRESA\FISCAL\GUIAS\2026\08\DAS.pdf'),
                'EMPRESA/FISCAL/GUIAS/2026/08/DAS.pdf',
            )


class ArmazenamentoNuvemTest(SimpleTestCase):
    def test_escrita_atomica_cria_e_substitui_documento(self):
        with tempfile.TemporaryDirectory() as media_root:
            storage = FileSystemStorage(location=media_root)
            relative_name = 'EMPRESA/FISCAL/GUIAS/2026/08/DAS.pdf'

            _atomic_storage_write(storage, relative_name, b'%PDF-primeira-versao')
            _atomic_storage_write(storage, relative_name, b'%PDF-segunda-versao')

            final_path = os.path.join(media_root, *relative_name.split('/'))
            with open(final_path, 'rb') as document:
                self.assertEqual(document.read(), b'%PDF-segunda-versao')
            self.assertFalse(any(name.endswith('.part') for name in os.listdir(os.path.dirname(final_path))))

    def test_migracao_rejeita_raiz_e_aceita_diretorio_especifico(self):
        with self.assertRaisesMessage(Exception, 'inseguro'):
            _safe_directory('/', 'Origem')
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(_safe_directory(directory, 'Origem'), os.path.realpath(directory))

    def test_retomada_seleciona_pastas_a_partir_do_prefixo(self):
        with tempfile.TemporaryDirectory() as source:
            for name in ('ALFA', 'ÍCARO', 'JOSE', 'KAPPA'):
                os.mkdir(os.path.join(source, name))

            self.assertEqual(_source_directories(source, 'J'), ['JOSE', 'KAPPA'])
