from types import SimpleNamespace

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework import serializers

from .models import Empresa
from .serializers import EmpresaAvulsaFaturamentoSerializer, EmpresaSerializer
from .utils import format_cnpj, is_valid_cnpj, normalize_cnpj


class CnpjUtilsTests(SimpleTestCase):
    def test_accepts_official_alphanumeric_example(self):
        self.assertTrue(is_valid_cnpj('12.ABC.345/01DE-35'))

    def test_accepts_legacy_numeric_cnpj(self):
        self.assertTrue(is_valid_cnpj('12.345.678/0001-95'))

    def test_rejects_invalid_check_digits_and_letters_in_check_digits(self):
        self.assertFalse(is_valid_cnpj('12.ABC.345/01DE-36'))
        self.assertFalse(is_valid_cnpj('12.ABC.345/01DE-3A'))

    def test_normalizes_lowercase_without_discarding_letters(self):
        self.assertEqual(normalize_cnpj('12.abc.345/01de-35'), '12ABC34501DE35')
        self.assertEqual(format_cnpj('12abc34501de35'), '12.ABC.345/01DE-35')


class EmpresaAvulsaCnpjSerializerTests(SimpleTestCase):
    def test_normalizes_valid_alphanumeric_cnpj(self):
        serializer = EmpresaAvulsaFaturamentoSerializer(
            data={'nome': 'Empresa teste', 'cnpj': '12abc34501de35'}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['cnpj'], '12.ABC.345/01DE-35')

    def test_rejects_invalid_cnpj(self):
        serializer = EmpresaAvulsaFaturamentoSerializer(
            data={'nome': 'Empresa teste', 'cnpj': '12.ABC.345/01DE-36'}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn('cnpj', serializer.errors)


class EmpresaEmailSerializerTests(SimpleTestCase):
    def test_email_is_optional_on_create_and_update(self):
        field = EmpresaSerializer().fields['email']

        self.assertFalse(field.required)
        self.assertTrue(field.allow_blank)
        self.assertEqual(field.run_validation(''), '')

    def test_validates_format_when_email_is_informed(self):
        field = EmpresaSerializer().fields['email']

        with self.assertRaises(serializers.ValidationError):
            field.run_validation('email-invalido')


class EmpresaStatusHistoryTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='responsavel-status',
            password='senha-teste',
        )
        self.empresa = Empresa.objects.create(
            nome='Empresa com histórico',
            cnpj='12.345.678/0001-95',
            email='',
            telefone='5522999998888',
        )

    def test_records_deactivation_and_reactivation(self):
        request = SimpleNamespace(user=self.user)

        serializer = EmpresaSerializer(
            self.empresa,
            data={'ativo': False},
            partial=True,
            context={'request': request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.empresa.refresh_from_db()

        self.assertIsNotNone(self.empresa.criado_em)
        self.assertIsNotNone(self.empresa.desativado_em)
        desativacao = self.empresa.historico_status.get()
        self.assertTrue(desativacao.status_anterior)
        self.assertFalse(desativacao.novo_status)
        self.assertEqual(desativacao.alterado_por, self.user)

        serializer = EmpresaSerializer(
            self.empresa,
            data={'ativo': True},
            partial=True,
            context={'request': request},
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        self.empresa.refresh_from_db()

        self.assertIsNone(self.empresa.desativado_em)
        self.assertEqual(self.empresa.historico_status.count(), 2)
        reativacao = self.empresa.historico_status.first()
        self.assertFalse(reativacao.status_anterior)
        self.assertTrue(reativacao.novo_status)
