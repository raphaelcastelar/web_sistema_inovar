from django.db import models
import logging
import os
import unidecode # Certifique-se de ter o unidecode instalado: pip install unidecode

logger = logging.getLogger(__name__)

class Empresa(models.Model):
    id = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100, null=False)
    cnpj = models.CharField(max_length=18, unique=True, null=False)
    email = models.CharField(max_length=255, null=False)
    telefone = models.CharField(max_length=15, null=True, blank=True)

    def __str__(self):
        return self.nome

class DocumentosConstitutivos(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)
    caminho_arquivo = models.FileField(upload_to='documentos_constitutivos/', null=False)

    class Meta:
        unique_together = ('nome_arquivo', 'nome_empresa', 'tipo_documento')
        db_table = 'empresas_documentosconstitutivos'

    def save(self, *args, **kwargs):
        logger.info(f"Salvando DocumentosConstitutivos: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.nome_empresa}"

# Função para gerar o caminho de upload para os arquivos XML
def xml_upload_to_path(instance, filename):
    ano = str(instance.ano)
    mes = str(instance.mes) # Recebe o nome do mês, ex: "janeiro"

    # Normaliza o nome do mês para uso em diretório (opcional, mas recomendado)
    # Ex: "janeiro" -> "janeiro"; se quisesse remover acentos: unidecode.unidecode(mes.lower())
    mes_dir_name = unidecode.unidecode(mes.lower().replace(' ', '_'))

    # Limpa o CNPJ para ser usado como nome de diretório
    cnpj_dir_name = str(instance.cnpj_empresa).replace('/', '_').replace('.', '').replace('-', '')

    # Limpa o nome do arquivo para evitar problemas no sistema de arquivos
    base, ext = os.path.splitext(filename)
    clean_filename = f"{unidecode.unidecode(base)}{ext}"

    return f'xml/{cnpj_dir_name}/{ano}/{mes_dir_name}/{clean_filename}'

class XML(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    cnpj_empresa = models.CharField(max_length=18, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)
    # Atualizado o upload_to para usar a função dinâmica
    caminho_arquivo = models.FileField(upload_to=xml_upload_to_path, null=False)
    mes = models.CharField(max_length=20, null=False) # Ex: "janeiro", "fevereiro"
    ano = models.CharField(max_length=4, null=False)  # Ex: "2023"

    # Adicionando unique_together para evitar duplicidade exata de arquivos no mesmo mês/ano/empresa
    # class Meta:
    #     unique_together = ('nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'mes', 'ano')
    #     # Considere adicionar o db_table se já existir com outro nome
    #     # db_table = 'empresas_xml' # Se o nome da tabela for diferente do padrão gerado pelo Django

    def save(self, *args, **kwargs):
        logger.info(f"Salvando XML: {self.nome_arquivo} em xml/{self.cnpj_empresa}/{self.ano}/{self.mes}/")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa} ({self.mes}/{self.ano})"

class DepartamentoPessoal(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    cnpj_empresa = models.CharField(max_length=18, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)
    caminho_arquivo = models.FileField(upload_to='departamento_pessoal/', null=False)
    mes = models.CharField(max_length=20, null=False)
    ano = models.CharField(max_length=4, null=False)
    entregue = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        logger.info(f"Salvando DepartamentoPessoal: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"

class SimplesNacional(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    cnpj_empresa = models.CharField(max_length=18, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)
    caminho_arquivo = models.FileField(upload_to='simples_nacional/', null=False)
    mes = models.CharField(max_length=20, null=False)
    ano = models.CharField(max_length=4, null=False)
    entregue = models.BooleanField(default=False)

    class Meta:
        unique_together = ('nome_arquivo', 'cnpj_empresa', 'tipo_documento', 'mes', 'ano')

    def save(self, *args, **kwargs):
        logger.info(f"Salvando SimplesNacional: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"

class Outros(models.Model):
    nome_arquivo = models.CharField(max_length=255)
    nome_empresa = models.CharField(max_length=255)
    tipo_documento = models.CharField(max_length=10) # O modelo original estava como 10, mantido
    caminho_arquivo = models.FileField()

    class Meta:
        db_table = 'outros'

    def __str__(self):
        return self.nome_arquivo