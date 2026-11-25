"""Permissões do Monitor Fiscal integradas ao controle de usuários existente.

Administradores (is_staff, superusuário ou cargo "admin") têm todas as
permissões. Os demais cargos recebem um conjunto padrão de leitura/operação;
permissões sensíveis (certificados, manifestação, ciência automática, ativação,
logs e integrações) exigem a permissão Django explícita
"monitor_fiscal.<codigo>", concedida pelo admin do Django.
"""
from empresas.models import Empresa
from rest_framework.permissions import BasePermission

PERMISSOES = (
    'view_documentofiscal', 'baixar_documentos', 'importar_xml', 'consultar_relatorios', 'visualizar_tributos',
    'realizar_manifestacao', 'configurar_ciencia_automatica', 'gerenciar_certificados', 'ativar_monitoramento',
    'solicitar_sincronizacao', 'gerenciar_alertas', 'acessar_logs', 'configurar_integracoes',
)

PADRAO_POR_CARGO = {
    'fiscal': {
        'view_documentofiscal', 'baixar_documentos', 'importar_xml', 'consultar_relatorios', 'visualizar_tributos',
        'solicitar_sincronizacao', 'gerenciar_alertas',
    },
    'contabil': {
        'view_documentofiscal', 'baixar_documentos', 'importar_xml', 'consultar_relatorios', 'visualizar_tributos',
        'gerenciar_alertas',
    },
}


def eh_administrador(usuario):
    return bool(usuario and usuario.is_authenticated and (
        usuario.is_superuser or usuario.is_staff or getattr(usuario, 'cargo', '') == 'admin'
    ))


def tem_permissao(usuario, codigo):
    if not usuario or not usuario.is_authenticated:
        return False
    if eh_administrador(usuario):
        return True
    if usuario.has_perm(f'monitor_fiscal.{codigo}'):
        return True
    return codigo in PADRAO_POR_CARGO.get(getattr(usuario, 'cargo', ''), set())


def permissoes_do_usuario(usuario):
    return sorted(codigo for codigo in PERMISSOES if tem_permissao(usuario, codigo))


def empresas_acessiveis(usuario):
    """Isolamento de dados: somente empresas atribuídas ao usuário."""
    if not usuario or not usuario.is_authenticated:
        return Empresa.objects.none()
    if eh_administrador(usuario):
        return Empresa.objects.all()
    if getattr(usuario, 'cargo', '') == 'cliente':
        return Empresa.objects.none()
    return usuario.empresas_gerenciadas.all()


def pode_acessar_empresa(usuario, empresa_id):
    return empresas_acessiveis(usuario).filter(pk=empresa_id).exists()


def requer(codigo):
    class _Permissao(BasePermission):
        message = 'Você não possui permissão para esta operação do Monitor Fiscal.'

        def has_permission(self, request, view):
            return tem_permissao(request.user, codigo)

    _Permissao.__name__ = f'Requer_{codigo}'
    return _Permissao
