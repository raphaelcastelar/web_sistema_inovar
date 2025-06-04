# empresas/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
from .utils import gerar_nome_pasta_empresa_padronizado
import os
import re
import unidecode # Lembre-se: pip install unidecode
import logging

from .models import Empresa

logger = logging.getLogger(__name__)

def get_uppercased_empresa_name_folder_para_sinal(empresa_instance): # Nome específico para o sinal
    return gerar_nome_pasta_empresa_padronizado(empresa_instance.nome)

@receiver(post_save, sender=Empresa)
def criar_pastas_empresa_handler(sender, instance, created, **kwargs):
    if created:
        company_folder_name = get_uppercased_empresa_name_folder_para_sinal(instance)
        if not settings.MEDIA_ROOT:
            logger.error("MEDIA_ROOT não está configurado nas settings. Não é possível criar pastas da empresa.")
            return

        try:
            base_company_path = os.path.join(settings.MEDIA_ROOT, company_folder_name)

            os.makedirs(base_company_path, exist_ok=True)
            logger.info(f"Pasta base criada para '{instance.nome}': {base_company_path}")

            # Os nomes das subpastas de tipo de documento já estão em maiúsculas, o que é bom.
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