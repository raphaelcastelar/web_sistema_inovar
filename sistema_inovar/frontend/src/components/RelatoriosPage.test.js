import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axiosInstance from '../api/axiosInstance';
import RelatoriosPage from './RelatoriosPage';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

const companies = [
  {
    id: 1,
    nome: 'Empresa Alpha',
    cnpj: '12345678000190',
    cidade: 'Niterói',
    uf: 'RJ',
    ativo: true,
    regime_tributario: 'Simples Nacional',
    carteira_clientes: 'Carteira A',
    porte_empresa: 'ME',
    inss: true,
    fgts: false,
    folha: true,
    honorario: false,
    simples_nacional: true,
    valor_honorario: '900.00',
    usuarios: [3],
    socios: [{ id: 10, nome: 'Ana Souza', cpf: '12345678901' }],
    tags: [{ id: 5, nome: 'Fiscal' }],
  },
  {
    id: 2,
    nome: 'Empresa Inativa',
    cnpj: '98765432000110',
    ativo: false,
    inss: false,
    fgts: false,
    folha: false,
    honorario: false,
    simples_nacional: false,
  },
];

beforeEach(() => {
  axiosInstance.get.mockImplementation((url) => Promise.resolve({
    data: url.includes('/empresas/') ? companies : [],
  }));
});

afterEach(() => jest.clearAllMocks());

test('monta a matriz de obrigações e permite personalizar as colunas', async () => {
  render(<RelatoriosPage />);

  expect(screen.getByRole('heading', { name: 'Relatórios' })).toBeInTheDocument();
  expect(await screen.findByText('Empresa Alpha')).toBeInTheDocument();
  expect(screen.queryByText('Empresa Inativa')).not.toBeInTheDocument();
  expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('checkbox', { name: 'FGTS' }));
  await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'FGTS' })).not.toBeInTheDocument());
});

test('troca o tipo de relatório e aplica a busca à prévia', async () => {
  render(<RelatoriosPage />);
  await screen.findByText('Empresa Alpha');

  fireEvent.click(screen.getByRole('button', { name: /Cadastro de empresas/ }));
  expect(screen.getByRole('columnheader', { name: 'CNPJ' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Buscar empresa'), { target: { value: 'empresa inexistente' } });
  expect(await screen.findByText('Nenhum registro encontrado com os filtros atuais.')).toBeInTheDocument();
});
