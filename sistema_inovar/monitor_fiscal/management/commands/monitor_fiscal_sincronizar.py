from django.core.management.base import BaseCommand

from monitor_fiscal import sincronizacao


class Command(BaseCommand):
    help = (
        'Executa uma rodada de sincronização do Monitor Fiscal para todas as empresas com consulta permitida. '
        'Respeita intervalos obrigatórios, bloqueios por consumo indevido e travas de execução. '
        'Agendado pelo systemd timer sistema-inovar-monitor-fiscal.timer.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--empresa', type=int, action='append', help='Restringe a uma ou mais empresas (id).')
        parser.add_argument('--fonte', action='append', help='AN_NFE, AN_CTE, ADN_NFSE ou AN_MDFE.')
        parser.add_argument('--paralelas', type=int, default=None, help='Execuções simultâneas (empresas diferentes).')

    def handle(self, *args, **opcoes):
        resultados = sincronizacao.executar_rodada(
            max_workers=opcoes['paralelas'], empresa_ids=opcoes['empresa'], fontes=opcoes['fonte'],
        )
        for controle_id, sucesso, mensagem in resultados:
            self.stdout.write(f'controle={controle_id} sucesso={sucesso} {mensagem}')
        self.stdout.write(self.style.SUCCESS(f'{len(resultados)} controle(s) processado(s).'))
