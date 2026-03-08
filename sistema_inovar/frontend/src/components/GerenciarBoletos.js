import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { CheckCircleIcon, XCircleIcon, PlusIcon, BuildingOffice2Icon, MagnifyingGlassIcon, ExclamationCircleIcon, CogIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline';

const GerenciarBoletos = () => {
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [currentConfig, setCurrentConfig] = useState({
        id: null,
        valor_honorario: '',
        dia_vencimento_honorario: '',
        juros_mora_taxa: '',
        multa_taxa: '',
        desconto_taxa: '',
        dias_para_desconto: ''
    });

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
            setSuccess(response?.data?.message || 'Boleto gerado com sucesso!');
        } catch (err) {
            console.error('Erro ao gerar boleto:', err);
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Falha ao gerar o boleto.');
        }
    };

    const handleConfiguracoes = (id) => {
        const empresa = empresas.find(e => e.id === id);
        if (empresa) {
            setCurrentConfig({
                id: empresa.id,
                valor_honorario: empresa.valor_honorario || '',
                dia_vencimento_honorario: empresa.dia_vencimento_honorario || '',
                juros_mora_taxa: empresa.juros_mora_taxa || '',
                multa_taxa: empresa.multa_taxa || '',
                desconto_taxa: empresa.desconto_taxa || '',
                dias_para_desconto: empresa.dias_para_desconto || ''
            });
            setConfigModalOpen(true);
        }
    };

    const handleSaveConfig = async () => {
        try {
            const { id, ...data } = currentConfig;

            // Sanitização: Converte strings vazias para 0 ou '0.00'
            const sanitizedData = {
                ...data,
                valor_honorario: data.valor_honorario === '' ? '0.00' : data.valor_honorario,
                dia_vencimento_honorario: data.dia_vencimento_honorario === '' ? 15 : data.dia_vencimento_honorario,
                juros_mora_taxa: data.juros_mora_taxa === '' ? '0.00' : data.juros_mora_taxa,
                multa_taxa: data.multa_taxa === '' ? '0.00' : data.multa_taxa,
                desconto_taxa: data.desconto_taxa === '' ? '0.00' : data.desconto_taxa,
                dias_para_desconto: data.dias_para_desconto === '' ? 0 : data.dias_para_desconto
            };

            await axiosInstance.patch(`/api/empresas/${id}/`, sanitizedData);

            setEmpresas(empresas.map(empresa =>
                empresa.id === id ? { ...empresa, ...sanitizedData } : empresa
            ));

            setSuccess('Configurações atualizadas com sucesso!');
            setConfigModalOpen(false);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Erro ao salvar configurações:', err.response?.data || err.message);
            setError('Falha ao salvar as configurações.');
        }
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
            {configModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-gray-100">Configurações de Boleto</h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valor Honorário (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={currentConfig.valor_honorario}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, valor_honorario: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dia Vencimento</label>
                                <input
                                    type="number"
                                    min="1" max="31"
                                    value={currentConfig.dia_vencimento_honorario}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, dia_vencimento_honorario: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Juros Mensal (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={currentConfig.juros_mora_taxa}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, juros_mora_taxa: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Multa (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={currentConfig.multa_taxa}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, multa_taxa: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desconto (%)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={currentConfig.desconto_taxa}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, desconto_taxa: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dias para Desconto</label>
                                <input
                                    type="number"
                                    value={currentConfig.dias_para_desconto}
                                    onChange={(e) => setCurrentConfig({ ...currentConfig, dias_para_desconto: e.target.value })}
                                    className="w-full p-2 border rounded text-gray-900 bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    title="Quantos dias ANTES do vencimento o desconto é válido (0 = até o vencimento)"
                                />
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end space-x-3">
                            <button
                                onClick={() => setConfigModalOpen(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveConfig}
                                className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                            >
                                Salvar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GerenciarBoletos;