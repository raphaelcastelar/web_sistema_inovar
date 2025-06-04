# empresas/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.conf import settings
import os
import re
import unidecode
import logging
import datetime

from .models import Empresa

logger = logging.getLogger(__name__)

# Mantenha sua função get_uppercased_empresa_name_folder como definida anteriormente
# Ela deve retornar o nome da pasta da empresa em maiúsculas, baseado no nome da empresa.
# Exemplo da função (certifique-se que a sua está correta):
def get_uppercased_empresa_name_folder(empresa_instance):
    company_name_str = empresa_instance.nome
    if not company_name_str:
        logger.warning(f"Empresa ID: {empresa_instance.id} não possui nome. Usando fallback.")
        return f"EMPRESA_ID_{empresa_instance.id}" # Fallback
    name_no_accents = unidecode.unidecode(str(company_name_str))
    name_underscored = re.sub(r'[\s.\-]+', '_', name_no_accents)
    name_sanitized = re.sub(r'[^\w_]', '', name_underscored)
    name_upper = name_sanitized.upper()
    if not name_upper:
        logger.warning(f"Nome da empresa '{company_name_str}' resultou em nome de pasta vazio. Usando fallback.")
        return f"EMPRESA_ID_{empresa_instance.id}_NOME_INVALIDO"
    return name_upper


@receiver(post_save, sender=Empresa)
def criar_pastas_empresa_handler(sender, instance, created, **kwargs):
    """
    Cria as pastas base para uma empresa recém-criada, incluindo
    subestrutura de ANO/MESANO para tipos de documento específicos.
    """
    if created: # Executa apenas quando um novo registro de Empresa é criado
        if not settings.MEDIA_ROOT:
            logger.error("MEDIA_ROOT não está configurado nas settings. Não é possível criar pastas da empresa.")
            return

        try:
            company_folder_name = get_uppercased_empresa_name_folder(instance)
            base_company_path = os.path.join(settings.MEDIA_ROOT, company_folder_name)

            # Cria a pasta base da empresa
            os.makedirs(base_company_path, exist_ok=True)
            logger.info(f"Pasta base criada para '{instance.nome}': {base_company_path}")

            # Define quais subpastas precisam da estrutura ANO/MESANO
            # True = precisa, False = não precisa
            tipos_de_pasta_config = {
                'DOCUMENTOS CONSTITUTIVOS': False,
                'OUTROS': False,
                'DEPARTAMENTO PESSOAL': True,
                'SIMPLES NACIONAL': True,
                'XML': True
            }

            # Obtém o ano e mês atuais para as subpastas
            hoje = datetime.date.today()
            ano_atual_str = str(hoje.year)  # Ex: "2025"
            mes_atual_str = hoje.strftime("%m")  # Ex: "06" para Junho

            for nome_pasta_tipo, criar_subestrutura_data in tipos_de_pasta_config.items():
                caminho_pasta_tipo = os.path.join(base_company_path, nome_pasta_tipo)
                os.makedirs(caminho_pasta_tipo, exist_ok=True)
                logger.info(f"Subpasta de tipo criada: {caminho_pasta_tipo}")

                if criar_subestrutura_data:
                    # Cria a pasta do ANO ATUAL (ex: .../DEPARTAMENTO PESSOAL/2025/)
                    caminho_pasta_ano = os.path.join(caminho_pasta_tipo, ano_atual_str)
                    os.makedirs(caminho_pasta_ano, exist_ok=True)
                    logger.info(f"Subpasta de ANO criada: {caminho_pasta_ano}")

                    # Cria a pasta MESANO ATUAL (ex: .../DEPARTAMENTO PESSOAL/2025/062025/)
                    nome_pasta_mes_ano = f"{mes_atual_str}{ano_atual_str}" # Ex: "062025"
                    caminho_pasta_mes_ano = os.path.join(caminho_pasta_ano, nome_pasta_mes_ano)
                    os.makedirs(caminho_pasta_mes_ano, exist_ok=True)
                    logger.info(f"Subpasta de MESANO criada: {caminho_pasta_mes_ano}")

        except Exception as e:
            logger.error(f"Erro ao criar pastas para a empresa '{instance.nome}' (ID: {instance.id}): {e}")