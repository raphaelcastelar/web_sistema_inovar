import importlib
import datetime
import os
import tempfile
from io import BytesIO
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase
from django.test import override_settings
from django.core.files.storage import FileSystemStorage
from rest_framework.exceptions import ValidationError as DRFValidationError
from PyPDF2 import PdfReader

from .models import Empresa
from .serializers import PaginaSistemaSerializer
from .company_storage import _update_document_paths, rename_company_folder
from .folder_structure import create_company_folder_structure
from .management.commands.migrar_estrutura_pastas_2026 import Command
from .management.commands.inventariar_arquivos import _relative_path, scan_media_root
from .utils import gerar_nome_pasta_empresa_padronizado, normalizar_nome_empresa
from .views import (
    DocumentoEmpresaViewSet,
    _ensure_sync_safe_filename,
    _normalize_whatsapp_number,
    _repair_surrogate_escapes,
    boleto_honorario_arquivo_disponivel,
    calcular_vencimento_honorario,
    normalizar_competencia_honorario,
    normalize_bb_emission_date,
    responder_com_boleto_honorario_existente,
)
from .serpro_service import gerar_das_serpro, orquestrar_consulta_extrato
from .document_storage import (
    _atomic_storage_write,
    delete_document_file,
    rename_document_file,
    save_generated_dctfweb,
    save_generated_fiscal_document,
)
from .proposta_comercial_pdf import build_proposta_comercial_pdf
from .management.commands.migrar_arquivos_para_nuvem import _safe_directory, _source_directories


class PropostaComercialPdfTest(SimpleTestCase):
    def setUp(self):
        self.campos = {
            'proposta_num': 'PC-20260917-0001',
            'proposta_data': '17/09/2026',
            'validade': '30 dias',
            'vencimento': 'Todo dia 10',
            'cliente_razao': 'EMPRESA TESTE LTDA',
            'cliente_cnpj': '12.345.678/0001-90',
            'cliente_regime': 'Simples Nacional',
            'cliente_resp': 'Responsavel Teste',
            'cliente_contato': '(28) 99999-9999',
            'cf_faixa': 'Ate 50 mil',
            'cf_grupo': 'Servico, Comercio',
            'hon_contabil_fiscal': 'R$ 360,00',
            'dp_funcionarios': '5',
            'dp_faixa': 'De 4 a 14 funcionarios',
            'hon_pessoal': 'R$ 175,00',
            'hon_total': 'R$ 481,50',
        }

    def test_gera_modelo_sem_desconto_sem_campos_editaveis(self):
        pdf = build_proposta_comercial_pdf(self.campos, com_desconto=False)
        reader = PdfReader(BytesIO(pdf))
        texto = reader.pages[0].extract_text()

        self.assertEqual(len(reader.pages), 1)
        self.assertNotIn('/Annots', reader.pages[0])
        self.assertIn('EMPRESA TESTE LTDA', texto)
        self.assertNotIn('Desconto comercial', texto)

    def test_gera_modelo_com_desconto(self):
        campos = {
            **self.campos,
            'desconto_descricao': 'Desconto de 10%',
            'hon_desconto': 'R$ 53,50',
        }
        pdf = build_proposta_comercial_pdf(campos, com_desconto=True)
        texto = PdfReader(BytesIO(pdf)).pages[0].extract_text()

        self.assertIn('Desconto de 10%', texto)
        self.assertIn('R$ 53,50', texto)


class PermissaoPaginaSistemaTest(SimpleTestCase):
    def serializer_for(self, user):
        return PaginaSistemaSerializer(context={'request': SimpleNamespace(user=user)})

    def test_pagina_desativada_bloqueia_inclusive_administrador(self):
        admin = SimpleNamespace(is_staff=True, is_superuser=False, cargo='admin')
        pagina = SimpleNamespace(gerenciavel=True, ativa=False, permite_admin=True)

        self.assertFalse(self.serializer_for(admin).get_acessivel(pagina))

    def test_permissao_respeita_cargo_do_usuario(self):
        fiscal = SimpleNamespace(is_staff=False, is_superuser=False, cargo='fiscal')
        pagina = SimpleNamespace(gerenciavel=True, ativa=True, permite_fiscal=False)

        self.assertFalse(self.serializer_for(fiscal).get_acessivel(pagina))
        pagina.permite_fiscal = True
        self.assertTrue(self.serializer_for(fiscal).get_acessivel(pagina))

    def test_painel_de_paginas_e_permanente_e_exclusivo_de_admin(self):
        pagina = SimpleNamespace(gerenciavel=False, ativa=False)
        admin = SimpleNamespace(is_staff=True, is_superuser=False, cargo='admin')
        fiscal = SimpleNamespace(is_staff=False, is_superuser=False, cargo='fiscal')

        self.assertTrue(self.serializer_for(admin).get_acessivel(pagina))
        self.assertFalse(self.serializer_for(fiscal).get_acessivel(pagina))

    def test_categoria_da_pagina_deve_existir_no_navbar(self):
        serializer = PaginaSistemaSerializer()

        self.assertEqual(serializer.validate_secao('Financeiro'), 'Financeiro')
        with self.assertRaisesMessage(DRFValidationError, 'Categoria inválida para o navbar.'):
            serializer.validate_secao('Outros')


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


class NormalizacaoWhatsAppTest(SimpleTestCase):
    def test_aceita_numero_brasileiro_com_oito_digitos(self):
        self.assertEqual(
            _normalize_whatsapp_number('+55 33 9983-1371'),
            '553399831371',
        )

    def test_aceita_numero_brasileiro_com_nove_digitos(self):
        self.assertEqual(
            _normalize_whatsapp_number('+55 (33) 99983-1371'),
            '5533999831371',
        )

    def test_adiciona_ddi_a_numeros_locais(self):
        self.assertEqual(_normalize_whatsapp_number('(33) 9983-1371'), '553399831371')
        self.assertEqual(_normalize_whatsapp_number('(33) 99983-1371'), '5533999831371')


class BuscaDocumentosSimplesSalvosTest(SimpleTestCase):
    @patch('empresas.views.DocumentoEmpresa.objects.filter')
    @patch('empresas.views.Empresa.objects.only')
    def test_localiza_os_tres_documentos_da_competencia_sem_gerar(self, empresa_only, documento_filter):
        empresa = SimpleNamespace(id=7, cnpj='51.541.297/0001-33')
        empresa_only.return_value.get.return_value = empresa
        nomes = (
            'DAS_51541297000133_202608.pdf',
            'EXTRATO_SIMPLES_51541297000133_202608.pdf',
            'RECIBO_SIMPLES_51541297000133_202608.zip',
        )
        arquivos = []
        querysets = []
        for document_id, nome in enumerate(nomes, start=19):
            storage = Mock()
            storage.exists.return_value = True
            arquivo = SimpleNamespace(
                id=document_id,
                nome_arquivo=nome,
                caminho_arquivo=SimpleNamespace(storage=storage, name=f'EMPRESA/2026/08/{nome}'),
            )
            queryset = Mock()
            queryset.first.return_value = arquivo
            arquivos.append(arquivo)
            querysets.append(queryset)
        documento_filter.side_effect = querysets
        request = SimpleNamespace(query_params={'empresa_id': '7', 'periodo': '202608'})
        view = DocumentoEmpresaViewSet()
        view.get_serializer = lambda document: SimpleNamespace(
            data={'id': document.id, 'nome_arquivo': document.nome_arquivo}
        )

        response = view.documentos_salvos_simples(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['documentos']), 3)
        self.assertEqual([item['key'] for item in response.data['documentos']], ['das', 'extrato', 'declaracao'])
        self.assertTrue(all(item['documento'] for item in response.data['documentos']))
        self.assertEqual(documento_filter.call_count, 3)
        filter_kwargs = [mock_call.kwargs for mock_call in documento_filter.call_args_list]
        self.assertEqual(
            [kwargs['folder_key'] for kwargs in filter_kwargs],
            ['fiscal_guias', 'fiscal_extratos', 'fiscal_extratos'],
        )
        self.assertEqual(filter_kwargs[0]['nome_arquivo__in'], (nomes[0],))
        self.assertEqual(filter_kwargs[1]['nome_arquivo__in'], (nomes[1],))
        self.assertEqual(filter_kwargs[2]['nome_arquivo__in'], (
            'RECIBO_SIMPLES_51541297000133_202608.pdf',
            'RECIBO_SIMPLES_51541297000133_202608.zip',
        ))
        for arquivo in arquivos:
            arquivo.caminho_arquivo.storage.exists.assert_called_once_with(arquivo.caminho_arquivo.name)

    def test_rejeita_competencia_invalida(self):
        request = SimpleNamespace(query_params={'empresa_id': '7', 'periodo': '202613'})
        response = DocumentoEmpresaViewSet().documentos_salvos_simples(request)

        self.assertEqual(response.status_code, 400)


class ReutilizacaoBoletoHonorarioTest(SimpleTestCase):
    def test_competencia_explicita_e_mes_do_vencimento(self):
        empresa = SimpleNamespace(dia_vencimento_honorario=31)

        self.assertEqual(normalizar_competencia_honorario('02/2028', empresa), '202802')
        self.assertEqual(
            calcular_vencimento_honorario(empresa, '202802'),
            datetime.date(2028, 3, 31),
        )

        empresa.dia_vencimento_honorario = 15
        self.assertEqual(
            calcular_vencimento_honorario(empresa, '202612'),
            datetime.date(2027, 1, 15),
        )

    def test_rejeita_competencia_invalida(self):
        with self.assertRaisesMessage(ValueError, 'competência válida'):
            normalizar_competencia_honorario('13/2026')

    def test_download_reutiliza_documento_existente(self):
        arquivo = Mock()
        arquivo.path = '/tmp/HONORARIO.pdf'
        arquivo.url = '/media/HONORARIO.pdf'
        documento = SimpleNamespace(
            caminho_arquivo=arquivo,
            nome_arquivo='HONORARIO.pdf',
        )
        request = SimpleNamespace(
            build_absolute_uri=lambda url: f'https://sistema.test{url}',
        )

        with patch('empresas.views.os.path.exists', return_value=True):
            response = responder_com_boleto_honorario_existente(
                request,
                SimpleNamespace(nome='EMPRESA TESTE'),
                documento,
                'baixar',
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['from_cache'])
        self.assertEqual(
            response.data['download_url'],
            'https://sistema.test/media/HONORARIO.pdf',
        )

    def test_documento_sem_arquivo_fisico_nao_e_reutilizado(self):
        documento = SimpleNamespace(
            caminho_arquivo=SimpleNamespace(path='/tmp/arquivo-ausente.pdf'),
        )
        with patch('empresas.views.os.path.exists', return_value=False):
            self.assertFalse(boleto_honorario_arquivo_disponivel(documento))

    @patch('empresas.views.enviar_boleto_honorario_whatsapp')
    def test_gerar_nao_envia_boleto_que_ja_existe(self, enviar_mock):
        arquivo = Mock(path='/tmp/HONORARIO.pdf', url='/media/HONORARIO.pdf')
        documento = SimpleNamespace(caminho_arquivo=arquivo, nome_arquivo='HONORARIO.pdf')
        request = SimpleNamespace(build_absolute_uri=lambda url: url)

        with patch('empresas.views.os.path.exists', return_value=True):
            response = responder_com_boleto_honorario_existente(
                request, SimpleNamespace(nome='EMPRESA TESTE'), documento, 'gerar'
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['from_cache'])
        enviar_mock.assert_not_called()


class RenomearPastaEmpresaTest(SimpleTestCase):
    @patch('empresas.company_storage.transaction.atomic', return_value=nullcontext())
    @patch('empresas.company_storage.LEGACY_COMPANY_NAME_MODELS', ())
    @patch('empresas.company_storage._update_document_paths')
    def test_move_a_pasta_existente_sem_criar_outra(
        self,
        update_paths_mock,
        _atomic_mock,
    ):
        with tempfile.TemporaryDirectory() as media_root:
            old_path = os.path.join(media_root, 'EMPRESA ANTIGA')
            new_path = os.path.join(media_root, 'EMPRESA NOVA')
            os.makedirs(old_path)
            with open(os.path.join(old_path, 'documento.pdf'), 'wb') as file:
                file.write(b'%PDF-teste')
            empresa = Empresa(pk=3, nome='EMPRESA NOVA', cnpj='12.345.678/0001-90')

            with override_settings(MEDIA_ROOT=media_root):
                moved = rename_company_folder(empresa, 'EMPRESA ANTIGA')

            self.assertTrue(moved)
            self.assertFalse(os.path.exists(old_path))
            self.assertTrue(os.path.isfile(os.path.join(new_path, 'documento.pdf')))
            update_paths_mock.assert_called_once_with('EMPRESA ANTIGA', 'EMPRESA NOVA')

    @patch('empresas.company_storage.transaction.atomic', return_value=nullcontext())
    @patch('empresas.company_storage.LEGACY_COMPANY_NAME_MODELS', ())
    def test_nao_sobrescreve_uma_pasta_de_destino_existente(self, _atomic_mock):
        with tempfile.TemporaryDirectory() as media_root:
            old_path = os.path.join(media_root, 'EMPRESA ANTIGA')
            new_path = os.path.join(media_root, 'EMPRESA NOVA')
            os.makedirs(old_path)
            os.makedirs(new_path)
            empresa = Empresa(pk=3, nome='EMPRESA NOVA', cnpj='12.345.678/0001-90')

            with override_settings(MEDIA_ROOT=media_root):
                with self.assertRaises(FileExistsError):
                    rename_company_folder(empresa, 'EMPRESA ANTIGA')

            self.assertTrue(os.path.isdir(old_path))
            self.assertTrue(os.path.isdir(new_path))

    @patch('empresas.company_storage.DOCUMENT_MODELS')
    def test_atualiza_o_prefixo_dos_caminhos_registrados(self, document_models_mock):
        document = SimpleNamespace(
            pk=9,
            caminho_arquivo=SimpleNamespace(
                name='EMPRESA ANTIGA/PESSOAL/GUIAS/2026/08/guia.pdf'
            ),
        )
        document_model = Mock()
        document_model.objects.filter.return_value.only.return_value.iterator.return_value = [document]
        document_models_mock.__iter__.return_value = iter((document_model,))

        _update_document_paths('EMPRESA ANTIGA', 'EMPRESA NOVA')

        document_model.objects.filter.return_value.only.assert_called_once_with(
            'pk', 'caminho_arquivo'
        )
        document_model.objects.filter.return_value.only.return_value.iterator.assert_called_once_with()
        document_model.objects.filter.assert_any_call(pk=9)
        document_model.objects.filter.return_value.update.assert_called_once_with(
            caminho_arquivo='EMPRESA NOVA/PESSOAL/GUIAS/2026/08/guia.pdf'
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


class OperacoesArquivoDocumentoTest(SimpleTestCase):
    def _document(self, storage, relative_name):
        return SimpleNamespace(
            pk=7,
            empresa=SimpleNamespace(pk=3),
            folder_key='fiscal_guias',
            nome_arquivo=os.path.basename(relative_name),
            ano='2026',
            mes='08',
            caminho_arquivo=SimpleNamespace(storage=storage, name=relative_name),
            save=Mock(),
            delete=Mock(),
        )

    @patch('empresas.document_storage.transaction.atomic', return_value=nullcontext())
    @patch('empresas.document_storage.DocumentoEmpresa.objects.filter')
    def test_renomeia_arquivo_no_disco_e_no_registro(self, filter_mock, _atomic_mock):
        filter_mock.return_value.exclude.return_value.exists.return_value = False
        with tempfile.TemporaryDirectory() as media_root:
            storage = FileSystemStorage(location=media_root)
            old_name = 'EMPRESA/FISCAL/GUIAS/2026/08/guia.pdf'
            old_path = os.path.join(media_root, *old_name.split('/'))
            os.makedirs(os.path.dirname(old_path), exist_ok=True)
            with open(old_path, 'wb') as file:
                file.write(b'%PDF-teste')
            document = self._document(storage, old_name)

            rename_document_file(document, 'Guia atualizada.pdf')

            new_name = 'EMPRESA/FISCAL/GUIAS/2026/08/Guia_atualizada.pdf'
            self.assertFalse(os.path.exists(old_path))
            self.assertTrue(os.path.isfile(os.path.join(media_root, *new_name.split('/'))))
            self.assertEqual(document.nome_arquivo, 'Guia_atualizada.pdf')
            self.assertEqual(document.caminho_arquivo.name, new_name)
            document.save.assert_called_once_with(update_fields=['nome_arquivo', 'caminho_arquivo'])

    @patch('empresas.document_storage.transaction.atomic', return_value=nullcontext())
    def test_exclui_arquivo_do_disco_e_registro(self, _atomic_mock):
        with tempfile.TemporaryDirectory() as media_root:
            storage = FileSystemStorage(location=media_root)
            relative_name = 'EMPRESA/CONSTITUTIVOS/OUTROS/contrato.pdf'
            file_path = os.path.join(media_root, *relative_name.split('/'))
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            with open(file_path, 'wb') as file:
                file.write(b'%PDF-teste')
            document = self._document(storage, relative_name)

            delete_document_file(document)

            document.delete.assert_called_once_with()
            self.assertFalse(os.path.exists(file_path))


class ArmazenamentoDctfWebTest(SimpleTestCase):
    @patch('empresas.document_storage._atomic_storage_write')
    @patch('empresas.document_storage.DocumentoEmpresa.objects.select_for_update')
    @patch('empresas.document_storage.find_empresa_by_cnpj')
    def test_salva_cada_documento_na_pasta_pessoal_correta(
        self,
        find_empresa_mock,
        select_for_update_mock,
        atomic_write_mock,
    ):
        empresa = Empresa(pk=3, nome='EMPRESA TESTE', cnpj='12.345.678/0001-90')
        find_empresa_mock.return_value = empresa
        manager = select_for_update_mock.return_value
        cases = (
            ('GERARGUIA31', 'pessoal_guias', 'PESSOAL/GUIAS', 'GUIA_DCTFWEB'),
            ('CONSRECIBO32', 'pessoal_relatorios', 'PESSOAL/RELATORIOS', 'RECIBO_DCTFWEB'),
            (
                'CONSDECCOMPLETA33',
                'pessoal_relatorios',
                'PESSOAL/RELATORIOS',
                'DECLARACAO_COMPLETA_DCTFWEB',
            ),
        )

        for service_id, folder_key, folder_path, prefix in cases:
            with self.subTest(service_id=service_id):
                expected_filename = f'{prefix}_12345678000190_202608.pdf'
                saved_document = SimpleNamespace(nome_arquivo=expected_filename)
                manager.update_or_create.return_value = (saved_document, True)
                atomic_write_mock.reset_mock()

                result = save_generated_dctfweb.__wrapped__(
                    '12.345.678/0001-90',
                    '202608',
                    service_id,
                    b'%PDF-documento',
                )

                stored_name = atomic_write_mock.call_args.args[1]
                written_name = stored_name.replace('\\', '/')
                self.assertEqual(
                    written_name,
                    f'EMPRESA TESTE/{folder_path}/2026/08/{expected_filename}',
                )
                manager.update_or_create.assert_called_with(
                    empresa=empresa,
                    folder_key=folder_key,
                    nome_arquivo=expected_filename,
                    ano='2026',
                    mes='08',
                    defaults={'caminho_arquivo': stored_name},
                )
                self.assertIs(result, saved_document)


class ArmazenamentoDocumentosFiscaisTest(SimpleTestCase):
    @patch('empresas.document_storage._atomic_storage_write')
    @patch('empresas.document_storage.DocumentoEmpresa.objects.select_for_update')
    @patch('empresas.document_storage.find_empresa_by_cnpj')
    def test_salva_extrato_recibo_e_parcelamento_nas_pastas_corretas(
        self,
        find_empresa_mock,
        select_for_update_mock,
        atomic_write_mock,
    ):
        empresa = Empresa(pk=3, nome='EMPRESA TESTE', cnpj='12.345.678/0001-90')
        find_empresa_mock.return_value = empresa
        manager = select_for_update_mock.return_value
        cases = (
            (
                'extrato_simples',
                'fiscal_extratos',
                'FISCAL/EXTRATOS',
                'EXTRATO_SIMPLES',
                b'%PDF-extrato',
                'pdf',
            ),
            (
                'recibo_simples',
                'fiscal_extratos',
                'FISCAL/EXTRATOS',
                'RECIBO_SIMPLES',
                b'PK\x03\x04-recibo',
                'zip',
            ),
            (
                'parcelamento_sn',
                'fiscal_guias',
                'FISCAL/GUIAS',
                'GUIA_PARCELAMENTO_SN',
                b'%PDF-parcelamento',
                'pdf',
            ),
        )

        for document_type, folder_key, folder_path, prefix, content, extension in cases:
            with self.subTest(document_type=document_type):
                expected_filename = f'{prefix}_12345678000190_202608.{extension}'
                saved_document = SimpleNamespace(nome_arquivo=expected_filename)
                manager.update_or_create.return_value = (saved_document, True)
                atomic_write_mock.reset_mock()

                result = save_generated_fiscal_document.__wrapped__(
                    '12.345.678/0001-90',
                    '202608',
                    document_type,
                    content,
                )

                stored_name = atomic_write_mock.call_args.args[1]
                self.assertEqual(
                    stored_name.replace('\\', '/'),
                    f'EMPRESA TESTE/{folder_path}/2026/08/{expected_filename}',
                )
                manager.update_or_create.assert_called_with(
                    empresa=empresa,
                    folder_key=folder_key,
                    nome_arquivo=expected_filename,
                    ano='2026',
                    mes='08',
                    defaults={'caminho_arquivo': stored_name},
                )
                self.assertIs(result, saved_document)
