import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axiosInstance from '../api/axiosInstance';
import TarefasPage from './TarefasPage';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(),
}));

const dateKey = (offset = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
};

const task = {
  id: 20, titulo: 'Conferir documentos', tipo: 'tarefa', responsavelId: 1,
  responsavelNome: 'Raphael', empresaId: 10, empresaNome: 'Empresa Exemplo',
  dataPlanejada: dateKey(), prazo: dateKey(), prioridade: 'alta', estado: 'a_fazer',
  privada: false, frequencia: 'nenhuma',
};
const meeting = {
  id: 21, titulo: 'Reunião de fechamento', tipo: 'compromisso', responsavelId: 2,
  responsavelNome: 'Ana', empresaId: 10, empresaNome: 'Empresa Exemplo',
  inicio: `${dateKey(1)}T10:00:00`, termino: `${dateKey(1)}T11:00:00`,
  prazo: null, prioridade: 'normal', estado: 'em_andamento', privada: false,
};

beforeEach(() => {
  axiosInstance.get.mockImplementation((url) => {
    if (url.endsWith('/contexto/')) return Promise.resolve({ data: {
      usuario: { id: 1, nome: 'Raphael', papel: 'admin', acesso: 'administrador' },
      usuarios: [{ id: 1, nome: 'Raphael' }, { id: 2, nome: 'Ana' }],
      empresas: [{ id: 10, nome: 'Empresa Exemplo' }],
    } });
    return Promise.resolve({ data: [task, meeting] });
  });
  axiosInstance.patch.mockImplementation((url, payload) => Promise.resolve({ data: {
    ...(url.includes('/21/') ? meeting : task), ...payload,
  } }));
});

afterEach(() => jest.clearAllMocks());

test('carrega a equipe e filtra pelo tipo de atividade', async () => {
  render(<TarefasPage />);

  expect(await screen.findByRole('heading', { name: 'Tarefas' })).toBeInTheDocument();
  expect(await screen.findByText('Conferir documentos')).toBeInTheDocument();
  expect(screen.getByText('Reunião de fechamento')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Filtros/ }));
  fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'compromisso' } });

  expect(screen.queryByText('Conferir documentos')).not.toBeInTheDocument();
  expect(screen.getByText('Reunião de fechamento')).toBeInTheDocument();
});

test('mostra cards e grupos enquanto os dados carregam', () => {
  axiosInstance.get.mockImplementation(() => new Promise(() => {}));

  render(<TarefasPage />);

  expect(screen.getByRole('heading', { name: 'Tarefas' })).toBeInTheDocument();
  expect(screen.getByText('Todas')).toBeInTheDocument();
  expect(screen.getByText('A fazer')).toBeInTheDocument();
  expect(screen.queryByText(/Carregando tarefas/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Nova atividade/ })).toBeDisabled();
});

test('reagenda uma tarefa pela ação rápida', async () => {
  render(<TarefasPage />);
  await screen.findByText('Conferir documentos');

  fireEvent.click(screen.getByRole('button', { name: 'Reagendar Conferir documentos' }));
  fireEvent.change(screen.getByLabelText('Nova data de Conferir documentos'), { target: { value: dateKey(2) } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

  await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith(
    '/api/atividades/20/', { dataPlanejada: dateKey(2) },
  ));
});

test('reagenda um compromisso preservando o horário e a duração', async () => {
  render(<TarefasPage />);
  await screen.findByText('Reunião de fechamento');

  fireEvent.click(screen.getByRole('button', { name: 'Reagendar Reunião de fechamento' }));
  fireEvent.change(screen.getByLabelText('Nova data de Reunião de fechamento'), { target: { value: dateKey(3) } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

  await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith(
    '/api/atividades/21/',
    { inicio: `${dateKey(3)}T10:00`, termino: `${dateKey(3)}T11:00` },
  ));
});

test('administrador atribui uma tarefa sem abrir o formulário completo', async () => {
  render(<TarefasPage />);
  await screen.findByText('Conferir documentos');

  fireEvent.click(screen.getByRole('button', { name: 'Atribuir responsável para Conferir documentos' }));
  fireEvent.change(screen.getByLabelText('Novo responsável de Conferir documentos'), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }));

  await waitFor(() => expect(axiosInstance.patch).toHaveBeenCalledWith(
    '/api/atividades/20/', { responsavelId: 2 },
  ));
});
