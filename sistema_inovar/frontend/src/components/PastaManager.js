import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { 
    DocumentTextIcon, 
    EnvelopeIcon, 
    ChatBubbleBottomCenterTextIcon, 
    ArrowPathIcon,
    FolderIcon,
    ArrowUpOnSquareIcon,
    XMarkIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';

const SERVER_FILE_URL_BASE = process.env.REACT_APP_API_URL || '';

// --- CONFIGURAÇÕES E FUNÇÕES AUXILIARES (DO SEU CÓDIGO ORIGINAL) ---

const pastaConfig = {
    constitutivos_societario: { group: 'Constitutivos', label: 'Societário', period: 'none' },
    constitutivos_inscricoes: { group: 'Constitutivos', label: 'Inscrições', period: 'none' },
    constitutivos_outros: { group: 'Constitutivos', label: 'Outros', period: 'none' },
    pessoal_guias: { group: 'Pessoal', label: 'Guias', period: 'monthly' },
    pessoal_folha_pagamento: { group: 'Pessoal', label: 'Folha de Pagamento', period: 'monthly' },
    pessoal_relatorios: { group: 'Pessoal', label: 'Relatórios', period: 'monthly' },
    fiscal_xml: { group: 'Fiscal', label: 'XML', period: 'monthly' },
    fiscal_guias: { group: 'Fiscal', label: 'Guias', period: 'monthly' },
    fiscal_extratos: { group: 'Fiscal', label: 'Extratos', period: 'monthly' },
    fiscal_declaracoes: { group: 'Fiscal', label: 'Declarações', period: 'annual' },
    contabil_balanco_anual: { group: 'Contábil', label: 'Balanço Anual', period: 'annual' },
    contabil_documentos: { group: 'Contábil', label: 'Documentos', period: 'monthly' },
    financeiro_honorarios_mensais: { group: 'Financeiro', label: 'Honorários Mensais', period: 'monthly' },
    outros: { group: 'Outros', label: 'Outros', period: 'none' },
};
const pastaTypes = Object.keys(pastaConfig);
const periodFolderTypes = pastaTypes.filter(tipo => pastaConfig[tipo].period === 'monthly');
const annualFolderTypes = pastaTypes.filter(tipo => pastaConfig[tipo].period === 'annual');
const pastaGroups = pastaTypes.reduce((groups, tipo) => {
    const group = pastaConfig[tipo].group;
    if (!groups[group]) groups[group] = [];
    groups[group].push(tipo);
    return groups;
}, {});
const monthOrder = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const buildFileViewUrl = (tipoPasta, arquivoId) => `${SERVER_FILE_URL_BASE}/api/arquivos/${tipoPasta}/${arquivoId}/visualizar/`;
const getBrazilianLocalPhoneDigits = (value = '') => {
    let digits = String(value).replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length > 11) digits = digits.slice(2);
    return digits.slice(0, 11);
};
const formatBrazilianPhone = (value = '') => {
    const digits = getBrazilianLocalPhoneDigits(value);
    if (digits.length <= 2) return digits ? `(${digits}` : '';
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

const sortYearsForDisplay = (years) => {
    const currentYear = new Date().getFullYear().toString();
    return [...years].sort((a, b) => {
        if (a === currentYear && b !== currentYear) return -1;
        if (b === currentYear && a !== currentYear) return 1;

        const numericA = Number(a);
        const numericB = Number(b);
        if (!Number.isNaN(numericA) && !Number.isNaN(numericB)) {
            return numericB - numericA;
        }

        return b.localeCompare(a);
    });
};

const getPreviousUploadPeriod = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return {
        month: String(date.getMonth() + 1).padStart(2, '0'),
        year: date.getFullYear().toString(),
    };
};

const groupFilesByYearAndMonth = (files) => {
    if (!files || files.length === 0) return {};
    const grouped = files.reduce((acc, file) => {
        if (!file.ano || !file.mes) return acc;
        const year = file.ano.toString();
        const monthNumber = parseInt(file.mes, 10);
        if (isNaN(monthNumber) || monthNumber < 1 || monthNumber > 12) return acc;
        const monthKey = `${file.mes.padStart(2, '0')}${year}`;
        const monthName = monthOrder[monthNumber - 1] || `Mês ${file.mes}`;
        if (!acc[year]) acc[year] = {};
        if (!acc[year][monthKey]) {
            acc[year][monthKey] = { monthNameDisplay: monthName.charAt(0).toUpperCase() + monthName.slice(1), monthSortKey: monthNumber, files: [] };
        }
        acc[year][monthKey].files.push(file);
        return acc;
    }, {});
    const sortedYears = sortYearsForDisplay(Object.keys(grouped));
    const result = {};
    for (const year of sortedYears) {
        const yearData = grouped[year];
        const sortedMonthKeys = Object.keys(yearData).sort((a, b) => yearData[b].monthSortKey - yearData[a].monthSortKey);
        result[year] = {};
        for (const monthKey of sortedMonthKeys) {
            result[year][monthKey] = yearData[monthKey];
        }
    }
    return result;
};

// --- SUB-COMPONENTE ACORDEÃO ESTILIZADO ---
const YearMonthAccordion = ({ files, selectedFiles, toggleFileSelection, folderType }) => {
    const [activeYear, setActiveYear] = useState(null);
    const groupedData = useMemo(() => groupFilesByYearAndMonth(files), [files]);
    const sortedYears = useMemo(() => sortYearsForDisplay(Object.keys(groupedData)), [groupedData]);

    useEffect(() => {
        if (sortedYears.length > 0) {
            setActiveYear(sortedYears[0]);
        }
    }, [sortedYears]);

    if (!files || files.length === 0) return <div className="text-center py-10"><p className="text-gray-500 dark:text-gray-400 italic">Nenhum arquivo nesta pasta.</p></div>;
    if (sortedYears.length === 0) return <div className="text-center py-10"><p className="text-gray-500 dark:text-gray-400 italic">Não foi possível agrupar os arquivos por data.</p></div>;

    return (
        <div className="space-y-2">
            {sortedYears.map(year => (
                <div key={year} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <button onClick={() => setActiveYear(activeYear === year ? null : year)} className="w-full flex justify-between items-center p-4">
                        <span className="font-semibold text-lg text-gray-700 dark:text-indigo-300">Ano: {year}</span>
                        <span className={`transform transition-transform duration-200 ${activeYear === year ? 'rotate-180' : ''}`}><svg className="h-5 w-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg></span>
                    </button>
                    {activeYear === year && (
                        <div className="border-t border-gray-200 dark:border-gray-700">
                            {Object.values(groupedData[year]).map(monthData => (
                                <div key={monthData.monthNameDisplay} className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
                                    <h4 className="p-3 px-6 bg-gray-100 dark:bg-gray-700/50 font-semibold text-gray-600 dark:text-gray-300">{monthData.monthNameDisplay}</h4>
                                    <ul className="space-y-1 p-4">
                                        {monthData.files.map(file => (
                                            <li key={file.id} className="flex items-center space-x-3 p-2 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md">
                                                <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFileSelection(file.id)} className="form-checkbox h-4 w-4 rounded bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500"/>
                                                <DocumentTextIcon className="h-6 w-6 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                <span className="flex-grow truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                                                <a href={buildFileViewUrl(folderType, file.id)} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Ver</a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// --- COMPONENTE PRINCIPAL DA PÁGINA ---
const PastaManager = () => {
    // --- ESTADO DO COMPONENTE ---
    const { empresaId } = useParams();
    const [pastas, setPastas] = useState([]);
    const [activeFolderGroup, setActiveFolderGroup] = useState('Constitutivos');
    const [selectedPasta, setSelectedPasta] = useState(null);
    const [empresaNome, setEmpresaNome] = useState('');
    const [empresaCnpj, setEmpresaCnpj] = useState('');
    const [empresaEmail, setEmpresaEmail] = useState('');
    const [empresaTelefone, setEmpresaTelefone] = useState('');
    const [arquivos, setArquivos] = useState({});
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [isRefreshingPasta, setIsRefreshingPasta] = useState(false);
    const [targetUploadYear, setTargetUploadYear] = useState('');
    const [targetUploadMonth, setTargetUploadMonth] = useState('');
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailDestinatario, setEmailDestinatario] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [whatsAppDestinatario, setWhatsAppDestinatario] = useState('');
    const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

    // --- LÓGICA DE DADOS E API ---
    const fetchData = useCallback(() => {
        setLoading(true);
        axiosInstance.get(`/api/empresas/${empresaId}/`).then(response => {
            setEmpresaNome(response.data.nome);
            setEmpresaCnpj(response.data.cnpj);
            setEmpresaEmail(response.data.email || '');
            setEmpresaTelefone(response.data.telefone || '');
        });
        const promises = pastaTypes.map(tipo => {
            return axiosInstance.get('/api/documentos-empresa/', { params: { empresa_id: empresaId, folder_key: tipo } })
                .then(response => ({ tipo, data: response.data }))
                .catch(() => ({ tipo, data: [] }));
        });
        Promise.all(promises).then(results => {
            const arquivosData = {};
            results.forEach(({ tipo, data }) => { arquivosData[tipo] = data; });
            setArquivos(arquivosData);
            setLoading(false);
        });
    }, [empresaId]);

    useEffect(() => {
        setPastas(pastaTypes.map(tipo => ({ tipo, id: tipo })));
        fetchData();
    }, [fetchData]);

    const onDrop = useCallback((acceptedFiles, pastaTipo) => {
        if (!empresaNome || !empresaCnpj) { alert('Aguarde os dados da empresa carregarem.'); return; }
        setUploading(true);
        setError(null);
        const uploadPromises = acceptedFiles.map(file => {
            const formData = new FormData();
            formData.append('caminho_arquivo', file);
            formData.append('nome_arquivo', file.name);
            formData.append('empresa', empresaId);
            formData.append('folder_key', pastaTipo);
            
            // Lógica para usar o mês/ano selecionado ou o mês anterior
            if (periodFolderTypes.includes(pastaTipo)) {
                const previousUploadPeriod = getPreviousUploadPeriod();
                const anoParaSalvar = targetUploadYear || previousUploadPeriod.year;
                const mesParaSalvar = targetUploadMonth || previousUploadPeriod.month;
                formData.append('mes', mesParaSalvar);
                formData.append('ano', anoParaSalvar);
            }
            if (annualFolderTypes.includes(pastaTipo)) {
                formData.append('ano', targetUploadYear || new Date().getFullYear().toString());
            }
            return axiosInstance.post('/api/documentos-empresa/', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        });
        Promise.all(uploadPromises)
            .then(() => { fetchData(); })
            .catch(err => { setError(err.response?.data?.detail || err.message || 'Erro no upload.'); })
            .finally(() => setUploading(false));
    }, [empresaNome, empresaCnpj, empresaId, targetUploadYear, targetUploadMonth, fetchData]);
    
    // Hook do Dropzone funcional
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop: acceptedFiles => { if (selectedPasta) onDrop(acceptedFiles, selectedPasta.tipo) },
        noKeyboard: true,
    });
    
    // --- HANDLERS DE INTERAÇÃO COM LÓGICA COMPLETA ---
    const toggleFileSelection = (fileId) => setSelectedFiles(prev => prev.includes(fileId) ? prev.filter(id => id !== fileId) : [...prev, fileId]);
    const handlePastaClick = (pasta) => {
        setSelectedPasta(pasta); 
        setSelectedFiles([]); 
        setError(null);
        setTargetUploadYear('');
        setTargetUploadMonth('');
    };

    const handleFolderGroupClick = (group) => {
        setActiveFolderGroup(group);
        setSelectedPasta(null);
        setSelectedFiles([]);
        setError(null);
    };

    const handleRefreshSelectedPasta = async () => {
        if (!selectedPasta) return;
        setIsRefreshingPasta(true);
        setError(null);
        try {
            const response = await axiosInstance.post('/api/documentos-empresa/sincronizar/', { empresa_id: empresaId, folder_key: selectedPasta.tipo });
            alert(response.data.message || 'Pasta sincronizada com sucesso!');
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || `Falha ao sincronizar a pasta.`);
        } finally {
            setIsRefreshingPasta(false);
        }
    };

    const handleEmailClick = () => {
        if (selectedFiles.length === 0) { alert('Selecione ao menos um arquivo.'); return; }
        setEmailDestinatario(empresaEmail);
        setShowEmailModal(true);
    };

    const handleEmailSubmit = (event) => {
        event.preventDefault();
        const destinatario = emailDestinatario.trim();
        if (!destinatario) return;
        setSendingEmail(true);
        axiosInstance.post(`/api/enviar-email/`, {
            empresa_id: empresaId,
            tipo_pasta: selectedPasta.tipo,
            file_ids: selectedFiles,
            email_destinatario: destinatario,
        })
            .then(res => {
                alert(res.data.message);
                setSelectedFiles([]);
                setShowEmailModal(false);
            })
            .catch(err => alert(`Erro: ${err.response?.data?.error || 'Falha ao enviar email.'}`))
            .finally(() => setSendingEmail(false));
    };
    
    const handleWhatsAppClick = () => {
        if (selectedFiles.length === 0) { alert('Selecione ao menos um arquivo.'); return; }
        setWhatsAppDestinatario(formatBrazilianPhone(empresaTelefone));
        setShowWhatsAppModal(true);
    };

    const handleWhatsAppSubmit = (event) => {
        event.preventDefault();
        const phoneDigits = getBrazilianLocalPhoneDigits(whatsAppDestinatario);
        if (phoneDigits.length !== 11) return;
        setSendingWhatsApp(true);
        axiosInstance.post(`/api/enviar-documentos-whatsapp/`, {
            empresa_id: empresaId,
            file_ids: selectedFiles,
            tipo_pasta: selectedPasta.tipo,
            telefone_destinatario: `55${phoneDigits}`,
        })
            .then(res => {
                let message = `Relatório de Envio:\n${res.data.message || ''}`;
                if (res.data.successful_sends?.length > 0) message += `\nSucessos: ${res.data.successful_sends.map(s => s.filename).join(', ')}`;
                if (res.data.failed_sends?.length > 0) message += `\nFalhas: ${res.data.failed_sends.map(f => f.filename).join(', ')}`;
                alert(message);
                setSelectedFiles([]);
                setShowWhatsAppModal(false);
            })
            .catch(err => alert(`Erro: ${err.response?.data?.error || 'Falha ao enviar por WhatsApp.'}`))
            .finally(() => setSendingWhatsApp(false));
    };

    // --- RENDERIZAÇÃO DO COMPONENTE ---
    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                {loading && !empresaNome ? (
                    <div className="space-y-2"><div className="h-9 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div><div className="h-6 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div></div>
                ) : (
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Documentos</p>
                        <h1 className="mt-2 break-words font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">{empresaNome}</h1>
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Gerencie arquivos e compartilhe documentos · CNPJ: {empresaCnpj}</p>
                    </div>
                )}
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Pastas gerais</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Escolha uma área para visualizar suas subpastas.</p>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                    {Object.entries(pastaGroups).map(([group, tipos]) => {
                        const fileCount = tipos.reduce((total, tipo) => total + (arquivos[tipo]?.length || 0), 0);
                        const active = activeFolderGroup === group;
                        return (
                            <button key={group} onClick={() => handleFolderGroupClick(group)} className={`flex min-h-20 items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${active ? 'border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950' : 'border-gray-200 bg-gray-50 hover:border-[#c49a61] hover:bg-white dark:border-gray-700 dark:bg-gray-800/60 dark:hover:bg-gray-800'}`}>
                                <FolderIcon className={`h-7 w-7 shrink-0 ${active ? 'text-current' : 'text-[#c49a61]'}`} />
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold">{group}</span>
                                    <span className={`mt-0.5 block text-xs ${active ? 'opacity-70' : 'text-gray-500 dark:text-gray-400'}`}>{fileCount} arquivo(s)</span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Subpastas de {activeFolderGroup}</h3>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {(pastaGroups[activeFolderGroup] || []).map(tipo => {
                            const pasta = pastas.find(item => item.tipo === tipo) || { tipo, id: tipo };
                            const active = selectedPasta?.id === pasta.id;
                            return (
                                <motion.button key={pasta.id} onClick={() => handlePastaClick(pasta)} whileHover={{ x: 2 }} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left transition ${active ? 'border-[#c49a61] bg-amber-50 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100' : 'border-gray-200 bg-white hover:border-[#c49a61] dark:border-gray-700 dark:bg-gray-900'}`}>
                                    <span className="flex min-w-0 items-center gap-3">
                                        <FolderIcon className="h-5 w-5 shrink-0 text-[#c49a61]" />
                                        <span className="truncate text-sm font-semibold">{pastaConfig[tipo].label}</span>
                                    </span>
                                    <span className="ml-3 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{arquivos[tipo]?.length || 0}</span>
                                </motion.button>
                            );
                        })}
                    </div>
                </div>
            </section>

            <AnimatePresence mode="wait">
                {selectedPasta && (
                <motion.div key={selectedPasta.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c49a61]">{pastaConfig[selectedPasta.tipo]?.group}</p><h3 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">{pastaConfig[selectedPasta.tipo]?.label || selectedPasta.tipo.replace(/_/g, ' ')}</h3></div>
                            <button onClick={handleRefreshSelectedPasta} disabled={isRefreshingPasta} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors" title="Sincronizar Pasta">
                                {isRefreshingPasta ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ArrowPathIcon className="h-5 w-5" />}
                            </button>
                        </div>
                        
                        <div className="p-4 sm:p-6">
                            {error && (
                                <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
                                    {error}
                                </div>
                            )}
                            {([...periodFolderTypes, ...annualFolderTypes].includes(selectedPasta.tipo)) && (
                                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Período para Upload (Opcional)</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        {periodFolderTypes.includes(selectedPasta.tipo) && <select value={targetUploadMonth} onChange={(e) => setTargetUploadMonth(e.target.value)} className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500">
                                            <option value="">Mês Anterior</option>
                                            {monthOrder.map((month, index) => <option key={index} value={(index + 1).toString().padStart(2, '0')}>{month.charAt(0).toUpperCase() + month.slice(1)}</option>)}
                                        </select>}
                                        <select value={targetUploadYear} onChange={(e) => setTargetUploadYear(e.target.value)} className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500">
                                            <option value="">Ano do Mês Anterior</option>
                                            {[...Array(5)].map((_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div {...getRootProps()} className={`cursor-pointer rounded-lg border border-dashed p-8 text-center transition-all ${isDragActive ? 'border-[#c49a61] bg-amber-50 dark:bg-amber-950/20' : 'border-gray-300 hover:border-[#c49a61] dark:border-gray-700'}`}>
                                <input {...getInputProps()}/>
                                <div className="flex flex-col items-center text-gray-500 dark:text-gray-400">
                                    <ArrowUpOnSquareIcon className="mx-auto h-10 w-10 mb-2"/>
                                    <p className="font-semibold">{uploading ? 'Enviando...' : (isDragActive ? 'Solte os arquivos...' : 'Arraste ou clique para selecionar')}</p>
                                </div>
                            </div>
                        </div>

                        {selectedFiles.length > 0 && (
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-y border-gray-200 dark:border-gray-700 flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{selectedFiles.length} arquivo(s) selecionado(s)</span>
                                <div className="flex-grow"></div>
                                <button onClick={handleEmailClick} disabled={loading || uploading} className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950"><EnvelopeIcon className="h-4 w-4"/> Enviar por e-mail</button>
                                <button onClick={handleWhatsAppClick} disabled={loading || uploading || selectedPasta.tipo === 'fiscal_xml'} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"><ChatBubbleBottomCenterTextIcon className="h-4 w-4"/> Enviar WhatsApp</button>
                            </div>
                        )}

                        <div className="p-2 sm:p-4">
                            {loading ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">Carregando...</p> : 
                            <>
                                {(!arquivos[selectedPasta.tipo] || arquivos[selectedPasta.tipo].length === 0) ? 
                                    <p className="text-center py-10 text-gray-500 dark:text-gray-400">Nenhum arquivo nesta pasta.</p> :
                                    (periodFolderTypes.includes(selectedPasta.tipo)) ? (
                                        <YearMonthAccordion files={arquivos[selectedPasta.tipo]} selectedFiles={selectedFiles} toggleFileSelection={toggleFileSelection} folderType={selectedPasta.tipo} />
                                    ) : (
                                        <ul className="space-y-1">{(arquivos[selectedPasta.tipo]).map(file => (
                                            <li key={file.id} className="flex items-center space-x-3 p-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md">
                                                <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFileSelection(file.id)} className="form-checkbox h-4 w-4 rounded bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500" />
                                                <DocumentTextIcon className="h-6 w-6 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                <span className="flex-grow truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                                                {['pessoal_guias', 'fiscal_guias'].includes(selectedPasta.tipo) && (<span className={`text-xs px-2 py-0.5 font-semibold rounded-full ${file.entregue ? 'bg-green-100 text-green-800 dark:bg-green-800/60 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/60 dark:text-yellow-200'}`}>{file.entregue ? 'Entregue' : 'Pendente'}</span>)}
                                                <a href={buildFileViewUrl(selectedPasta.tipo, file.id)} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Ver</a>
                                            </li>
                                        ))}</ul>
                                    )
                                }
                            </>
                            }
                        </div>
                    </div>
                </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showEmailModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                        onMouseDown={() => !sendingEmail && setShowEmailModal(false)}
                    >
                        <motion.form
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onSubmit={handleEmailSubmit}
                            className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                        >
                            <div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c49a61]">Envio avulso</p>
                                    <h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">Enviar arquivos por e-mail</h2>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedFiles.length} arquivo(s) selecionado(s)</p>
                                </div>
                                <button type="button" onClick={() => setShowEmailModal(false)} disabled={sendingEmail} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-5">
                                <label htmlFor="email-destinatario" className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">E-mail do destinatário</label>
                                <div className="relative mt-2">
                                    <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                    <input id="email-destinatario" type="email" required autoFocus value={emailDestinatario} onChange={(event) => setEmailDestinatario(event.target.value)} placeholder="destinatario@exemplo.com" className="h-11 w-full rounded-md border border-gray-200 bg-white pl-10 pr-3 text-sm text-gray-950 outline-none transition focus:border-[#c49a61] focus:ring-2 focus:ring-amber-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-amber-950/40" />
                                </div>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Você pode usar o e-mail cadastrado ou informar qualquer outro destinatário.</p>
                            </div>
                            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => setShowEmailModal(false)} disabled={sendingEmail} className="h-10 rounded-md border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancelar</button>
                                <button type="submit" disabled={sendingEmail || !emailDestinatario.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950">
                                    {sendingEmail ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                                    {sendingEmail ? 'Enviando...' : 'Confirmar envio'}
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showWhatsAppModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
                        onMouseDown={() => !sendingWhatsApp && setShowWhatsAppModal(false)}
                    >
                        <motion.form
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onSubmit={handleWhatsAppSubmit}
                            className="w-full max-w-lg rounded-lg border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                        >
                            <div className="flex items-start justify-between border-b border-gray-200 p-5 dark:border-gray-800">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Envio avulso</p>
                                    <h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">Enviar arquivos por WhatsApp</h2>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{selectedFiles.length} arquivo(s) selecionado(s)</p>
                                </div>
                                <button type="button" onClick={() => setShowWhatsAppModal(false)} disabled={sendingWhatsApp} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200">
                                    <XMarkIcon className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="p-5">
                                <label htmlFor="whatsapp-destinatario" className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">WhatsApp do destinatário</label>
                                <div className="mt-2 flex h-11 overflow-hidden rounded-md border border-gray-200 bg-white focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 dark:border-gray-700 dark:bg-gray-950 dark:focus-within:ring-emerald-950/40">
                                    <span className="flex items-center border-r border-gray-200 bg-gray-50 px-3 text-sm font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">+55</span>
                                    <input
                                        id="whatsapp-destinatario"
                                        type="tel"
                                        inputMode="numeric"
                                        required
                                        autoFocus
                                        value={whatsAppDestinatario}
                                        onChange={(event) => setWhatsAppDestinatario(formatBrazilianPhone(event.target.value))}
                                        placeholder="(28) 99999-9999"
                                        pattern="[(][0-9]{2}[)] [0-9]{5}-[0-9]{4}"
                                        title="Digite o número no formato (DD) 99999-9999"
                                        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-gray-950 outline-none dark:text-white"
                                    />
                                </div>
                                <div className={`mt-3 rounded-md px-3 py-2 text-xs font-semibold ${getBrazilianLocalPhoneDigits(whatsAppDestinatario).length === 11 ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'}`}>
                                    Formato obrigatório: +55 (DD) 99999-9999
                                </div>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">O código do Brasil (+55) já será incluído automaticamente.</p>
                            </div>
                            <div className="flex flex-col-reverse gap-2 border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/70 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => setShowWhatsAppModal(false)} disabled={sendingWhatsApp} className="h-10 rounded-md border border-gray-200 px-4 text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Cancelar</button>
                                <button type="submit" disabled={sendingWhatsApp || getBrazilianLocalPhoneDigits(whatsAppDestinatario).length !== 11} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                                    {sendingWhatsApp ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />}
                                    {sendingWhatsApp ? 'Enviando...' : 'Confirmar envio'}
                                </button>
                            </div>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PastaManager;
