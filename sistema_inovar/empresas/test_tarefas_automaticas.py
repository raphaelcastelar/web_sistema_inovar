import datetime

from django.test import TestCase
from rest_framework.test import APITestCase

from .models import Atividade, Empresa, Funcionario
from .tarefas_automaticas import (
    calcular_ocorrencia,
    listar_obrigacoes_empresa,
    sincronizar_tarefas_automaticas,
)


class RegrasTarefasAutomaticasTest(TestCase):
    def empresa(self, **dados):
        padrao = {
            'nome': 'EMPRESA TESTE',
            'cnpj': '12345678000190',
            'ativo': True,
            'grupo_atividade': [],
            'qtd_empregados': 0,
            'qtd_pro_labore': 0,
            'inss_20_sal': False,
        }
        padrao.update(dados)
        return Empresa(**padrao)

    def test_simples_nacional_recebe_rotina_fiscal_e_contabil(self):
        empresa = self.empresa(regime_tributario='SIMPLES NACIONAL')

        self.assertEqual(listar_obrigacoes_empresa(empresa), [
            'PG-DAS', 'Guia DAS', 'DEFIS', 'Escrituração Contábil', 'Balanço Anual',
        ])

    def test_mei_de_servico_com_empregados_combina_regras_sem_duplicar(self):
        empresa = self.empresa(
            regime_tributario='MEI',
            grupo_atividade=['SERVICO'],
            qtd_empregados=1,
        )

        self.assertEqual(listar_obrigacoes_empresa(empresa), [
            'Folha de Pagamento', 'E-Social', 'DCTF-WEB', 'Guia Unificada MEI',
            'NFS-e', 'DASN-Mei',
        ])

    def test_pro_labore_sal_nao_gera_rotina_normal_sem_empregados(self):
        empresa = self.empresa(qtd_pro_labore=1, inss_20_sal=True)

        self.assertEqual(listar_obrigacoes_empresa(empresa), ['INSS 20% (SAL)'])

    def test_empresa_inativa_nao_recebe_obrigacoes_novas(self):
        empresa = self.empresa(ativo=False, regime_tributario='SIMPLES NACIONAL')

        self.assertEqual(listar_obrigacoes_empresa(empresa), [])

    def test_calculo_de_competencia_e_vencimentos(self):
        hoje = datetime.date(2026, 9, 16)

        self.assertEqual(calcular_ocorrencia('Guia DAS', hoje), {
            'prazo': datetime.date(2026, 9, 20),
            'competencia': '08/2026',
        })
        self.assertEqual(calcular_ocorrencia('DEFIS', hoje), {
            'prazo': datetime.date(2027, 3, 31),
            'competencia': '2026',
        })
        self.assertEqual(calcular_ocorrencia('Balanço Trimestral', hoje), {
            'prazo': datetime.date(2026, 10, 31),
            'competencia': '3º trim/2026',
        })
        self.assertIsNone(calcular_ocorrencia('NFS-e', hoje))


class SincronizacaoTarefasAutomaticasTest(TestCase):
    def setUp(self):
        self.fiscal = Funcionario.objects.create_user(
            username='fiscal-auto', password='senha', cargo='fiscal'
        )
        self.contabil = Funcionario.objects.create_user(
            username='contabil-auto', password='senha', cargo='contabil'
        )
        self.empresa = Empresa.objects.create(
            nome='EMPRESA AUTOMATICA',
            cnpj='12345678000190',
            regime_tributario='SIMPLES NACIONAL',
            responsavel_fiscal=self.fiscal,
            responsavel_contabil=self.contabil,
        )
        self.hoje = datetime.date(2026, 9, 16)

    def test_sincronizacao_cria_uma_ocorrencia_idempotente_por_competencia(self):
        primeiro = sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)
        segundo = sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)

        self.assertEqual(primeiro['criadas'], 5)
        self.assertEqual(segundo['criadas'], 0)
        self.assertEqual(Atividade.objects.filter(empresa=self.empresa, origem='automatica').count(), 5)
        pg_das = Atividade.objects.get(empresa=self.empresa, obrigacao='PG-DAS')
        self.assertEqual(pg_das.competencia, '08/2026')
        self.assertEqual(pg_das.responsavel, self.fiscal)
        self.assertEqual(pg_das.responsavel_automatico, self.fiscal)
        self.assertEqual(pg_das.chave_ocorrencia, f'{self.empresa.pk}::PG-DAS::08/2026')

    def test_substituicao_manual_valida_e_preservada(self):
        outro_fiscal = Funcionario.objects.create_user(
            username='outro-fiscal-auto', password='senha', cargo='fiscal'
        )
        sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)
        atividade = Atividade.objects.get(empresa=self.empresa, obrigacao='PG-DAS')
        atividade.responsavel = outro_fiscal
        atividade.save(update_fields=['responsavel'])

        sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)

        atividade.refresh_from_db()
        self.assertEqual(atividade.responsavel, outro_fiscal)
        self.assertEqual(atividade.responsavel_automatico, self.fiscal)

        outro_fiscal.is_active = False
        outro_fiscal.save(update_fields=['is_active'])
        sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)
        atividade.refresh_from_db()
        self.assertEqual(atividade.responsavel, self.fiscal)
        self.assertEqual(atividade.responsavel_automatico, self.fiscal)

    def test_mudanca_de_regra_nao_apaga_historico(self):
        sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)
        self.empresa.regime_tributario = 'ISENTO'
        self.empresa.save(update_fields=['regime_tributario'])

        resultado = sincronizar_tarefas_automaticas(self.empresa, hoje=self.hoje)

        self.assertEqual(resultado['criadas'], 0)
        self.assertEqual(Atividade.objects.filter(empresa=self.empresa, origem='automatica').count(), 5)


class CadastroCompletoEmpresaApiTest(APITestCase):
    def setUp(self):
        self.admin = Funcionario.objects.create_user(
            username='admin-cadastro-empresa', password='senha', cargo='admin', is_staff=True
        )
        self.fiscal = Funcionario.objects.create_user(
            username='fiscal-cadastro-empresa', password='senha', cargo='fiscal'
        )
        self.contabil = Funcionario.objects.create_user(
            username='contabil-cadastro-empresa', password='senha', cargo='contabil'
        )
        self.client.force_authenticate(self.admin)

    def test_cadastro_completo_gera_as_tarefas_e_responsaveis(self):
        resposta = self.client.post('/api/empresas/', {
            'nome': 'Empresa Cadastro Completo',
            'razao_social': 'Empresa Cadastro Completo LTDA',
            'cnpj': '12.345.678/0001-95',
            'telefone': '22999998888',
            'email': 'empresa@example.com',
            'canal_envio': 'EMAIL',
            'inicio_atividade': '2020-01-02',
            'cliente_desde': '2021-03-04',
            'regime_tributario': 'SIMPLES NACIONAL',
            'porte_empresa': 'ME',
            'grupo_atividade': ['SERVICO'],
            'atividade': 'Serviços administrativos',
            'natureza_juridica': 'Sociedade empresária limitada',
            'faturamento_mes': '10000.00',
            'faturamento_12_meses': '120000.00',
            'qtd_empregados': 0,
            'qtd_pro_labore': 0,
            'responsavel_fiscal': self.fiscal.id,
            'responsavel_contabil': self.contabil.id,
            'usuarios': [self.admin.id],
            'socios': [],
        }, format='json')

        self.assertEqual(resposta.status_code, 201, resposta.data)
        empresa = Empresa.objects.get(pk=resposta.data['id'])
        self.assertEqual(empresa.razao_social, 'Empresa Cadastro Completo LTDA')
        self.assertEqual(empresa.telefone, '5522999998888')
        self.assertEqual(empresa.responsavel_fiscal, self.fiscal)
        self.assertEqual(empresa.responsavel_contabil, self.contabil)
        self.assertEqual(
            set(Atividade.objects.filter(empresa=empresa).values_list('obrigacao', flat=True)),
            {'PG-DAS', 'Guia DAS', 'DEFIS', 'Escrituração Contábil', 'Balanço Anual'},
        )

        atividade = Atividade.objects.get(empresa=empresa, obrigacao='PG-DAS')
        reagendada = self.client.patch(
            f'/api/atividades/{atividade.id}/',
            {'dataPlanejada': '2099-01-01'},
            format='json',
        )
        self.assertEqual(reagendada.status_code, 200, reagendada.data)
        alteracao_estrutural = self.client.patch(
            f'/api/atividades/{atividade.id}/',
            {'prazo': '2099-01-02'},
            format='json',
        )
        self.assertEqual(alteracao_estrutural.status_code, 400)

