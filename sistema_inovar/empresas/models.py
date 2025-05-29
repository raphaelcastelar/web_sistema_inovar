from django.db import models

class Empresa(models.Model):
    nome = models.CharField(max_length=100)
    cnpj = models.CharField(max_length=14, unique=True)
    email = models.EmailField()
    telefone = models.CharField(max_length=15, blank=True)
    flags = models.JSONField(null=True, blank=True, default=list)

    def __str__(self):
        return self.nome

class Pasta(models.Model):
    TIPO_PASTA_CHOICES = [
        ('documentos_constitutivos', 'Documentos Constitutivos'),
        ('departamento_pessoal', 'Departamento Pessoal'),
        ('xml', 'XML'),
        ('simples_nacional', 'Simples Nacional'),
        ('outros', 'Outros'),
    ]
    empresa = models.ForeignKey(Empresa, on_delete=models.CASCADE, related_name='pastas')
    tipo = models.CharField(max_length=50, choices=TIPO_PASTA_CHOICES)

    def __str__(self):
        return f"{self.get_tipo_display()} - {self.empresa.nome}"

class Arquivo(models.Model):
    pasta = models.ForeignKey(Pasta, on_delete=models.CASCADE, related_name='arquivos')
    nome = models.CharField(max_length=255)
    arquivo = models.FileField(upload_to='uploads/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.nome