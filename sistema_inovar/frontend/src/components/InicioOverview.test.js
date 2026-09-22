import { render, screen } from '@testing-library/react';
import axiosInstance from '../api/axiosInstance';
import InicioOverview from './InicioOverview';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn(),
}));

afterEach(() => jest.clearAllMocks());

test('mantém a estrutura da página inicial visível enquanto os dados carregam', () => {
  axiosInstance.get.mockImplementation(() => new Promise(() => {}));

  render(<InicioOverview />);

  expect(screen.getByRole('heading', { name: 'Organize o seu dia' })).toBeInTheDocument();
  expect(screen.getByText('Tarefas do dia')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Minhas tarefas do dia/ })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /Atividades do dia/ })).toBeInTheDocument();
  expect(screen.queryByText(/Organizando suas atividades/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /Nova atividade/ })[0]).toBeDisabled();
});
