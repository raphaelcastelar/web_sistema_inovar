import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
    ArrowUpOnSquareIcon
} from '@heroicons/react/24/outline';

const SERVER_FILE_URL_BASE = 'http://192.168.196.162:8000';

// --- CONFIGURAÇÕES E FUNÇÕES AUXILIARES (DO SEU CÓDIGO ORIGINAL) ---

const pastaConfig = {
    'documentos_constitutivos': { label: 'Doc. Constitutivos' },
    'departamento_pessoal': { label: 'Dpto. Pessoal' },
    'xml': { label: 'XML' },
    'simples_nacional': { label: 'Simples Nacional' },
    'outros': { label: 'Outros' },
};
const pastaTypes = Object.keys(pastaConfig);
const monthOrder = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

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
    const sortedYears = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
    const result = {};
    for (const year of sortedYears) {
        const yearData = grouped[year];
        const sortedMonthKeys = Object.keys(yearData).sort((a, b) => yearData[a].monthSortKey - yearData[b].monthSortKey);
        result[year] = {};
        for (const monthKey of sortedMonthKeys) {
            result[year][monthKey] = yearData[monthKey];
        }
    }
    return result;
};

// --- SUB-COMPONENTE ACORDEÃO ESTILIZADO ---
const YearMonthAccordion = ({ files, selectedFiles, toggleFileSelection }) => {
    const [activeYear, setActiveYear] = useState(null);
    const [activeMonthKey, setActiveMonthKey] = useState(null);
    const groupedData = useMemo(() => groupFilesByYearAndMonth(files), [files]);
    const sortedYears = useMemo(() => Object.keys(groupedData), [groupedData]);

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
                                                <a href={`${SERVER_FILE_URL_BASE}${file.caminho_arquivo}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Ver</a>
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
    const [selectedPasta, setSelectedPasta] = useState(null);
    const [empresaNome, setEmpresaNome] = useState('');
    const [empresaCnpj, setEmpresaCnpj] = useState('');
    const [arquivos, setArquivos] = useState({});
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);
    const [isRefreshingPasta, setIsRefreshingPasta] = useState(false);
    const [targetUploadYear, setTargetUploadYear] = useState('');
    const [targetUploadMonth, setTargetUploadMonth] = useState('');

    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = -4; i <= 2; i++) { years.push(currentYear - i); }
        return years.sort((a, b) => b - a);
    }, []);

    // --- LÓGICA DE DADOS E API ---
    const fetchData = useCallback(() => {
        setLoading(true);
        axiosInstance.get(`/api/empresas/${empresaId}/`).then(response => {
            setEmpresaNome(response.data.nome);
            setEmpresaCnpj(response.data.cnpj);
        });
        const promises = pastaTypes.map(tipo => {
            const endpoint = tipo.replace(/_/g, '-');
            return axiosInstance.get(`/api/${endpoint}/`, { params: { empresa_id: empresaId } })
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
            formData.append('cnpj_empresa', empresaCnpj);
            formData.append('nome_empresa', empresaNome);
            formData.append('tipo_documento', pastaTipo.replace(/_/g, '-'));
            
            // Lógica para usar o mês/ano selecionado ou o atual
            if (['xml', 'departamento_pessoal', 'simples_nacional'].includes(pastaTipo)) {
                const anoParaSalvar = targetUploadYear || new Date().getFullYear().toString();
                const mesParaSalvar = targetUploadMonth || (new Date().getMonth() + 1).toString().padStart(2, '0');
                formData.append('mes', mesParaSalvar);
                formData.append('ano', anoParaSalvar);
            }
            if (['departamento_pessoal', 'simples_nacional'].includes(pastaTipo)) {
                formData.append('entregue', false);
            }
            const endpoint = pastaTipo.replace(/_/g, '-');
            return axiosInstance.post(`/api/${endpoint}/`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        });
        Promise.all(uploadPromises)
            .then(() => { fetchData(); })
            .catch(err => { setError(err.response?.data?.detail || err.message || 'Erro no upload.'); })
            .finally(() => setUploading(false));
    }, [empresaNome, empresaCnpj, targetUploadYear, targetUploadMonth, fetchData]);
    
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

    const handleRefreshSelectedPasta = async () => {
        if (!selectedPasta) return;
        setIsRefreshingPasta(true);
        setError(null);
        try {
            const response = await axiosInstance.post(`/api/sincronizar-pasta/`, { empresa_id: empresaId, tipo_pasta: selectedPasta.tipo });
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
        setLoading(true);
        axiosInstance.post(`/api/enviar-email/`, { empresa_id: empresaId, tipo_pasta: selectedPasta.tipo, file_ids: selectedFiles })
            .then(res => { alert(res.data.message); setSelectedFiles([]); })
            .catch(err => alert(`Erro: ${err.response?.data?.error || 'Falha ao enviar email.'}`))
            .finally(() => setLoading(false));
    };
    
    const handleWhatsAppClick = () => {
        if (selectedFiles.length === 0) { alert('Selecione ao menos um arquivo.'); return; }
        setLoading(true);
        axiosInstance.post(`/api/enviar-documentos-whatsapp/`, { empresa_id: empresaId, file_ids: selectedFiles, tipo_pasta: selectedPasta.tipo })
            .then(res => {
                let message = `Relatório de Envio:\n${res.data.message || ''}`;
                if (res.data.successful_sends?.length > 0) message += `\nSucessos: ${res.data.successful_sends.map(s => s.filename).join(', ')}`;
                if (res.data.failed_sends?.length > 0) message += `\nFalhas: ${res.data.failed_sends.map(f => f.filename).join(', ')}`;
                alert(message);
                setSelectedFiles([]);
            })
            .catch(err => alert(`Erro: ${err.response?.data?.error || 'Falha ao enviar por WhatsApp.'}`))
            .finally(() => setLoading(false));
    };

    // --- RENDERIZAÇÃO DO COMPONENTE ---
    return (
        <div className="p-6 md:p-8">
            <div className="mb-8">
                {loading && !empresaNome ? (
                    <div className="space-y-2"><div className="h-9 w-3/4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div><div className="h-6 w-1/2 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse"></div></div>
                ) : (
                    <>
                        <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300">{empresaNome}</h1>
                        <p className="text-md text-gray-500 dark:text-gray-400">Gerenciador de Arquivos - CNPJ: {empresaCnpj}</p>
                    </>
                )}
            </div>

            <div className="mb-8"><h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">Pastas</h2><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {pastas.map(pasta => (
                    <motion.button key={pasta.id} onClick={() => handlePastaClick(pasta)} whileHover={{ y: -5 }} className={`p-4 rounded-xl text-left transition-all duration-200 border-2 ${selectedPasta?.id === pasta.id ? 'bg-indigo-50 dark:bg-indigo-900/50 border-indigo-500 shadow-lg' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md'}`}>
                        <FolderIcon className={`h-8 w-8 mb-2 ${selectedPasta?.id === pasta.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`} />
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{pasta.tipo.replace(/_/g, ' ')}</span>
                    </motion.button>
                ))}
            </div></div>

            <AnimatePresence mode="wait">
                {selectedPasta && (
                <motion.div key={selectedPasta.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 mt-8">
                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="text-xl font-semibold text-gray-800 dark:text-indigo-300 capitalize">{selectedPasta.tipo.replace(/_/g, ' ')}</h3>
                            <button onClick={handleRefreshSelectedPasta} disabled={isRefreshingPasta} className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors" title="Sincronizar Pasta">
                                {isRefreshingPasta ? <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <ArrowPathIcon className="h-5 w-5" />}
                            </button>
                        </div>
                        
                        <div className="p-4 sm:p-6">
                            {(['xml', 'departamento_pessoal', 'simples_nacional'].includes(selectedPasta.tipo)) && (
                                <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Período para Upload (Opcional)</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <select value={targetUploadMonth} onChange={(e) => setTargetUploadMonth(e.target.value)} className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500">
                                            <option value="">Mês Atual</option>
                                            {monthOrder.map((month, index) => <option key={index} value={(index + 1).toString().padStart(2, '0')}>{month.charAt(0).toUpperCase() + month.slice(1)}</option>)}
                                        </select>
                                        <select value={targetUploadYear} onChange={(e) => setTargetUploadYear(e.target.value)} className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500">
                                            <option value="">Ano Atual</option>
                                            {[...Array(5)].map((_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${isDragActive ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40' : 'border-gray-300 dark:border-gray-600 hover:border-indigo-400 dark:hover:border-indigo-500'}`}>
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
                                <button onClick={handleEmailClick} disabled={loading || uploading} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"><EnvelopeIcon className="h-4 w-4"/> Enviar Email</button>
                                <button onClick={handleWhatsAppClick} disabled={loading || uploading || selectedPasta.tipo === 'xml'} className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"><ChatBubbleBottomCenterTextIcon className="h-4 w-4"/> Enviar WhatsApp</button>
                            </div>
                        )}

                        <div className="p-2 sm:p-4">
                            {loading ? <p className="text-center py-10 text-gray-500 dark:text-gray-400">Carregando...</p> : 
                            <>
                                {(!arquivos[selectedPasta.tipo] || arquivos[selectedPasta.tipo].length === 0) ? 
                                    <p className="text-center py-10 text-gray-500 dark:text-gray-400">Nenhum arquivo nesta pasta.</p> :
                                    (selectedPasta.tipo === 'xml' || selectedPasta.tipo === 'departamento_pessoal' || selectedPasta.tipo === 'simples_nacional') ? (
                                        <YearMonthAccordion files={arquivos[selectedPasta.tipo]} selectedFiles={selectedFiles} toggleFileSelection={toggleFileSelection} />
                                    ) : (
                                        <ul className="space-y-1">{(arquivos[selectedPasta.tipo]).map(file => (
                                            <li key={file.id} className="flex items-center space-x-3 p-3 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-md">
                                                <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => toggleFileSelection(file.id)} className="form-checkbox h-4 w-4 rounded bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-indigo-600 focus:ring-indigo-500" />
                                                <DocumentTextIcon className="h-6 w-6 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                <span className="flex-grow truncate" title={file.nome_arquivo}>{file.nome_arquivo}</span>
                                                {file.hasOwnProperty('entregue') && (<span className={`text-xs px-2 py-0.5 font-semibold rounded-full ${file.entregue ? 'bg-green-100 text-green-800 dark:bg-green-800/60 dark:text-green-200' : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800/60 dark:text-yellow-200'}`}>{file.entregue ? 'Entregue' : 'Pendente'}</span>)}
                                                <a href={`${SERVER_FILE_URL_BASE}${file.caminho_arquivo}`} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Ver</a>
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
        </div>
    );
};

export default PastaManager;