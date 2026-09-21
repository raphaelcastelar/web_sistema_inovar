import datetime

from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Atividade, Empresa, Funcionario


class AtividadeApiTest(APITestCase):
    def setUp(self):
        self.admin = Funcionario.objects.create_user(
            username='admin-atividades',
            password='senha',
            cargo='admin',
            is_staff=True,
        )
        self.usuario = Funcionario.objects.create_user(
            username='usuario-atividades',
            password='senha',
            cargo='fiscal',
        )
        self.outro_usuario = Funcionario.objects.create_user(
            username='outro-usuario-atividades',
            password='senha',
            cargo='pessoal',
        )
        self.empresa = Empresa.objects.create(nome='Empresa de atividades', cnpj='12345678000190')

    def test_cria_conclui_e_reserva_bloco(self):
        self.client.force_authenticate(self.usuario)
        hoje = timezone.localdate()
        resposta = self.client.post('/api/atividades/', {
            'titulo': 'Conferir documentos',
            'tipo': 'tarefa',
            'empresaId': self.empresa.id,
            'dataPlanejada': hoje.isoformat(),
            'prazo': (hoje + datetime.timedelta(days=1)).isoformat(),
            'prioridade': 'alta',
        }, format='json')

        self.assertEqual(resposta.status_code, 201)
        atividade_id = resposta.data['id']
        self.assertEqual(resposta.data['responsavelId'], self.usuario.id)

        resposta = self.client.patch(
            f'/api/atividades/{atividade_id}/', {'estado': 'concluida'}, format='json'
        )
        self.assertEqual(resposta.status_code, 200)
        self.assertIsNotNone(resposta.data['concluidaEm'])

        inicio = timezone.now() + datetime.timedelta(hours=1)
        resposta = self.client.post(f'/api/atividades/{atividade_id}/blocos/', {
            'inicio': inicio.isoformat(),
            'termino': (inicio + datetime.timedelta(hours=1)).isoformat(),
        }, format='json')
        self.assertEqual(resposta.status_code, 201)

    def test_usuario_comum_nao_pode_atribuir_atividade_a_outra_pessoa(self):
        self.client.force_authenticate(self.usuario)
        resposta = self.client.post('/api/atividades/', {
            'titulo': 'Tentativa de reatribuição',
            'tipo': 'tarefa',
            'responsavelId': self.outro_usuario.id,
            'dataPlanejada': timezone.localdate().isoformat(),
        }, format='json')

        self.assertEqual(resposta.status_code, 403)
        self.assertFalse(Atividade.objects.filter(titulo='Tentativa de reatribuição').exists())

    def test_admin_visualiza_atividade_privada_sem_detalhes(self):
        atividade = Atividade.objects.create(
            titulo='Conteúdo confidencial',
            descricao='Descrição confidencial',
            tipo='compromisso',
            responsavel=self.usuario,
            autor=self.usuario,
            inicio=timezone.now(),
            termino=timezone.now() + datetime.timedelta(hours=1),
            privada=True,
        )
        self.client.force_authenticate(self.admin)

        resposta = self.client.get('/api/atividades/')

        self.assertEqual(resposta.status_code, 200)
        item = next(item for item in resposta.data if item['id'] == atividade.id)
        self.assertTrue(item['mascarada'])
        self.assertEqual(item['titulo'], 'Atividade privada')
        self.assertEqual(item['descricao'], '')

        resposta = self.client.get(f'/api/atividades/{atividade.id}/')
        self.assertEqual(resposta.status_code, 200)
        self.assertTrue(resposta.data['mascarada'])
        self.assertEqual(resposta.data['titulo'], 'Atividade privada')

        resposta = self.client.patch(
            f'/api/atividades/{atividade.id}/', {'estado': 'concluida'}, format='json'
        )
        self.assertEqual(resposta.status_code, 403)

    def test_recorrencia_materializa_ocorrencias_independentes_ate_hoje(self):
        inicio = timezone.localdate() - datetime.timedelta(days=2)
        original = Atividade.objects.create(
            titulo='Rotina diária',
            tipo='tarefa',
            responsavel=self.usuario,
            autor=self.usuario,
            data_planejada=inicio,
            prazo=inicio,
            frequencia='diaria',
        )
        self.client.force_authenticate(self.usuario)

        resposta = self.client.get('/api/atividades/')

        self.assertEqual(resposta.status_code, 200)
        ocorrencias = Atividade.objects.filter(recorrencia_origem=original).order_by('data_planejada')
        self.assertEqual(list(ocorrencias.values_list('data_planejada', flat=True)), [
            inicio + datetime.timedelta(days=1),
            inicio + datetime.timedelta(days=2),
        ])
