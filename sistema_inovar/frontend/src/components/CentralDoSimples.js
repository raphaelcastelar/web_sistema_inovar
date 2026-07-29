import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { normalizeCnpj } from '../utils/cnpj';
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
                className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
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
            className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
        >
            {/* Header do Extrato */}
            <div className="flex flex-col gap-4 border-b border-gray-200 bg-slate-50 p-4 dark:border-gray-800 dark:bg-slate-900 md:flex-row md:items-center md:justify-between">
                <div>
                    <h3 className="text-base font-semibold text-gray-950 dark:text-gray-100">Resumo do Extrato</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {dasDetails.periodoApuracao ? `${dasDetails.periodoApuracao.substring(4, 6)}/${dasDetails.periodoApuracao.substring(0, 4)}` : 'Período Indefinido'}
                    </p>
                </div>
                <button
                    onClick={onDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
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
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Documento</span>
                    <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white truncate" title={dasDetails.numeroDocumento}>
                        {dasDetails.numeroDocumento || 'N/A'}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Vencimento</span>
                    <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white">
                        {dasDetails.dataVencimento ? new Date(dasDetails.dataVencimento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'N/A'}
                    </p>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">Valor Total</span>
                    <p className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(dasDetails.valores?.total || 0)}
                    </p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">Situação</span>
                    <p className="mt-1 text-lg font-bold text-gray-800 dark:text-white">
                        {dasDetails.situacao || 'N/A'}
                    </p>
                </div>
            </div>

            {/* Tabela de Composição */}
            <div className="px-4 pb-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Detalhamento dos Tributos</h4>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Tributo</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Valor Principal</th>
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
            cnpjLimpo: normalizeCnpj(emp.cnpj)
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
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <header className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                <h1 className="font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">
                    Central do Simples Nacional
                </h1>
                <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-400">
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
                        className="grid w-full gap-4 md:grid-cols-2"
                    >
                            {/* Card Extrato */}
                            <button
                                onClick={() => handleSelectAction('extrato')}
                                className="group min-w-0 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 sm:p-5"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                        <MagnifyingGlassIcon className="h-6 w-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-semibold text-gray-950 dark:text-gray-100">Consultar Extrato</h3>
                                        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                        Visualize o detalhamento completo dos tributos e valores declarados.
                                        </p>
                                    </div>
                                </div>
                            </button>

                            {/* Card DAS */}
                            <button
                                onClick={() => handleSelectAction('das')}
                                className="group min-w-0 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900 sm:p-5"
                            >
                                <div className="flex items-start gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        <DocumentArrowDownIcon className="h-6 w-6" />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="text-base font-semibold text-gray-950 dark:text-gray-100">Emitir Guia DAS</h3>
                                        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                        Gere e faça o download da guia de pagamento mensal.
                                        </p>
                                    </div>
                                </div>
                            </button>
                    </motion.div>
                ) : (
                    <motion.div
                        key="step1"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
                    >
                            <div className="p-4 sm:p-5">
                                <div className="flex items-center justify-between mb-8">
                                    <button
                                        onClick={handleBack}
                                        className="flex items-center gap-2 text-sm font-semibold text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-white"
                                    >
                                        &larr; Voltar
                                    </button>
                                    <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${selectedAction === 'extrato'
                                            ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
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
                                                className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 py-3 pl-4 pr-10 font-medium text-gray-800 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/20"
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
                                                    className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 py-3 pl-4 pr-8 font-medium text-gray-800 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/20"
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
                                                    className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 py-3 pl-4 pr-8 font-medium text-gray-800 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/20"
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
                                        className={`flex w-full items-center justify-center gap-3 rounded-md px-6 py-4 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${selectedAction === 'extrato'
                                                ? 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
                                                : 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300'
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
                                                className="flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                                            >
                                                <InformationCircleIcon className="h-5 w-5 shrink-0" />
                                                {error}
                                            </motion.div>
                                        )}
                                        {successMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
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
    );
};

export default CentralDoSimples;
