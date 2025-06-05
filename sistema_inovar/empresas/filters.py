# empresas/filters.py
from django_filters import rest_framework as filters
from .models import HistoricoEnvios

class HistoricoEnviosFilter(filters.FilterSet):
    # Permite filtrar pelo ano e mês do campo 'data_hora'
    year = filters.NumberFilter(field_name='data_hora', lookup_expr='year')
    month = filters.NumberFilter(field_name='data_hora', lookup_expr='month')

    class Meta:
        model = HistoricoEnvios
        # Adicione outros campos que você queira filtrar no futuro, como 'status'
        fields = ['year', 'month', 'status']