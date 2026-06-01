import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { CheckIcon, UserCircleIcon } from '@heroicons/react/24/solid';
import { InformationCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const GerenciarAtribuicoesPage = () => {
    const [funcionarios, setFuncionarios] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [selectedFuncionario, setSelectedFuncionario] = useState(null);
    const [assignedCompanyIds, setAssignedCompanyIds] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);

    const fetchData = useCallback(() => {
        setLoading(true);
        axiosInstance.get('/api/gerenciamento-atribuicao-data/')
            .then(response => {
                setFuncionarios(response.data.funcionarios);
                setEmpresas(response.data.empresas);
                setSelectedFuncionario(null);
                setAssignedCompanyIds(new Set());
                console.log('Resposta /api/gerenciamento-atribuicao-data/:', response.data);
            })
            .catch(err => {
                console.error("Erro ao carregar dados:", err.response?.data || err.message);
                setError(err.response?.status === 403 
                    ? "Você não tem permissão para acessar esta página." 
                    : `Não foi possível carregar os dados: ${err.response?.data?.detail || err.message}`);
            })
            .finally(() => setLoading(false));
    }, []);

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
        fetchUser();
        fetchData();
    }, [fetchData]);

    const handleFuncionarioSelect = (funcionario) => {
        if (!isAdmin) {
            setError('Você não tem permissão para gerenciar atribuições.');
            return;
        }
        setSelectedFuncionario(funcionario);
        setAssignedCompanyIds(new Set(funcionario.empresas_gerenciadas));
        console.log('Funcionário selecionado:', funcionario);
    };

    const handleCompanyToggle = (companyId) => {
        if (!isAdmin) {
            setError('Você não tem permissão para gerenciar atribuições.');
            return;
        }
        const newAssignedIds = new Set(assignedCompanyIds);
        if (newAssignedIds.has(companyId)) {
            newAssignedIds.delete(companyId);
        } else {
            newAssignedIds.add(companyId);
        }
        setAssignedCompanyIds(newAssignedIds);
        console.log('Toggling empresa ID:', companyId);
    };

    const handleSaveChanges = () => {
        if (!isAdmin) {
            setError('Você não tem permissão para gerenciar atribuições.');
            return;
        }
        if (!selectedFuncionario) {
            alert('Selecione um funcionário antes de salvar.');
            return;
        }
        setSaving(true);
        const payload = {
            funcionario_id: selectedFuncionario.id,
            ids_empresas: Array.from(assignedCompanyIds)
        };
        console.log('Enviando payload para /api/salvar-atribuicoes/:', payload);
        axiosInstance.post('/api/salvar-atribuicoes/', payload)
            .then(response => {
                console.log('Resposta /api/salvar-atribuicoes/:', response.data);
                alert('Atribuições salvas com sucesso!');
                fetchData();
                // Dispara evento para notificar outras páginas
                window.dispatchEvent(new CustomEvent('atribuicoesUpdated', {
                    detail: { funcionario_id: selectedFuncionario.id, ids_empresas: Array.from(assignedCompanyIds) }
                }));
            })
            .catch(err => {
                console.error("Erro ao salvar atribuições:", err.response?.data || err.message);
                alert(`Falha ao salvar as atribuições: ${err.response?.data?.error || err.message}`);
            })
            .finally(() => setSaving(false));
    };

    const handleSelectAll = () => {
        if (!isAdmin) {
            setError('Você não tem permissão para gerenciar atribuições.');
            return;
        }
        const allCompanyIds = empresas.map(e => e.id);
        setAssignedCompanyIds(new Set(allCompanyIds));
        console.log('Selecionando todas as empresas');
    };

    const handleClearAll = () => {
        if (!isAdmin) {
            setError('Você não tem permissão para gerenciar atribuições.');
            return;
        }
        setAssignedCompanyIds(new Set());
        console.log('Limpando seleção de empresas');
    };

    if (loading) return <p className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando...</p>;

    if (!isAdmin) {
        return (
            <div className="w-full max-w-none px-0 py-10 text-center text-gray-900 dark:text-gray-100">
                <ExclamationCircleIcon className="mx-auto h-16 w-16 text-rose-500 dark:text-rose-400" />
                <h2 className="mt-4 text-xl font-bold text-gray-950 dark:text-white">Acesso Negado</h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Você não possui permissões de administrador para acessar esta página. Somente administradores podem gerenciar as atribuições de empresas.
                </p>
                <Link
                    to="/"
                    className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                    Voltar ao Início
                </Link>
            </div>
        );
    }

    if (error) return <p className="p-8 text-center text-rose-500 dark:text-rose-400">{error}</p>;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Administração</p>
                <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Atribuição de Empresas</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    Selecione um funcionário para definir quais empresas ele pode gerenciar.
                </p>
            </div>
            
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-1">
                    <div className="flex items-center justify-between px-2">
                        <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Funcionários</h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {funcionarios.length}
                        </span>
                    </div>
                    <ul className="space-y-1 mt-4 max-h-[70vh] overflow-y-auto">
                        {funcionarios.map(func => (
                            <li key={func.id}>
                                <button
                                    onClick={() => handleFuncionarioSelect(func)}
                                    className={`w-full text-left p-3 rounded-lg flex items-center space-x-3 transition-colors ${
                                        selectedFuncionario?.id === func.id 
                                            ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                                            : 'text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    <UserCircleIcon className={`h-8 w-8 flex-shrink-0 ${
                                        selectedFuncionario?.id === func.id ? 'text-slate-200 dark:text-slate-600' : 'text-gray-400 dark:text-gray-300'
                                    }`} />
                                    <div>
                                        <p className={`font-semibold ${
                                            selectedFuncionario?.id === func.id ? 'text-white dark:text-slate-950' : 'text-gray-900 dark:text-gray-100'
                                        }`}>{func.first_name} {func.last_name}</p>
                                        <p className={`text-xs ${
                                            selectedFuncionario?.id === func.id ? 'text-slate-300 dark:text-slate-600' : 'text-gray-500 dark:text-gray-400'
                                        }`}>@{func.username}</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:col-span-2">
                    {!selectedFuncionario ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 p-10">
                            <InformationCircleIcon className="h-16 w-16 mb-4 text-gray-300 dark:text-gray-600"/>
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Nenhum Funcionário Selecionado</h3>
                            <p className="text-gray-500 dark:text-gray-400">Selecione um funcionário à esquerda para ver e editar as empresas que ele gerencia.</p>
                        </div>
                    ) : (
                        <div>
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                                <h2 className="text-xl font-semibold text-gray-950 dark:text-white">
                                    Empresas para <span className="text-slate-700 dark:text-slate-300">{selectedFuncionario.first_name}</span>
                                </h2>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleSelectAll} 
                                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                    >
                                        Selecionar Todas
                                    </button>
                                    <button 
                                        onClick={handleClearAll} 
                                        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                                    >
                                        Limpar Seleção
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2 border-t border-b border-gray-200 dark:border-gray-800 py-4">
                                {empresas.map(empresa => (
                                    <label 
                                        key={empresa.id} 
                                        className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-slate-50 p-3 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:bg-slate-950 dark:hover:bg-gray-800"
                                    >
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-gray-100">{empresa.nome}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{empresa.cnpj}</p>
                                        </div>
                                        <div className={`w-6 h-6 flex items-center justify-center rounded-md border-2 transition-all ${
                                            assignedCompanyIds.has(empresa.id) 
                                                ? 'bg-slate-900 border-slate-900 dark:bg-slate-100 dark:border-slate-100'
                                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                                        }`}>
                                            {assignedCompanyIds.has(empresa.id) && <CheckIcon className="h-4 w-4 text-white dark:text-slate-950"/>}
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={assignedCompanyIds.has(empresa.id)}
                                            onChange={() => handleCompanyToggle(empresa.id)}
                                            className="hidden"
                                        />
                                    </label>
                                ))}
                            </div>
                            <div className="mt-6 flex justify-end">
                                <button 
                                    onClick={handleSaveChanges} 
                                    disabled={saving} 
                                    className="rounded-md bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                                >
                                    {saving ? 'Salvando...' : 'Salvar Alterações'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default GerenciarAtribuicoesPage;
