# empresas/management/commands/criar_obrigacoes_mensais.py
from django.core.management.base import BaseCommand
from django.utils import timezone
from empresas.models import Empresa, ObrigacaoMensal

class Command(BaseCommand):
    help = 'Cria as obrigações mensais do Simples Nacional para todas as empresas ativas.'

    def handle(self, *args, **options):
        hoje = timezone.now().date()
        primeiro_dia_do_mes = hoje.replace(day=1)
        
        # Assumindo que você tem um campo 'regime' no modelo Empresa para filtrar
        # Se não tiver, pode fazer `empresas = Empresa.objects.all()`
        empresas_simples = Empresa.objects.all() # Adapte este filtro se necessário

        count = 0
        for empresa in empresas_simples:
            # get_or_create evita duplicatas. Ele tenta buscar, se não achar, cria.
            obj, created = ObrigacaoMensal.objects.get_or_create(
                empresa=empresa,
                tipo='simples_nacional',
                periodo_apuracao=primeiro_dia_do_mes,
                defaults={'status': 'pendente'} # Só usa o default se estiver criando
            )
            if created:
                count += 1
        
        self.stdout.write(self.style.SUCCESS(f'{count} novas obrigações mensais foram criadas com sucesso.'))