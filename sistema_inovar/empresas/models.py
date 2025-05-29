from django.db import models
import logging

logger = logging.getLogger(__name__)

class Empresa(models.Model):
    id = models.AutoField(primary_key=True)
    nome = models.CharField(max_length=100, null=False)
    cnpj = models.CharField(max_length=18, unique=True, null=False)
    email = models.CharField(max_length=255, null=False)

    def __str__(self):
        return self.nome

class DocumentosConstitutivos(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    nome_empresa = models.CharField(max_length=255, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)  # Aumentado para 50
    caminho_arquivo = models.FileField(upload_to='documentos_constitutivos/', null=False)

    class Meta:
        unique_together = ('nome_arquivo', 'nome_empresa', 'tipo_documento')

    def save(self, *args, **kwargs):
        logger.info(f"Salvando DocumentosConstitutivos: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.nome_empresa}"

class XML(models.Model):
    id = models.AutoField(primary_key=True)
    nome_arquivo = models.CharField(max_length=255, null=False)
    cnpj_empresa = models.CharField(max_length=18, null=False)
    tipo_documento = models.CharField(max_length=50, null=False)
    caminho_arquivo = models.FileField(upload_to='xml/', null=False)
    mes = models.CharField(max_length=20, null=False)
    ano = models.CharField(max_length=4, null=False)

    def save(self, *args, **kwargs):
        logger.info(f"Salvando XML: {self.nome_arquivo}")
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.nome_arquivo} - {self.cnpj_empresa}"

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