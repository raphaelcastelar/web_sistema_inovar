import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import { CheckCircleIcon, XCircleIcon, PlusIcon, BuildingOffice2Icon, MagnifyingGlassIcon, ExclamationCircleIcon, CogIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

const GerenciarBoletos = () => {
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axiosInstance.get('/api/current-user/');
                setIsAdmin(response.data.is_staff || response.data.is_superuser);
            } catch (err) {
                console.error('Erro ao verificar permissões:', err.response?.data || err.message);
                setIsAdmin(false);
            }
        };

        const fetchEmpresas = async () => {
            try {
                const response = await axiosInstance.get('/api/empresas/?all=true');
                setEmpresas(response.data);
            } catch (err) {
                console.error('Erro ao carregar empresas:', err.response?.data || err.message);
                setError('Erro ao carregar empresas para gerenciamento.');
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
        fetchEmpresas();
    }, []);

    const handleToggleAtivo = async (id, ativo) => {
        if (!isAdmin) {
            setError('Você não tem permissão para alterar o status das empresas.');
            return;
        }
        try {
            await axiosInstance.patch(`/api/empresas/${id}/`, { ativo: !ativo });
            setEmpresas(empresas.map(empresa =>
                empresa.id === id ? { ...empresa, ativo: !ativo } : empresa
            ));
            setSuccess(`Status da empresa atualizado com sucesso!`);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Erro ao atualizar status:', err.response?.data || err.message);
            setError('Falha ao atualizar o status da empresa.');
        }
    };

    const handleGerarBoleto = async (id) => {
        try {
            const response = await axiosInstance.post('/api/gerar-boleto/', { empresa_id: id });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `boleto_empresa_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setSuccess('Boleto gerado com sucesso!');
        } catch (err) {
            console.error('Erro ao gerar boleto:', err);
            setError('Falha ao gerar o boleto.');
        }
    };

    const handleConfiguracoes = (id) => {
        // Redireciona para uma página de configurações específicas da empresa
        // Você pode criar uma rota como /configuracoes-boleto/{id}
        console.log(`Abrir configurações para empresa ID: ${id}`);
        // Exemplo: useNavigate para '/configuracoes-boleto/' + id
    };

    const filteredEmpresas = empresas.filter(empresa => {
        const lowercasedSearch = search.toLowerCase().trim();
        const searchDigits = search.replace(/\D/g, '');
        const matchNome = empresa.nome?.toLowerCase().includes(lowercasedSearch);
        const matchEmail = empresa.email?.toLowerCase().includes(lowercasedSearch);
        let matchCnpj = false;
        if (searchDigits.length > 0) {
            const cleanedEmpresaCnpj = empresa.cnpj?.replace(/\D/g, '');
            matchCnpj = cleanedEmpresaCnpj?.includes(searchDigits);
        }
        return matchNome || matchEmail || matchCnpj;
    });

    if (loading) {
        return <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Carregando...</p>;
    }

    if (!isAdmin) {
        return (
            <div className="p-6 md:p-8 text-center">
                <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500 dark:text-red-400 mt-10" />
                <h2 className="mt-4 text-xl font-bold text-gray-800 dark:text-indigo-300">Acesso Negado</h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Você não possui permissões de administrador para acessar esta página. Somente administradores podem gerenciar boletos.
                </p>
                <Link
                    to="/"
                    className="mt-6 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                    Voltar ao Início
                </Link>
            </div>
        );
    }

    return (
        <div className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-2xl font-bold text-gray-800 dark:text-indigo-300">Gerenciar Boletos</h1>
                <Link
                    to="/empresas/cadastrar"
                    className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                >
                    <PlusIcon className="h-5 w-5" />
                    <span className="hidden sm:inline">Nova Empresa</span>
                </Link>
            </div>
            <div className="mb-4">
                <div className="relative w-full max-w-md">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-3 transform -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, CNPJ ou e-mail..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full p-2 pl-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                </div>
            </div>
            {empresas.length === 0 ? (
                <div className="text-center py-10 px-4 bg-white dark:bg-gray-800 rounded-md shadow">
                    <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Nenhuma empresa cadastrada</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <Link to="/empresas/cadastrar" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">Cadastre a primeira empresa</Link>
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-md shadow overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                            <tr>
                                <th className="p-3 text-sm font-semibold">Nome</th>
                                <th className="p-3 text-sm font-semibold">CNPJ</th>
                                <th className="p-3 text-sm font-semibold">E-mail</th>
                                <th className="p-3 text-sm font-semibold">Status</th>
                                <th className="p-3 text-sm font-semibold">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEmpresas.map(empresa => (
                                <tr key={empresa.id} className="border-t border-gray-200 dark:border-gray-700">
                                    <td className="p-3 text-sm text-gray-900 dark:text-gray-100 break-words">{empresa.nome}</td>
                                    <td className="p-3 text-sm text-gray-500 dark:text-gray-400">{empresa.cnpj}</td>
                                    <td className="p-3 text-sm text-gray-500 dark:text-gray-400 break-all">{empresa.email}</td>
                                    <td className="p-3 text-sm">
                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${empresa.ativo ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}`}>
                                            {empresa.ativo ? 'Ativada' : 'Desativada'}
                                        </span>
                                    </td>
                                    <td className="p-3 flex space-x-2">
                                        <button
                                            onClick={() => handleToggleAtivo(empresa.id, empresa.ativo)}
                                            className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                            title={empresa.ativo ? 'Desativar' : 'Ativar'}
                                        >
                                            {empresa.ativo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                                        </button>
                                        <button
                                            onClick={() => handleGerarBoleto(empresa.id)}
                                            className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                            title="Gerar Boleto"
                                        >
                                            <DocumentArrowDownIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => handleConfiguracoes(empresa.id)}
                                            className="p-1 text-gray-600 dark:text-gray-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                                            title="Configurações do Boleto"
                                        >
                                            <CogIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {success && <p className="mt-4 text-center text-green-600 dark:text-green-400">{success}</p>}
            {error && <p className="mt-4 text-center text-red-600 dark:text-red-400">{error}</p>}
        </div>
    );
};

export default GerenciarBoletos;