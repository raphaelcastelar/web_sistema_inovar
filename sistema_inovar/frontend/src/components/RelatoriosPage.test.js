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
  expect(screen.getByRole('columnheader', { name: 'Pendências de obrigações' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'FGTS' }));
  await waitFor(() => expect(screen.queryByRole('columnheader', { name: 'FGTS' })).not.toBeInTheDocument());
});

test('aplica um modelo, permite adicionar colunas e filtra por situação', async () => {
  render(<RelatoriosPage />);
  await screen.findByText('Empresa Alpha');

  fireEvent.change(screen.getByRole('combobox', { name: 'Modelo pronto' }), { target: { value: 'cadastro' } });
  expect(screen.getByRole('columnheader', { name: 'E-mail' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('checkbox', { name: 'Valor do honorário' }));
  expect(screen.getByRole('columnheader', { name: 'Valor do honorário' })).toBeInTheDocument();

  fireEvent.change(screen.getByRole('combobox', { name: 'Situação' }), { target: { value: 'inativas' } });
  expect(await screen.findByText('Empresa Inativa')).toBeInTheDocument();
  expect(screen.queryByText('Empresa Alpha')).not.toBeInTheDocument();
});

test('exporta somente as colunas escolhidas e os dois filtros permitidos', async () => {
  axiosInstance.post.mockResolvedValue({ data: new Blob(['xlsx']), headers: {} });
  window.URL.createObjectURL = jest.fn(() => 'blob:report');
  window.URL.revokeObjectURL = jest.fn();
  HTMLAnchorElement.prototype.click = jest.fn();

  render(<RelatoriosPage />);
  await screen.findByText('Empresa Alpha');
  fireEvent.change(screen.getByRole('combobox', { name: 'Modelo pronto' }), { target: { value: 'cadastro' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Carteira' }), { target: { value: 'Carteira A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Exportar relatório' }));

  await waitFor(() => expect(axiosInstance.post).toHaveBeenCalled());
  const payload = axiosInstance.post.mock.calls[0][1];
  expect(payload.report_type).toBe('personalizado');
  expect(payload.filters.carteira).toBe('Carteira A');
  expect(payload.filters.status_empresa).toBe('ativas');
  expect(payload.filters.columns).toContain('email');
  expect(Object.keys(payload.filters).sort()).toEqual(['carteira', 'columns', 'status_empresa']);
});

test('mantém os filtros visíveis e limita a altura da prévia com rolagem', async () => {
  render(<RelatoriosPage />);
  await screen.findByText('Empresa Alpha');

  expect(screen.getByRole('combobox', { name: 'Carteira' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Colunas do relatório' })).toBeVisible();
  expect(screen.getByTestId('report-preview-scroll')).toHaveClass('max-h-[70vh]', 'overflow-auto');
});
