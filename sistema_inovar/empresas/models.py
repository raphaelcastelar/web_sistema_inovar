from django.db import models

class Empresa(models.Model):
    nome = models.CharField(max_length=100)
    cnpj = models.CharField(max_length=14, unique=True)
    email = models.EmailField()
    telefone = models.CharField(max_length=15, blank=True)
    flags = models.JSONField(null=True, blank=True, default=list)

    def __str__(self):
        return self.nome