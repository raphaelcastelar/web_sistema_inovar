import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { 
    UsersIcon, 
    CalendarDaysIcon, 
    MagnifyingGlassIcon, 
    DocumentArrowDownIcon,
    InformationCircleIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';

// --- SUB-COMPONENTE PARA RENDERIZAR O RESULTADO ---
// Mantido fora para melhor organização e performance
const ExtratoResult = ({ data, onDownloadPdf, isDownloadingPdf }) => {
    if (!data) {
        return null; // Não renderiza nada se não houver dados
    }

    const formatCurrency = (value) => {
        if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    // --- CENÁRIO: Declaração entregue, mas sem valor a pagar ---
    if (data.tipo === 'declaracao_sem_valor') {
        const { periodoApuracao, mensagem } = data;
        return (
            <div className="max-w-4xl mx-auto mt-10 bg-blue-50 dark:bg-gray-800 p-6 rounded-xl shadow-lg animate-fade-in border-l-4 border-blue-500 dark:border-blue-400">
                <div className="flex items-center gap-4">
                    <InformationCircleIcon className="h-10 w-10 text-blue-500 dark:text-blue-400 flex-shrink-0"/>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-white">
                            Período de {periodoApuracao ? `${periodoApuracao.substring(4, 6)}/${periodoApuracao.substring(0, 4)}` : ''}
                        </h2>
                        <p className="text-gray-600 dark:text-blue-200">{mensagem}</p>
                    </div>
                </div>
            </div>
        );
    }

    // --- CENÁRIO: Extrato Detalhado (com valor a pagar) ---
    if (data.tipo === 'extrato_detalhado') {
        const dasDetails = data.declaracoes?.[0]?.das?.[0]?.detalhamentoDas;
        if (!dasDetails) {
            return (
                <div className="max-w-4xl mx-auto mt-10 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg text-yellow-700 dark:text-yellow-300">
                    <p>A API retornou sucesso, mas a estrutura do extrato não foi reconhecida.</p>
                </div>
            );
        }
        const composicao = dasDetails.composicao || [];
        
        return (
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-4xl mx-auto mt-10 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-gray-200 dark:border-gray-700 pb-4 mb-6 gap-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-indigo-400">
                        Extrato para {dasDetails.periodoApuracao ? `${dasDetails.periodoApuracao.substring(4, 6)}/${dasDetails.periodoApuracao.substring(0, 4)}` : 'Período Indefinido'}
                    </h2>
                    <button
                        onClick={onDownloadPdf}
                        disabled={isDownloadingPdf}
                        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Baixar o extrato em formato PDF"
                    >
                        {isDownloadingPdf ? 'Baixando...' : <><DocumentArrowDownIcon className="h-5 w-5"/> Baixar PDF</>}
                    </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 text-center">
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-500 dark:text-gray-400">Nº Documento</p><p className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white break-all">{dasDetails.numeroDocumento || 'N/A'}</p></div>
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-500 dark:text-gray-400">Vencimento</p><p className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">{dasDetails.dataVencimento ? new Date(dasDetails.dataVencimento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p></div>
                    <div className="bg-green-100 dark:bg-green-800/50 p-4 rounded-lg"><p className="text-sm text-green-700 dark:text-green-300">Valor Total</p><p className="text-lg md:text-xl font-bold text-green-800 dark:text-green-200">{formatCurrency(dasDetails.valores?.total)}</p></div>
                    <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-500 dark:text-gray-400">Situação</p><p className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">{dasDetails.situacao || 'N/A'}</p></div>
                </div>
                <h3 className="text-xl font-semibold text-gray-800 dark:text-indigo-300 mt-8 mb-4">Composição dos Tributos</h3>
                <div className="overflow-x-auto"><table className="min-w-full bg-gray-50 dark:bg-gray-750 rounded-lg"><thead><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tributo</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Valor Principal</th></tr></thead><tbody className="divide-y divide-gray-200 dark:divide-gray-700">{composicao.map((comp, compIndex) => (<tr key={compIndex} className="hover:bg-gray-100 dark:hover:bg-gray-700"><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">{comp.denominacao} ({comp.codigo})</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200 text-right">{formatCurrency(comp.valores?.principal)}</td></tr>))}</tbody></table></div>
            </motion.div>
        );
    }
    return null;
};

// --- COMPONENTE PRINCIPAL DA PÁGINA ---
const ConsultarExtratoPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [extratoData, setExtratoData] = useState(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    // ... (yearOptions e monthOptions permanecem os mesmos) ...
    const yearOptions = useMemo(() => { const currentYear = new Date().getFullYear(); const years = []; for (let i = -4; i <= 2; i++) { years.push(currentYear + i); } return years.sort((a,b) => b-a); }, []);
    const monthOptions = useMemo(() => [ { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' }, { value: '03', label: 'Março' }, { value: '04', label: 'Abril' }, { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' }, { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' } ], []);

    useEffect(() => {
        axiosInstance.get('/api/empresas/').then(response => setEmpresas(response.data))
            .catch(err => setError("Não foi possível carregar as empresas."));
    }, []);

    const handleConsultarExtrato = async () => {
        if (!selectedEmpresaId || !selectedYear || !selectedMonth) {
            setError("Por favor, selecione uma empresa, um ano e um mês.");
            return;
        }
        setLoading(true);
        setError('');
        setExtratoData(null);
        const periodoApuracao = `${selectedYear}${selectedMonth}`;
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        if (!empresaSelecionada) {
            setError("Empresa selecionada não encontrada."); setLoading(false); return;
        }
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');
        try {
            const response = await axiosInstance.post('/api/serpro/consultar-extrato/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            });
            setExtratoData(response.data);
        } catch (err) {
            const errorDetail = err.response?.data?.error || "Ocorreu um erro ao consultar o extrato.";
            setError(errorDetail);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!extratoData || !selectedEmpresaId) { setError("Dados não disponíveis para download."); return; }
        const numero_das = extratoData.declaracoes?.[0]?.das?.[0]?.detalhamentoDas?.numeroDocumento;
        if (!numero_das) { setError("Não foi possível encontrar o Número do Documento para baixar o PDF."); return; }
        setIsDownloadingPdf(true);
        setError('');
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');
        try {
            const response = await axiosInstance.post('/api/serpro/download-extrato-pdf/', {
                cnpj: cnpjLimpo,
                numero_das: numero_das,
            }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const contentDisposition = response.headers['content-disposition'];
            let filename = `Extrato_Simples_${cnpjLimpo}_${numero_das}.pdf`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch && filenameMatch.length === 2) filename = filenameMatch[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            let errorMsg = "Ocorreu um erro ao baixar o PDF.";
            if (err.response?.data instanceof Blob && err.response.data.type === "application/json") {
                const errorJsonText = await err.response.data.text();
                const errorObj = JSON.parse(errorJsonText);
                errorMsg = errorObj.error || errorMsg;
            }
            setError(errorMsg);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    return (
        <div className="p-6 md:p-8">
            <div className="max-w-3xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-2">Consultar Extrato do Simples Nacional</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-8">Consulte o extrato detalhado de um período de apuração específico.</p>
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 space-y-6"
                >
                    <div><label htmlFor="empresa-select" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"><UsersIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400"/>Empresa</label><select id="empresa-select" value={selectedEmpresaId} onChange={(e) => setSelectedEmpresaId(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"><option value="">Selecione uma empresa...</option>{empresas.map(emp => (<option key={emp.id} value={emp.id}>{emp.nome}</option>))}</select></div>
                    <div><label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"><CalendarDaysIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400"/>Período de Apuração</label><div className="grid grid-cols-2 gap-4"><select id="month-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">{monthOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select><select id="year-select" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">{yearOptions.map(year => (<option key={year} value={year}>{year}</option>))}</select></div></div>
                    <div className="pt-4"><button onClick={handleConsultarExtrato} disabled={loading || !selectedEmpresaId} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50"><span className="text-base">{loading ? 'Consultando...' : 'Consultar Extrato'}</span>{loading ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <MagnifyingGlassIcon className="h-5 w-5"/>}</button></div>
                </motion.div>
                
                <div className="mt-6">
                    {!loading && error && <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 flex items-center justify-center gap-3"><InformationCircleIcon className="h-6 w-6"/><span>{error}</span></div>}
                    {!loading && <ExtratoResult data={extratoData} onDownloadPdf={handleDownloadPdf} isDownloadingPdf={isDownloadingPdf} />}
                </div>
            </div>
        </div>
    );
};

export default ConsultarExtratoPage;