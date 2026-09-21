import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axiosInstance from '../api/axiosInstance';
import CalendarioPage from './CalendarioPage';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
}));

const today = () => {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

beforeEach(() => {
  axiosInstance.get.mockImplementation((url) => {
    if (url.endsWith('/contexto/')) return Promise.resolve({ data: {
      usuario: { id: 1, nome: 'Raphael', papel: 'admin', acesso: 'administrador' },
      usuarios: [{ id: 1, nome: 'Raphael', ativo: true }],
      empresas: [{ id: 10, nome: 'Empresa Exemplo' }],
    } });
    return Promise.resolve({ data: [{
      id: 20,
      titulo: 'Conferir documentos',
      descricao: 'Revisão mensal',
      tipo: 'tarefa',
      responsavelId: 1,
      responsavelNome: 'Raphael',
      empresaId: 10,
      empresaNome: 'Empresa Exemplo',
      dataPlanejada: today(),
      prazo: today(),
      prioridade: 'alta',
      estado: 'a_fazer',
      privada: false,
    }] });
  });
});

afterEach(() => jest.clearAllMocks());

test('carrega atividades e alterna entre mês, semana, dia e lista', async () => {
  render(<CalendarioPage />);

  expect(await screen.findByRole('heading', { name: 'Calendário' })).toBeInTheDocument();
  expect(screen.getAllByText('Conferir documentos').length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: /Semana/ }));
  expect(screen.getByRole('region', { name: 'Agenda por horários' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /^Dia$/ }));
  expect(screen.getByRole('region', { name: 'Agenda por horários' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Lista/ }));
  expect(screen.getByText('Todas as atividades')).toBeInTheDocument();
  expect(screen.getByText('Conferir documentos')).toBeInTheDocument();
});

test('abre o formulário de nova atividade na data selecionada', async () => {
  render(<CalendarioPage />);

  fireEvent.click(await screen.findByRole('button', { name: /Nova atividade/ }));

  expect(screen.getByRole('dialog', { name: 'Nova atividade' })).toBeInTheDocument();
  expect(screen.getByLabelText(/Data planejada/)).toHaveValue(today());
});

test('reagenda uma tarefa ao arrastar para outro dia', async () => {
  const destination = new Date(`${today()}T12:00:00`);
  destination.setDate(destination.getDate() + 1);
  const destinationKey = [destination.getFullYear(), String(destination.getMonth() + 1).padStart(2, '0'), String(destination.getDate()).padStart(2, '0')].join('-');
  axiosInstance.patch.mockResolvedValue({ data: {
    id: 20,
    titulo: 'Conferir documentos',
    tipo: 'tarefa',
    responsavelId: 1,
    dataPlanejada: destinationKey,
    prioridade: 'alta',
    estado: 'a_fazer',
    privada: false,
  } });
  render(<CalendarioPage />);

  const calendar = await screen.findByRole('grid');
  const card = within(calendar).getByRole('button', { name: /Conferir documentos/ });
  const dayLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(destination);
  const target = within(calendar).getByRole('button', { name: dayLabel }).closest('[role="gridcell"]');
  const dataTransfer = { setData: jest.fn(), effectAllowed: '' };

  fireEvent.dragStart(card, { dataTransfer });
  fireEvent.drop(target, { dataTransfer });

  await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith(
    '/api/atividades/20/', { dataPlanejada: destinationKey },
  ));
});
