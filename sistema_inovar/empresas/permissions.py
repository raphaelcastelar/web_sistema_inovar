from rest_framework.permissions import BasePermission
from .models import Empresa

class IsPessoalOrFiscalOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        print(f"Usuário: {request.user.username}, Cargo: {request.user.cargo}, Empresas Gerenciadas: {[e.id for e in request.user.empresas_gerenciadas.all()]}")
        print(f"Empresa ID: {obj.id}, Método: {request.method}, Dados: {request.data}")
        
        # Allow all methods for admins
        if request.user.is_staff or request.user.is_superuser:
            print("Permissão concedida: Usuário é admin")
            return True
        
        # Check if the company is managed by the user
        if obj in request.user.empresas_gerenciadas.all():
            if request.method == 'PATCH':
                requested_fields = set(request.data.keys())
                
                # Define allowed fields per role
                allowed_fields_pessoal = {'inss', 'fgts', 'folha', 'honorario'}
                allowed_fields_fiscal = {'simples_nacional'}
                
                # Allow 'pessoal' users to update their fields
                if request.user.cargo == 'pessoal' and requested_fields.issubset(allowed_fields_pessoal):
                    print("Permissão concedida: Usuário 'pessoal' atualizando campos permitidos")
                    return True
                
                # Allow 'fiscal' users to update their fields
                if request.user.cargo == 'fiscal' and requested_fields.issubset(allowed_fields_fiscal):
                    print("Permissão concedida: Usuário 'fiscal' atualizando campos permitidos")
                    return True
                
                print(f"Permissão negada: Campos solicitados {requested_fields} não estão permitidos para o cargo {request.user.cargo}")
            elif request.method == 'GET':
                if request.user.cargo in ['pessoal', 'fiscal']:
                    print(f"Permissão concedida: Usuário '{request.user.cargo}' acessando GET")
                    return True
        
        print("Permissão negada")
        return False