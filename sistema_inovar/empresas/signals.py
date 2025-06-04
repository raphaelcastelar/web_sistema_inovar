# empresas/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings # Para acessar MEDIA_ROOT
import os
import re
import unidecode # Lembre-se de ter instalado: pip install unidecode
import logging

from .models import Empresa # Importe seu modelo Empresa

logger = logging.getLogger(__name__)

def get_folder_name_for_empresa(empresa_instance):
    """
    Gera um nome de pasta seguro para a instância da Empresa.
    Prioriza o CNPJ, caso contrário, usa o nome da empresa.
    Esta função DEVE gerar o MESMO identificador que a sua função
    get_company_folder_identifier(instance_obj) usada nas funções upload_to
    dos modelos de documento, quando aplicada à mesma empresa.
    """
    identifier = None
    if empresa_instance.cnpj:
        # Remove caracteres não alfanuméricos do CNPJ para usar como nome de pasta
        identifier = re.sub(r'[^a-zA-Z0-9]', '', str(empresa_instance.cnpj))
    elif empresa_instance.nome:
        # Usa o nome da empresa, removendo acentos e substituindo espaços e caracteres especiais
        nome_limpo = unidecode.unidecode(str(empresa_instance.nome))
        identifier_temp = re.sub(r'\s+', '_', nome_limpo) # Substitui espaços por underscore
        identifier = re.sub(r'[^\w-]', '', identifier_temp) # Remove outros caracteres não seguros
    
    if not identifier: # Fallback muito básico
        logger.warning(f"Não foi possível gerar identificador de pasta para a empresa ID: {empresa_instance.id}, usando fallback.")
        return f"empresa_id_{empresa_instance.id}"
    return identifier

@receiver(post_save, sender=Empresa)
def criar_pastas_empresa_handler(sender, instance, created, **kwargs):
    """
    Cria as pastas base para uma empresa recém-criada.
    """
    if created: # Executa apenas quando um novo registro de Empresa é criado
        if not settings.MEDIA_ROOT:
            logger.error("MEDIA_ROOT não está configurado nas settings. Não é possível criar pastas da empresa.")
            return

        try:
            company_folder_name = get_folder_name_for_empresa(instance)
            base_company_path = os.path.join(settings.MEDIA_ROOT, company_folder_name)

            # Cria a pasta base da empresa
            os.makedirs(base_company_path, exist_ok=True)
            logger.info(f"Pasta base criada para '{instance.nome}': {base_company_path}")

            # Lista dos subdiretórios principais para os tipos de documento
            # Estes nomes DEVEM CORRESPONDER aos nomes das pastas de segundo nível
            # criados pelas suas funções `upload_to` dos modelos de documento.
            document_type_subfolders = [
                'DOCUMENTOS CONSTITUTIVOS',
                'OUTROS',
                'DEPARTAMENTO PESSOAL',
                'SIMPLES NACIONAL',
                'XML'
            ]

            for subfolder_name in document_type_subfolders:
                path_to_create = os.path.join(base_company_path, subfolder_name)
                os.makedirs(path_to_create, exist_ok=True)
                logger.info(f"Subpasta criada: {path_to_create}")

        except Exception as e:
            logger.error(f"Erro ao criar pastas para a empresa '{instance.nome}' (ID: {instance.id}): {e}")