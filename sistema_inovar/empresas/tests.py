import os
import tempfile

from django.test import SimpleTestCase

from .folder_structure import create_company_folder_structure
from .management.commands.migrar_estrutura_pastas_2026 import Command
from .utils import gerar_nome_pasta_empresa_padronizado, normalizar_nome_empresa


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
