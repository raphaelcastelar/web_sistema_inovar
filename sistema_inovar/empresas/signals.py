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
def gerar_nome_pasta_empresa_com_espacos_e_maiusculas(nome_da_empresa_str):
    # ... (lógica completa da função como mostrado acima) ...
    if not nome_da_empresa_str:
        logger.warning("Tentativa de gerar nome de pasta para empresa sem nome.")
        return "EMPRESA_SEM_NOME_DEFINIDO" 
    nome_sem_acentos = unidecode.unidecode(str(nome_da_empresa_str))
    caracteres_invalidos_pattern = r'[<>:"/\\|?*\x00-\x1F]'
    nome_sanitizado_parcial = re.sub(caracteres_invalidos_pattern, '', nome_sem_acentos)
    nome_com_espacos_normalizados = re.sub(r'\s+', ' ', nome_sanitizado_parcial).strip()
    nome_final_pasta = nome_com_espacos_normalizados.upper()
    if not nome_final_pasta:
        logger.warning(f"Nome da empresa '{nome_da_empresa_str}' resultou em nome de pasta vazio.")
        return "NOME_EMPRESA_INVALIDO_PARA_PASTA"
    return nome_final_pasta


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
            company_folder_name = gerar_nome_pasta_empresa_com_espacos_e_maiusculas(instance)
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