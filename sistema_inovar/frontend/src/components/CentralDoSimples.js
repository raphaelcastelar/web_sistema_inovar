import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
    UsersIcon,
    CalendarDaysIcon,
    MagnifyingGlassIcon,
    DocumentArrowDownIcon,
    InformationCircleIcon,
    CheckCircleIcon,
    DocumentChartBarIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

// --- Sub-components for identifying Extrato Data ---
const findDasDetails = (data) => {
    if (!data) return null;
    if (data.declaracoes?.[0]?.das?.[0]?.detalhamentoDas) {
        return data.declaracoes[0].das[0].detalhamentoDas;
    }
    if (data.detalhamentoDas) {
        return data.detalhamentoDas;
    }
    if (Array.isArray(data.das) && data.das[0]?.detalhamentoDas) {
        return data.das[0].detalhamentoDas;
    }
    return null;
};

const ExtratoResult = ({ data, onDownloadPdf, isDownloadingPdf }) => {
    if (!data) return null;

    const dasDetails = findDasDetails(data);

    if (!dasDetails) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="mt-6 bg-yellow-50 dark:bg-yellow-900/20 p-6 rounded-xl border border-yellow-200 dark:border-yellow-700/50"
            >
                <p className="text-center text-yellow-700 dark:text-yellow-400 font-medium">
                    Nenhuma declaração encontrada para este período.
                </p>
            </motion.div>
        );
    }

    const composicao = dasDetails.composicao || [];
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700"
        >
            {/* Header do Extrato */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-800 p-6 border-b border-gray-200 dark:border-gray-600 flex flex-col md:flex-row justify-between items-center gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Resumo do Extrato</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {dasDetails.periodoApuracao ? `${dasDetails.periodoApuracao.substring(4, 6)}/${dasDetails.periodoApuracao.substring(0, 4)}` : 'Período Indefinido'}
                    </p>
                </div>
                <button
                    onClick={onDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                    {isDownloadingPdf ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                        <DocumentArrowDownIcon className="h-4 w-4" />
                    )}
                    {isDownloadingPdf ? 'Baixando...' : 'Baixar PDF'}
                </button>
            </div>

            {/* Cards de KPIs */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Documento</span>
                    <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white truncate" title={dasDetails.numeroDocumento}>
                        {dasDetails.numeroDocumento || 'N/A'}
                    </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Vencimento</span>
                    <p className="mt-1 text-lg font-bold text-indigo-600 dark:text-indigo-400">
                        {dasDetails.dataVencimento ? new Date(dasDetails.dataVencimento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}
                    </p>
                </div>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800/30">
                    <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Valor Total</span>
                    <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(dasDetails.valores?.total || 0)}
                    </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-100 dark:border-gray-600">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Situação</span>
                    <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white">
                        {dasDetails.situacao || 'N/A'}
                    </p>
                </div>
            </div>

            {/* Tabela de Composição */}
            <div className="px-6 pb-6">
                <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">Detalhamento dos Tributos</h4>
                <div className="overflow-hidden bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-100 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tributo</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor Principal</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {composicao.map((comp, index) => (
                                <tr key={index} className="hover:bg-gray-100/50 dark:hover:bg-gray-700/50 transition-colors">
                                    <td className="px-6 py-3 text-sm text-gray-700 dark:text-gray-300 font-medium">
                                        {comp.denominacao} <span className="text-gray-400 font-normal">({comp.codigo})</span>
                                    </td>
                                    <td className="px-6 py-3 text-sm text-gray-900 dark:text-gray-100 text-right font-mono">
                                        {formatCurrency(comp.valores?.principal || 0)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </motion.div>
    );
};

const CentralDoSimples = () => {
    // --- State ---
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));

    const [loadingExtrato, setLoadingExtrato] = useState(false);
    const [loadingDas, setLoadingDas] = useState(false);

    // Flow State
    const [step, setStep] = useState(0); // 0: Select Service, 1: Select Data & Execute
    const [selectedAction, setSelectedAction] = useState(null); // 'extrato' | 'das'

    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [extratoData, setExtratoData] = useState(null);

    // --- Options ---
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = -4; i <= 2; i++) {
            years.push(currentYear - i);
        }
        return years.sort((a, b) => b - a);
    }, []);

    const monthOptions = [
        { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
        { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
        { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
        { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
        { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
        { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
    ];

    // --- Fetch Empresas ---
    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then(res => setEmpresas(res.data))
            .catch(err => console.error("Erro busca empresas:", err));
    }, []);

    // --- Actions ---
    const resetMessages = () => {
        setError('');
        setSuccessMessage('');
        setExtratoData(null);
    };

    const validateSelection = () => {
        if (!selectedEmpresaId || !selectedYear || !selectedMonth) {
            setError("Por favor, selecione uma empresa e o período.");
            return false;
        }
        return true;
    };

    const getEmpresaData = () => {
        const emp = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        if (!emp) return null;
        return {
            ...emp,
            cnpjLimpo: emp.cnpj.replace(/\D/g, '')
        };
    };

    const handleSelectAction = (action) => {
        setSelectedAction(action);
        setStep(1);
        resetMessages();
    };

    const handleBack = () => {
        setStep(0);
        setSelectedAction(null);
        resetMessages();
    };

    const handleExecute = async () => {
        if (selectedAction === 'extrato') {
            await handleConsultarExtrato();
        } else if (selectedAction === 'das') {
            await handleGerarDas();
        }
    };

    const handleConsultarExtrato = async () => {
        if (!validateSelection()) return;
        resetMessages();
        setLoadingExtrato(true);

        const empresa = getEmpresaData();
        const periodo = `${selectedYear}${selectedMonth}`;

        try {
            /* Lógica Antiga Mantida para compatibilidade máxima */
            const response = await axiosInstance.post('/api/serpro/consultar-extrato/', {
                cnpj: empresa.cnpjLimpo,
                periodo: periodo,
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            let filename = `Extrato_Simples_${empresa.cnpjLimpo}_${periodo}.pdf`;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match && match[1]) filename = match[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setSuccessMessage("Extrato baixado com sucesso!");

        } catch (err) {
            console.error("Erro extrato:", err);
            try {
                if (err.response?.data instanceof Blob) {
                    const txt = await err.response.data.text();
                    const json = JSON.parse(txt);
                    setError(json.error || "Erro ao baixar extrato.");
                } else {
                    setError("Erro de comunicação.");
                }
            } catch (e) {
                setError("Ocorreu um erro ao tentar baixar o extrato.");
            }
        } finally {
            setLoadingExtrato(false);
        }
    };

    const handleGerarDas = async () => {
        if (!validateSelection()) return;
        resetMessages();
        setLoadingDas(true);

        const empresa = getEmpresaData();
        const periodo = `${selectedYear}${selectedMonth}`;

        try {
            const response = await axiosInstance.post('/api/serpro/gerar-das/', {
                cnpj: empresa.cnpjLimpo,
                periodo: periodo,
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            let filename = `DAS_${empresa.cnpjLimpo}_${periodo}.pdf`;
            const contentDisposition = response.headers['content-disposition'];
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/);
                if (match && match[1]) filename = match[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();

            setSuccessMessage(`DAS de ${empresa.nome} baixado com sucesso!`);

        } catch (err) {
            console.error("Erro DAS:", err);
            try {
                if (err.response?.data instanceof Blob) {
                    const txt = await err.response.data.text();
                    const json = JSON.parse(txt);
                    setError(json.error || "Erro ao gerar DAS.");
                } else {
                    setError("Erro de comunicação.");
                }
            } catch (e) {
                setError("Ocorreu um erro ao tentar gerar o DAS.");
            }
        } finally {
            setLoadingDas(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-8 animate-fade-in font-sans text-gray-800 dark:text-gray-100 flex flex-col items-center">
            <div className="w-full max-w-4xl">
                <header className="mb-10 text-center">
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 mb-2">
                        Central do Simples Nacional
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400">
                        {step === 0
                            ? "Escolha o serviço que deseja acessar."
                            : selectedAction === 'extrato'
                                ? "Consulta de Extrato Simples Nacional"
                                : "Emissão de Guia DAS"
                        }
                    </p>
                </header>

                <AnimatePresence mode="wait">
                    {step === 0 ? (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto"
                        >
                            {/* Card Extrato */}
                            <button
                                onClick={() => handleSelectAction('extrato')}
                                className="relative group overflow-hidden p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 shadow-xl hover:shadow-2xl transition-all duration-300 text-left w-full"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <DocumentChartBarIcon className="h-40 w-40 text-indigo-600 dark:text-indigo-400 transform rotate-12" />
                                </div>
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className="h-20 w-20 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        <MagnifyingGlassIcon className="h-10 w-10 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Consultar Extrato</h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs">
                                        Visualize o detalhamento completo dos tributos e valores declarados.
                                    </p>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                            </button>

                            {/* Card DAS */}
                            <button
                                onClick={() => handleSelectAction('das')}
                                className="relative group overflow-hidden p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent hover:border-emerald-100 dark:hover:border-emerald-900 shadow-xl hover:shadow-2xl transition-all duration-300 text-left w-full"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <DocumentArrowDownIcon className="h-40 w-40 text-emerald-600 dark:text-emerald-400 transform -rotate-12" />
                                </div>
                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        <DocumentArrowDownIcon className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Emitir Guia DAS</h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed max-w-xs">
                                        Gere e faça o download da guia de pagamento mensal.
                                    </p>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                            </button>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden max-w-2xl mx-auto"
                        >
                            <div className={`p-1 h-2 w-full ${selectedAction === 'extrato' ? 'bg-gradient-to-r from-indigo-500 to-purple-500' : 'bg-gradient-to-r from-emerald-500 to-teal-500'}`} />

                            <div className="p-8">
                                <div className="flex items-center justify-between mb-8">
                                    <button
                                        onClick={handleBack}
                                        className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white flex items-center gap-2 transition-colors text-sm font-medium"
                                    >
                                        &larr; Voltar
                                    </button>
                                    <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${selectedAction === 'extrato'
                                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                        }`}>
                                        {selectedAction === 'extrato' ? 'Consulta Extrato' : 'Emissão DAS'}
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            Selecione a Empresa
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={selectedEmpresaId}
                                                onChange={(e) => setSelectedEmpresaId(e.target.value)}
                                                className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 appearance-none transition-all font-medium text-gray-800 dark:text-white"
                                            >
                                                <option value="">Clique para selecionar...</option>
                                                {empresas.map(emp => (
                                                    <option key={emp.id} value={emp.id}>{emp.nome}</option>
                                                ))}
                                            </select>
                                            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                                                <UsersIcon className="h-5 w-5" />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            Período de Apuração
                                        </label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="relative">
                                                <select
                                                    value={selectedMonth}
                                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                                    className="w-full pl-4 pr-8 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 appearance-none transition-all font-medium text-gray-800 dark:text-white"
                                                >
                                                    {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                                                    <CalendarDaysIcon className="h-5 w-5" />
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <select
                                                    value={selectedYear}
                                                    onChange={(e) => setSelectedYear(e.target.value)}
                                                    className="w-full pl-4 pr-8 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 appearance-none transition-all font-medium text-gray-800 dark:text-white"
                                                >
                                                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                                </select>
                                                <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                                                    <CalendarDaysIcon className="h-5 w-5" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Botão de Ação */}
                                    <button
                                        onClick={handleExecute}
                                        disabled={loadingExtrato || loadingDas}
                                        className={`w-full py-4 px-6 rounded-xl font-bold text-white shadow-lg transform transition-all hover:-translate-y-1 hover:shadow-xl disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-3 ${selectedAction === 'extrato'
                                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700'
                                                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700'
                                            }`}
                                    >
                                        {(loadingExtrato || loadingDas) ? (
                                            <ArrowPathIcon className="h-6 w-6 animate-spin" />
                                        ) : selectedAction === 'extrato' ? (
                                            <DocumentChartBarIcon className="h-6 w-6" />
                                        ) : (
                                            <DocumentArrowDownIcon className="h-6 w-6" />
                                        )}
                                        {loadingExtrato || loadingDas
                                            ? 'Processando...'
                                            : selectedAction === 'extrato'
                                                ? 'Baixar Extrato PDF'
                                                : 'Gerar Guia DAS PDF'
                                        }
                                    </button>
                                </div>

                                {/* Mensagens */}
                                <div className="mt-6">
                                    <AnimatePresence>
                                        {error && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 p-4 rounded-xl text-sm flex items-center gap-3"
                                            >
                                                <InformationCircleIcon className="h-5 w-5 shrink-0" />
                                                {error}
                                            </motion.div>
                                        )}
                                        {successMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-4 rounded-xl text-sm flex items-center gap-3"
                                            >
                                                <CheckCircleIcon className="h-5 w-5 shrink-0" />
                                                {successMessage}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default CentralDoSimples;
