import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import {
    CheckCircleIcon,
    XCircleIcon,
    PlusIcon,
    BuildingOffice2Icon,
    MagnifyingGlassIcon,
    ExclamationCircleIcon,
    CogIcon,
    DocumentArrowDownIcon,
    FunnelIcon,
    ChartBarIcon,
    BanknotesIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

const GerenciamentoIntegrado = () => {
    // --- State ---
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [filterStatus, setFilterStatus] = useState('all'); // all, active, inactive

    // --- Modal Config State ---
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

    // --- Fetch Data ---
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

    // --- Handlers ---
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
            const response = await axiosInstance.post('/api/gerar-boleto/', { empresa_id: id }, {
                responseType: 'blob',
                headers: { 'Accept': 'application/pdf, application/json' }
            });
            const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `boleto_empresa_${id}.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            setSuccess('Boleto gerado com sucesso!');
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Erro ao gerar boleto:', err);
            setError('Falha ao gerar o boleto.');
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

            // Sanitização
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

    // --- Filtering ---
    const filteredEmpresas = useMemo(() => {
        return empresas.filter(empresa => {
            // Status Filter
            if (filterStatus === 'active' && !empresa.ativo) return false;
            if (filterStatus === 'inactive' && empresa.ativo) return false;

            // Search Filter
            const lowercasedSearch = search.toLowerCase().trim();
            if (!lowercasedSearch) return true;

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
    }, [empresas, search, filterStatus]);

    // --- Stats ---
    const stats = useMemo(() => {
        const total = empresas.length;
        const active = empresas.filter(e => e.ativo).length;
        return { total, active, inactive: total - active };
    }, [empresas]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-12 w-12 bg-gray-200 dark:bg-gray-700 rounded-full mb-4"></div>
                    <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
                <ExclamationCircleIcon className="h-16 w-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Acesso Negado</h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400 text-center max-w-md">
                    Você não possui permissões de administrador.
                </p>
                <Link to="/" className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                    Voltar ao Início
                </Link>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header & Stats */}
                <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            Gerenciamento Integrado
                        </h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">
                            Gestão de empresas, boletos e permissões.
                        </p>
                    </div>
                    <Link
                        to="/empresas/cadastrar"
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg hover:shadow-indigo-500/30 transition-all transform hover:-translate-y-0.5"
                    >
                        <PlusIcon className="h-5 w-5" />
                        <span className="font-semibold">Nova Empresa</span>
                    </Link>
                </header>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total de Empresas</p>
                            <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{stats.total}</p>
                        </div>
                        <div className="h-12 w-12 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            <BuildingOffice2Icon className="h-6 w-6" />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Ativas</p>
                            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.active}</p>
                        </div>
                        <div className="h-12 w-12 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                            <CheckCircleIcon className="h-6 w-6" />
                        </div>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Inativas</p>
                            <p className="text-3xl font-bold text-red-500 dark:text-red-400 mt-1">{stats.inactive}</p>
                        </div>
                        <div className="h-12 w-12 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center text-red-500 dark:text-red-400">
                            <XCircleIcon className="h-6 w-6" />
                        </div>
                    </div>
                </div>

                {/* Controls Area (Search & Filter) */}
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="relative flex-grow">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-3 transform -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, CNPJ ou e-mail..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white transition-shadow shadow-sm"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 dark:text-white shadow-sm cursor-pointer"
                        >
                            <option value="all">Todos os Status</option>
                            <option value="active">Apenas Ativas</option>
                            <option value="inactive">Apenas Inativas</option>
                        </select>
                    </div>
                </div>

                {/* Messages */}
                <AnimatePresence>
                    {success && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 p-4 rounded-xl flex items-center gap-2">
                            <CheckCircleIcon className="h-5 w-5" />
                            {success}
                        </motion.div>
                    )}
                    {error && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 p-4 rounded-xl flex items-center gap-2">
                            <ExclamationCircleIcon className="h-5 w-5" />
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Table View */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                    {filteredEmpresas.length === 0 ? (
                        <div className="text-center py-16 px-4">
                            <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Nenhum resultado encontrado</h3>
                            <p className="text-gray-500 dark:text-gray-400">Tente ajustar seus filtros de busca.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 dark:bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Empresa</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contato</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredEmpresas.map((empresa) => (
                                        <tr key={empresa.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 flex-shrink-0 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                                                        {empresa.nome.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{empresa.nome}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{empresa.cnpj}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{empresa.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${empresa.ativo
                                                        ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                                                        : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                                    }`}>
                                                    {empresa.ativo ? 'Ativa' : 'Inativa'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleGerarBoleto(empresa.id)}
                                                        className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors"
                                                        title="Gerar Boleto"
                                                    >
                                                        <DocumentArrowDownIcon className="h-5 w-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleConfiguracoes(empresa.id)}
                                                        className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                                                        title="Configurações"
                                                    >
                                                        <CogIcon className="h-5 w-5" />
                                                    </button>
                                                    <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                                    <button
                                                        onClick={() => handleToggleAtivo(empresa.id, empresa.ativo)}
                                                        className={`p-2 rounded-lg transition-colors ${empresa.ativo
                                                                ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                                                                : 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30'
                                                            }`}
                                                        title={empresa.ativo ? 'Desativar Empresa' : 'Ativar Empresa'}
                                                    >
                                                        {empresa.ativo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Modal Configurações */}
                <AnimatePresence>
                    {configModalOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                                onClick={() => setConfigModalOpen(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg p-6 md:p-8"
                            >
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <CogIcon className="h-6 w-6 text-indigo-500" />
                                        Configurações de Boleto
                                    </h2>
                                    <button onClick={() => setConfigModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                        <XCircleIcon className="h-6 w-6" />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                    {[
                                        { label: 'Valor Honorário (R$)', key: 'valor_honorario', type: 'number', step: '0.01' },
                                        { label: 'Dia Vencimento', key: 'dia_vencimento_honorario', type: 'number', min: '1', max: '31' },
                                        { label: 'Juros Mensal (%)', key: 'juros_mora_taxa', type: 'number', step: '0.01' },
                                        { label: 'Multa (%)', key: 'multa_taxa', type: 'number', step: '0.01' },
                                        { label: 'Desconto (%)', key: 'desconto_taxa', type: 'number', step: '0.01' },
                                        { label: 'Dias para Desconto', key: 'dias_para_desconto', type: 'number', title: 'Dias antes do vencimento' },
                                    ].map((field) => (
                                        <div key={field.key}>
                                            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">{field.label}</label>
                                            <input
                                                type={field.type}
                                                step={field.step}
                                                min={field.min}
                                                max={field.max}
                                                title={field.title}
                                                value={currentConfig[field.key]}
                                                onChange={(e) => setCurrentConfig({ ...currentConfig, [field.key]: e.target.value })}
                                                className="w-full p-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                                            />
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-8 flex justify-end gap-3">
                                    <button
                                        onClick={() => setConfigModalOpen(false)}
                                        className="px-5 py-2.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-xl font-medium transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveConfig}
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/30 transition-all"
                                    >
                                        Salvar Alterações
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default GerenciamentoIntegrado;
