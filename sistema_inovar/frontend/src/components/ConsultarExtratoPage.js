import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { UsersIcon, CalendarDaysIcon, MagnifyingGlassIcon, DocumentArrowDownIcon, InformationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// --- SUB-COMPONENTE INTELIGENTE PARA RENDERIZAR O RESULTADO ---
const ExtratoResult = ({ data, onDownloadPdf, isDownloadingPdf }) => {
    if (!data) {
        return null; // Não renderiza nada se não houver dados
    }

    // --- CENÁRIO: Declaração entregue, mas sem valor a pagar ---
    if (data.tipo === 'declaracao_sem_valor') {
        return (
            <div className="max-w-4xl mx-auto mt-10 bg-gray-800 p-8 rounded-xl shadow-lg animate-fade-in border-l-4 border-blue-500">
                <div className="flex items-center gap-4">
                    <InformationCircleIcon className="h-12 w-12 text-blue-400 flex-shrink-0"/>
                    <div>
                        <h2 className="text-2xl font-bold text-white mb-1">
                            Período de {data.periodoApuracao ? `${data.periodoApuracao.substring(4, 6)}/${data.periodoApuracao.substring(0, 4)}` : ''}
                        </h2>
                        <p className="text-blue-200">{data.mensagem}</p>
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
                <div className="max-w-4xl mx-auto mt-10 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg text-yellow-300">
                    <p>A API retornou sucesso, mas a estrutura do extrato não foi reconhecida.</p>
                </div>
            );
        }
        
        const composicao = dasDetails.composicao || [];

        return (
            <div className="max-w-4xl mx-auto mt-10 bg-gray-800 p-8 rounded-xl shadow-lg animate-fade-in">
                <div className="flex justify-between items-center border-b border-gray-700 pb-4 mb-6">
                    <h2 className="text-2xl font-bold text-indigo-400">
                        Extrato para {dasDetails.periodoApuracao ? `${dasDetails.periodoApuracao.substring(4, 6)}/${dasDetails.periodoApuracao.substring(0, 4)}` : 'Período Indefinido'}
                    </h2>
                    <button
                        onClick={onDownloadPdf}
                        disabled={isDownloadingPdf}
                        className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Baixar o extrato em formato PDF"
                    >
                        {isDownloadingPdf ? 'Baixando...' : <><DocumentArrowDownIcon className="h-5 w-5"/> Baixar PDF</>}
                    </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 text-center">
                    <div className="bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-400">Número do Documento</p><p className="text-xl font-semibold text-white break-all">{dasDetails.numeroDocumento || 'N/A'}</p></div>
                    <div className="bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-400">Vencimento</p><p className="text-xl font-semibold text-white">{dasDetails.dataVencimento ? new Date(dasDetails.dataVencimento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'N/A'}</p></div>
                    <div className="bg-green-800 p-4 rounded-lg"><p className="text-sm text-green-200">Valor Total</p><p className="text-xl font-semibold text-white">{formatCurrency(dasDetails.valores?.total)}</p></div>
                    <div className="bg-gray-700 p-4 rounded-lg"><p className="text-sm text-gray-400">Situação</p><p className="text-xl font-semibold text-white">{dasDetails.situacao || 'N/A'}</p></div>
                </div>
                <h3 className="text-xl font-semibold text-indigo-300 mt-8 mb-4">Composição dos Tributos</h3>
                <div className="overflow-x-auto"><table className="min-w-full bg-gray-750 rounded-lg"><thead><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tributo</th><th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Principal</th></tr></thead><tbody className="divide-y divide-gray-700">{composicao.map((comp, compIndex) => (<tr key={compIndex} className="hover:bg-gray-700"><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">{comp.denominacao} ({comp.codigo})</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200 text-right">{formatCurrency(comp.valores?.principal)}</td></tr>))}</tbody></table></div>
            </div>
        );
    }
    return null; // Caso 'data' tenha um tipo não reconhecido
};


// --- COMPONENTE PRINCIPAL ---
const ConsultarExtratoPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [extratoData, setExtratoData] = useState(null);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear(); const years = [];
        for (let i = -2; i <= 4; i++) { years.push(currentYear - i); } return years;
    }, []);
    const monthOptions = useMemo(() => [
        { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' }, { value: '03', label: 'Março' },
        { value: '04', label: 'Abril' }, { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
        { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' }, { value: '09', label: 'Setembro' },
        { value: '10', label: 'Outubro' }, { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
    ], []);

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
            setError("Empresa selecionada não encontrada.");
            setLoading(false);
            return;
        }
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');
        try {
            const response = await axiosInstance.post('/api/serpro/consultar-extrato/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            });
            setExtratoData(response.data.extrato_data); // Corrigido para pegar o objeto correto
        } catch (err) {
            console.error("Erro ao consultar extrato:", err);
            const errorDetail = err.response?.data?.error || "Ocorreu um erro ao consultar o extrato.";
            setError(errorDetail);
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!extratoData || !selectedEmpresaId) {
            setError("Dados do extrato ou empresa não disponíveis para baixar o PDF.");
            return;
        }
        const numero_das = extratoData.declaracoes?.[0]?.das?.[0]?.detalhamentoDas?.numeroDocumento;

        if (!numero_das) {
            setError("Não foi possível encontrar o Número do Documento para baixar o PDF. Este extrato pode não ter uma guia de pagamento associada.");
            return;
        }
        
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
                if (filenameMatch && filenameMatch.length === 2)
                  filename = filenameMatch[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Erro ao baixar PDF do extrato:", err);
            let errorMsg = "Ocorreu um erro ao baixar o PDF.";
            if (err.response?.data instanceof Blob && err.response?.data.type === "application/json") {
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
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-indigo-400 mb-8">Consultar Extrato do Simples Nacional</h1>
            <div className="max-w-xl mx-auto bg-gray-800 p-8 rounded-xl shadow-lg space-y-6">
                 <div><label htmlFor="empresa-select" className="flex items-center text-sm font-medium text-gray-300 mb-1"><UsersIcon className="h-5 w-5 mr-2 text-indigo-400"/>Empresa</label><select id="empresa-select" value={selectedEmpresaId} onChange={(e) => setSelectedEmpresaId(e.target.value)} className="w-full p-3 bg-gray-700 text-white rounded-md mt-1 focus:ring-indigo-500 focus:border-indigo-500"><option value="">Selecione uma empresa...</option>{empresas.map(emp => (<option key={emp.id} value={emp.id}>{emp.nome}</option>))}</select></div>
                 <div><label className="flex items-center text-sm font-medium text-gray-300 mb-1"><CalendarDaysIcon className="h-5 w-5 mr-2 text-indigo-400"/>Período de Apuração</label><div className="flex items-center gap-4 mt-1"><select id="month-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-full p-3 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500">{monthOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select><select id="year-select" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full p-3 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500">{yearOptions.map(year => (<option key={year} value={year}>{year}</option>))}</select></div></div>
                 {error && !loading && <div className="p-3 bg-red-900/30 text-red-300 text-sm rounded-md">{error}</div>}
                 <div className="pt-4"><button onClick={handleConsultarExtrato} disabled={loading || !selectedEmpresaId} className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50">
                    {loading ? 'Consultando...' : <><MagnifyingGlassIcon className="h-5 w-5"/> Consultar Extrato</>}
                </button></div>
            </div>
            <div className="mt-6">
                {!loading && <ExtratoResult data={extratoData} onDownloadPdf={handleDownloadPdf} isDownloadingPdf={isDownloadingPdf} />}
            </div>
        </div>
    );
};

export default ConsultarExtratoPage;