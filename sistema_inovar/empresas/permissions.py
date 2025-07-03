from rest_framework.permissions import BasePermission
from .models import Empresa

class IsPessoalOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        # Permite todos os métodos para admins
        if request.user.is_staff or request.user.is_superuser:
            return True
        # Para usuários com cargo 'pessoal', permite GET e PATCH em empresas gerenciadas
        if request.user.cargo == 'pessoal' and obj in request.user.empresas_gerenciadas.all():
            if request.method == 'PATCH':
                # Verifica se apenas campos permitidos estão sendo atualizados
                allowed_fields = {'inss', 'fgts', 'folha', 'honorario'}
                requested_fields = set(request.data.keys())
                if requested_fields.issubset(allowed_fields):
                    return True
            elif request.method == 'GET':
                return True
        return False