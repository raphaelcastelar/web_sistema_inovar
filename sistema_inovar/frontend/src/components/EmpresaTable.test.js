import { fireEvent, render, screen } from '@testing-library/react';
import EmpresaTable from './EmpresaTable';

jest.mock('react-router-dom', () => ({
    Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

const company = {
    id: 10,
    nome: 'Empresa Exemplo Ltda',
    cnpj: '12345678000190',
    email: 'contato@exemplo.com',
    telefone: '(27) 99999-0000',
    regime_tributario: 'SIMPLES NACIONAL',
    porte_empresa: 'EPP',
    carteira_clientes: 'INOVAR ES',
    ativo: true,
    tags: [{ id: 3, nome: 'Fiscal', cor: '#c49a61' }],
};

const renderTable = (overrides = {}) => {
    const props = {
        empresas: [company],
        isAdmin: true,
        selectedTagIds: [],
        onTag: jest.fn(),
        onReactivate: jest.fn(),
        onDelete: jest.fn(),
        onNavigate: jest.fn(),
        ...overrides,
    };
    render(<EmpresaTable {...props} />);
    return props;
};

test('exibe as colunas operacionais e os atalhos da empresa', () => {
    renderTable();

    expect(screen.getByText('Empresa Exemplo Ltda')).toBeInTheDocument();
    expect(screen.getByText('12.345.678/0001-90')).toBeInTheDocument();
    expect(screen.getByText('Simples Nacional')).toBeInTheDocument();
    expect(screen.getByText('EPP')).toBeInTheDocument();
    expect(screen.getByText('INOVAR ES')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Acessar pastas/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Editar/ })).toBeInTheDocument();
});

test('mantém filtros por tag e ações administrativas na linha', () => {
    const props = renderTable({ empresas: [{ ...company, ativo: false }] });

    fireEvent.click(screen.getByRole('button', { name: 'Fiscal' }));
    fireEvent.click(screen.getByRole('button', { name: /Reativar/ }));
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));

    expect(props.onTag).toHaveBeenCalledWith('3');
    expect(props.onReactivate).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
    expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 10 }));
});
