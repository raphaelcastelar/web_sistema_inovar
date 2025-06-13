import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/solid';

// O componente de Toggle Switch
const ToggleSwitch = ({ enabled, onChange }) => (
    <button
        type="button"
        className={`${enabled ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-600'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800`}
        onClick={onChange}
    >
        <span className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}/>
    </button>
);

// O componente principal da página
const GerenciamentoSimplesPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchData = useCallback(() => {
        setLoading(true);
        axiosInstance.get('/api/gerenciamento-simples/')
            .then(response => {
                setEmpresas(response.data);
            })
            .catch(err => setError('Falha ao carregar dados de gerenciamento.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleToggle = (empresaId) => {
        const originalEmpresas = [...empresas];
        // Otimistamente atualiza a UI
        setEmpresas(prev => prev.map(e => e.id === empresaId ? { ...e, monitorar_simples: !e.monitorar_simples } : e));

        axiosInstance.post(`/api/empresas/${empresaId}/toggle-monitoramento-simples/`)
            .catch(() => {
                setError('Falha ao atualizar o status. Revertendo.');
                setEmpresas(originalEmpresas); // Reverte em caso de erro
            });
    };

    const StatusBadge = ({ status }) => {
        if (status === 'enviado') {
            return <div className="inline-flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-800/50 px-2 py-1 text-xs font-semibold text-green-800 dark:text-green-300"><CheckCircleIcon className="h-4 w-4"/>Enviado</div>;
        }
        if (status === 'nao_aplicavel') {
            return <div className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-600 px-2 py-1 text-xs font-semibold text-gray-700 dark:text-gray-300"><XCircleIcon className="h-4 w-4"/>N/A</div>;
        }
        return <div className="inline-flex items-center gap-1 rounded-full bg-yellow-100 dark:bg-yellow-800/50 px-2 py-1 text-xs font-semibold text-yellow-800 dark:text-yellow-300"><ClockIcon className="h-4 w-4"/>Pendente</div>;
    };

    if (loading) return <p className="p-8 text-center">Carregando...</p>;
    if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300">Gerenciamento do Simples Nacional</h1>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">Ative ou desative o monitoramento e envio automático do DAS para cada empresa.</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Empresa</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">CNPJ</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status (Mês Atual)</th>
                            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Monitorar?</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {empresas.map((empresa) => (
                            <tr key={empresa.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{empresa.nome}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{empresa.cnpj}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    <StatusBadge status={empresa.status_simples_mes_atual} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                    <ToggleSwitch enabled={empresa.monitorar_simples} onChange={() => handleToggle(empresa.id)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
};

export default GerenciamentoSimplesPage;