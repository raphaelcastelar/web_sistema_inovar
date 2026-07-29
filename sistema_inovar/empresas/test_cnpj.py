from django.test import SimpleTestCase

from .serializers import EmpresaAvulsaFaturamentoSerializer
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
