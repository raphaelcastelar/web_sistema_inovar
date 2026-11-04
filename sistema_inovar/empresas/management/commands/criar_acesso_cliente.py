import getpass
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from empresas.models import Empresa, Funcionario


class Command(BaseCommand):
    help = 'Cria ou atualiza um login do aplicativo e o vincula a uma única empresa.'

    def add_arguments(self, parser):
        parser.add_argument('cnpj', help='CNPJ da empresa cadastrada')
        parser.add_argument('--username', help='Login; por padrão, usa o CNPJ sem pontuação')
        parser.add_argument('--email', default='')

    @transaction.atomic
    def handle(self, *args, **options):
        normalized = re.sub(r'\D', '', options['cnpj'])
        matches = [
            item for item in Empresa.objects.filter(ativo=True)
            if re.sub(r'\D', '', item.cnpj or '') == normalized
        ]
        if len(matches) != 1:
            raise CommandError('Não foi encontrada exatamente uma empresa ativa com esse CNPJ.')
        company = matches[0]
        username = options['username'] or normalized
        if not username:
            raise CommandError('Informe um login válido.')

        password = getpass.getpass('Senha do aplicativo: ')
        confirmation = getpass.getpass('Confirme a senha: ')
        if password != confirmation or len(password) < 8:
            raise CommandError('As senhas devem ser iguais e ter ao menos 8 caracteres.')

        user, created = Funcionario.objects.get_or_create(
            username=username,
            defaults={'cargo': 'cliente', 'email': options['email'], 'is_staff': False},
        )
        if not created and user.cargo != 'cliente':
            raise CommandError('O login informado já pertence a um usuário interno.')
        user.cargo = 'cliente'
        user.email = options['email'] or user.email
        user.is_active = True
        user.is_staff = False
        user.is_superuser = False
        user.set_password(password)
        user.save()
        user.empresas_gerenciadas.clear()
        for other in Empresa.objects.filter(usuarios=user).exclude(pk=company.pk):
            other.usuarios.remove(user)
        company.usuarios.add(user)
        self.stdout.write(self.style.SUCCESS(
            f'Acesso {"criado" if created else "atualizado"} para {company.nome}.'
        ))
