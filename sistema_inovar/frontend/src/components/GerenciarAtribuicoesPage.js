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
            <div className="p-6 md:p-8 text-center">
                <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500 dark:text-red-400 mt-10" />
                <h2 className="mt-4 text-xl font-bold text-gray-800 dark:text-indigo-300">Acesso Negado</h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Você não possui permissões de administrador para acessar esta página. Somente administradores podem gerenciar as atribuições de empresas.
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

    if (error) return <p className="p-8 text-center text-red-500 dark:text-red-400">{error}</p>;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-2">Atribuição de Empresas</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-8">Selecione um funcionário para definir quais empresas ele pode gerenciar.</p>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-4">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white p-2">Funcionários</h2>
                    <ul className="space-y-1 mt-4 max-h-[70vh] overflow-y-auto">
                        {funcionarios.map(func => (
                            <li key={func.id}>
                                <button
                                    onClick={() => handleFuncionarioSelect(func)}
                                    className={`w-full text-left p-3 rounded-lg flex items-center space-x-3 transition-colors ${
                                        selectedFuncionario?.id === func.id 
                                            ? 'bg-indigo-600 text-white shadow-md' 
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                                    }`}
                                >
                                    <UserCircleIcon className={`h-8 w-8 flex-shrink-0 ${
                                        selectedFuncionario?.id === func.id ? 'text-indigo-200' : 'text-gray-400 dark:text-gray-300'
                                    }`} />
                                    <div>
                                        <p className={`font-semibold ${
                                            selectedFuncionario?.id === func.id ? 'text-white' : 'text-gray-900 dark:text-gray-100'
                                        }`}>{func.first_name} {func.last_name}</p>
                                        <p className={`text-xs ${
                                            selectedFuncionario?.id === func.id ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'
                                        }`}>@{func.username}</p>
                                    </div>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6">
                    {!selectedFuncionario ? (
                        <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 p-10">
                            <InformationCircleIcon className="h-16 w-16 mb-4 text-gray-300 dark:text-gray-600"/>
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Nenhum Funcionário Selecionado</h3>
                            <p className="text-gray-500 dark:text-gray-400">Selecione um funcionário à esquerda para ver e editar as empresas que ele gerencia.</p>
                        </div>
                    ) : (
                        <div>
                            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-4">
                                <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
                                    Empresas para <span className="text-indigo-600 dark:text-indigo-400">{selectedFuncionario.first_name}</span>
                                </h2>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={handleSelectAll} 
                                        className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                                    >
                                        Selecionar Todas
                                    </button>
                                    <button 
                                        onClick={handleClearAll} 
                                        className="px-4 py-2 text-sm font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                                    >
                                        Limpar Seleção
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2 border-t border-b border-gray-200 dark:border-gray-700 py-4">
                                {empresas.map(empresa => (
                                    <label 
                                        key={empresa.id} 
                                        className={`p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-between cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors`}
                                    >
                                        <div>
                                            <p className="font-medium text-gray-900 dark:text-gray-100">{empresa.nome}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{empresa.cnpj}</p>
                                        </div>
                                        <div className={`w-6 h-6 flex items-center justify-center rounded-md border-2 transition-all ${
                                            assignedCompanyIds.has(empresa.id) 
                                                ? 'bg-indigo-600 border-indigo-600' 
                                                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                                        }`}>
                                            {assignedCompanyIds.has(empresa.id) && <CheckIcon className="h-4 w-4 text-white"/>}
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
                                    className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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