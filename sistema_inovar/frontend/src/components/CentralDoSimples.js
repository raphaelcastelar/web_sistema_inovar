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
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const [extratoData, setExtratoData] = useState(null);
    const [activeTab, setActiveTab] = useState('extrato'); // 'extrato' or 'das' (though UI is blended now)

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

    const handleConsultarExtrato = async () => {
        if (!validateSelection()) return;
        resetMessages();
        setLoadingExtrato(true);
        setActiveTab('extrato');

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
        setActiveTab('das');

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
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 md:p-8 animate-fade-in font-sans text-gray-800 dark:text-gray-100">
            <div className="max-w-6xl mx-auto">
                <header className="mb-10 text-center">
                    <h1 className="text-4xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 mb-2">
                        Central do Simples Nacional
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400">
                        Gerencie suas obrigações, consulte extratos e emita guias DAS em um só lugar.
                    </p>
                </header>

                <div className="grid lg:grid-cols-3 gap-8">
                    {/* Painel de Controle (Esquerda) */}
                    <div className="lg:col-span-1 space-y-6">
                        <section className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6">
                            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-800 dark:text-white">
                                <UsersIcon className="h-6 w-6 text-indigo-500" />
                                Seleção
                            </h2>

                            <div className="space-y-5">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        Empresa
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedEmpresaId}
                                            onChange={(e) => setSelectedEmpresaId(e.target.value)}
                                            className="w-full pl-4 pr-10 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none transition-all"
                                        >
                                            <option value="">Selecione...</option>
                                            {empresas.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-500">
                                            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                        Período de Apuração
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="relative">
                                            <select
                                                value={selectedMonth}
                                                onChange={(e) => setSelectedMonth(e.target.value)}
                                                className="w-full pl-3 pr-8 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 appearance-none transition-all"
                                            >
                                                {monthOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={selectedYear}
                                                onChange={(e) => setSelectedYear(e.target.value)}
                                                className="w-full pl-3 pr-8 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 appearance-none transition-all"
                                            >
                                                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Status / Feedback */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3"
                                >
                                    <InformationCircleIcon className="h-6 w-6 text-red-600 dark:text-red-400 shrink-0" />
                                    <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
                                </motion.div>
                            )}
                            {successMessage && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                    className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-start gap-3"
                                >
                                    <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                                    <p className="text-sm text-green-700 dark:text-green-300 font-medium">{successMessage}</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Area de Ação Principal (Direita) */}
                    <div className="lg:col-span-2">
                        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Ações Disponíveis</h3>
                        <div className="grid md:grid-cols-2 gap-6">

                            {/* Card Extrato */}
                            <button
                                onClick={handleConsultarExtrato}
                                disabled={loadingExtrato}
                                className="relative group overflow-hidden p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent hover:border-indigo-100 dark:hover:border-indigo-900 shadow-lg hover:shadow-2xl transition-all duration-300 text-left w-full disabled:opacity-70 disabled:grayscale"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <DocumentChartBarIcon className="h-32 w-32 text-indigo-600 dark:text-indigo-400 transform rotate-12" />
                                </div>
                                <div className="relative z-10">
                                    <div className="h-14 w-14 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        {loadingExtrato ? <ArrowPathIcon className="h-7 w-7 text-indigo-600 animate-spin" /> : <MagnifyingGlassIcon className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />}
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Consultar Extrato</h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                        Visualize o detalhamento completo dos tributos e valores declarados do mês referência.
                                    </p>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                            </button>

                            {/* Card DAS */}
                            <button
                                onClick={handleGerarDas}
                                disabled={loadingDas}
                                className="relative group overflow-hidden p-8 rounded-2xl bg-white dark:bg-gray-800 border-2 border-transparent hover:border-emerald-100 dark:hover:border-emerald-900 shadow-lg hover:shadow-2xl transition-all duration-300 text-left w-full disabled:opacity-70 disabled:grayscale"
                            >
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <DocumentArrowDownIcon className="h-32 w-32 text-emerald-600 dark:text-emerald-400 transform -rotate-12" />
                                </div>
                                <div className="relative z-10">
                                    <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                        {loadingDas ? <ArrowPathIcon className="h-7 w-7 text-emerald-600 animate-spin" /> : <DocumentArrowDownIcon className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />}
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Emitir Guia DAS</h3>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed">
                                        Gere e faça o download da guia de pagamento do Documento de Arrecadação do Simples Nacional.
                                    </p>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-teal-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300" />
                            </button>
                        </div>

                        {/* Área de Resultado Condicional (Se um dia voltarmos a mostrar dados na tela) */}
                        {extratoData && (
                            <ExtratoResult
                                data={extratoData}
                                onDownloadPdf={() => { }} // Já estamos baixando direto na ação principal por enquanto
                                isDownloadingPdf={false}
                            />
                        )}

                        {!selectedEmpresaId && (
                            <div className="mt-8 p-10 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-gray-400">
                                <InformationCircleIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                <p>Selecione uma empresa para começar.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CentralDoSimples;
