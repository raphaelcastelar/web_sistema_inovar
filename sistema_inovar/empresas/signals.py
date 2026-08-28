# empresas/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.conf import settings
import shutil
import os
import logging
import datetime # Necessário para obter o ano atual e formatar meses

from .models import Empresa, Funcionario, Notificacao
from.utils import gerar_nome_pasta_empresa_padronizado
from .folder_structure import create_company_folder_structure

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Empresa)
def criar_pastas_empresa_handler(sender, instance, created, **kwargs):
    """
    Cria as pastas base para uma empresa recém-criada, incluindo
    subestrutura de ANO_ATUAL/ e todas as 12 subpastas MESANO para tipos de documento específicos.
    """
    if created: # Executa apenas quando um novo registro de Empresa é criado
        if not settings.MEDIA_ROOT:
            logger.error("MEDIA_ROOT não está configurado nas settings. Não é possível criar pastas da empresa.")
            return

        try:
            company_folder_name = gerar_nome_pasta_empresa_padronizado(instance.nome)
            base_company_path = os.path.join(settings.MEDIA_ROOT, company_folder_name)

            # Cria a pasta base da empresa
            os.makedirs(base_company_path, exist_ok=True)
            logger.info(f"Pasta base criada para '{instance.nome}': {base_company_path}")

            create_company_folder_structure(
                base_company_path,
                years=(datetime.date.today().year,),
            )

        except Exception as e:
            logger.error(f"Erro ao criar pastas para a empresa '{instance.nome}' (ID: {instance.id}): {e}")

@receiver(post_delete, sender=Empresa)
def deletar_pasta_empresa_handler(sender, instance, **kwargs):
    """
    Deleta a pasta da empresa e todo o seu conteúdo do sistema de arquivos
    APÓS o registro da Empresa ser deletado do banco de dados.
    """
    if not settings.MEDIA_ROOT:
        logger.error("MEDIA_ROOT não está configurado. Não é possível deletar a pasta da empresa.")
        return

    try:
        # PASSO CRÍTICO: Usa a MESMA função para gerar o nome da pasta, garantindo consistência.
        # A instância que é passada para o sinal post_delete ainda contém todos os dados do objeto deletado.
        company_folder_name = gerar_nome_pasta_empresa_padronizado(instance.nome)
        company_folder_path = os.path.join(settings.MEDIA_ROOT, company_folder_name)

        # Verifica se o diretório realmente existe antes de tentar deletar
        if os.path.isdir(company_folder_path):
            # shutil.rmtree() deleta a pasta e tudo dentro dela recursivamente (cuidado!)
            shutil.rmtree(company_folder_path)
            logger.info(f"Pasta da empresa '{instance.nome}' e todo o seu conteúdo foram deletados de: {company_folder_path}")
        else:
            # Isso é normal se a empresa foi criada antes da lógica de criação de pastas
            # ou se nunca teve nenhum arquivo carregado. Apenas registra um aviso.
            logger.warning(f"Tentativa de deletar pasta para a empresa '{instance.nome}', mas o diretório não foi encontrado em: {company_folder_path}")

    except Exception as e:
        # Captura qualquer exceção (ex: PermissionError no sistema de arquivos) para 
        # evitar que o sinal quebre a aplicação. Apenas registra o erro.
        logger.error(
            f"Erro ao tentar deletar a pasta para a empresa '{instance.nome}' (ID: {instance.id}). "
            f"Caminho: {company_folder_path if 'company_folder_path' in locals() else 'não determinado'}. Erro: {e}"
        )

@receiver(post_save, sender=Funcionario)
def assign_all_companies_to_new_user(sender, instance, created, **kwargs):
    """
    Quando um NOVO funcionário é criado, atribui TODAS as empresas existentes a ele.
    """
    if created and not instance.is_superuser:
        todas_as_empresas = Empresa.objects.all()
        instance.empresas_gerenciadas.set(todas_as_empresas)
        print(f"Todas as empresas foram atribuídas ao novo funcionário: {instance.username}")

@receiver(post_save, sender=Empresa)
def assign_new_company_to_all_users(sender, instance, created, **kwargs):
    """
    Quando uma NOVA empresa é criada, atribui ela a TODOS os funcionários existentes.
    """
    if created:
        todos_os_funcionarios = Funcionario.objects.filter(is_superuser=False)
        for funcionario in todos_os_funcionarios:
            funcionario.empresas_gerenciadas.add(instance)
        print(f"A nova empresa {instance.nome} foi atribuída a todos os funcionários.")

@receiver(post_save, sender=Empresa)
def notificar_sobre_mudanca_empresa(sender, instance, created, **kwargs):
    if created:
        mensagem = f"Nova empresa cadastrada: {instance.nome}"
    else:
        mensagem = f"Os dados da empresa {instance.nome} foram atualizados."

    todos_os_funcionarios = Funcionario.objects.filter(is_active=True)
    for funcionario in todos_os_funcionarios:
        Notificacao.objects.create(destinatario=funcionario, mensagem=mensagem)

@receiver(post_delete, sender=Empresa)
def notificar_sobre_delete_empresa(sender, instance, **kwargs):
    mensagem = f"A empresa {instance.nome} foi excluída do sistema."
    todos_os_funcionarios = Funcionario.objects.filter(is_active=True)
    for funcionario in todos_os_funcionarios:
        Notificacao.objects.create(destinatario=funcionario, mensagem=mensagem)
