import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { 
    CheckCircleIcon, 
    XCircleIcon, 
    ClipboardDocumentIcon, 
    ClipboardDocumentCheckIcon, 
    FunnelIcon,
    InformationCircleIcon 
} from '@heroicons/react/24/solid';
import { motion } from 'framer-motion';

// Função para gerar os últimos 12 meses para o dropdown de filtro
const generateMonthOptions = () => {
    const options = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
        d.setDate(1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const monthName = d.toLocaleString('pt-BR', { month: 'long' });
        
        options.push({
            value: `${year}-${month}`,
            label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`
        });
        d.setMonth(d.getMonth() - 1);
    }
    return options;
};

const HistoricoWhatsApp = ({ companyName: companyNameProp = null }) => {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState(''); // Novo estado para termo de pesquisa
    
    // Estado para filtros
    const [filter, setFilter] = useState({ year: '', month: '', status: '' });
    const [activeQuickFilter, setActiveQuickFilter] = useState('all');

    const monthOptions = useMemo(() => generateMonthOptions(), []);

    useEffect(() => {
        setLoading(true);
        setError(null);

        const params = {};
        if (filter.year) params.year = filter.year;
        if (filter.month) params.month = filter.month;
        if (filter.status) params.status = filter.status;

        const queryParams = new URLSearchParams(params).toString();
        
        axiosInstance.get(`/api/historico-envios/?${queryParams}`)
            .then(response => {
                console.log('Resposta da API:', response.data); // Log da resposta completa
                setHistorico(response.data);
            })
            .catch(err => {
                console.error("Erro ao buscar histórico:", err);
                setError("Não foi possível carregar o histórico de envios.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [filter]);

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }, () => {
            alert("Falha ao copiar o ID.");
        });
    };
    
    const handleFilterChange = (type, value) => {
        setActiveQuickFilter(''); // Limpa o filtro rápido ao usar um seletor
        if(type === 'monthYear'){
            if(!value){
                setFilter(prev => ({ ...prev, year: '', month: '' }));
            } else {
                const [year, month] = value.split('-');
                setFilter(prev => ({ ...prev, year, month }));
            }
        } else {
             setFilter(prev => ({ ...prev, [type]: value }));
        }
    };
    
    const clearFilters = () => {
        setFilter({ year: '', month: '', status: '' });
        setActiveQuickFilter('all');
        setSearchTerm(''); // Limpa o termo de pesquisa ao limpar filtros
    };
    
    // Filtra o histórico com base no termo de pesquisa
    const filteredHistorico = useMemo(() => {
        return historico.filter(item =>
            (item.nome_empresa || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [historico, searchTerm]);

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Comunicação</p>
                <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Histórico de Envios por WhatsApp</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    Consulte os envios realizados, status e identificadores das mensagens.
                </p>
            </div>

            {/* --- Controles de Filtro Modernizados com Barra de Pesquisa --- */}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <FunnelIcon className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                <div className="flex items-center gap-2 border-r border-gray-200 pr-4 dark:border-gray-800">
                    <button onClick={() => { setFilter({ year: '', month: '', status: '' }); setActiveQuickFilter('all'); }} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${activeQuickFilter === 'all' ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-gray-700 hover:bg-white dark:bg-slate-950 dark:text-gray-200 dark:hover:bg-gray-800'}`}>Todos</button>
                    <button onClick={() => { setFilter({ status: 'sucesso' }); setActiveQuickFilter('sucesso'); }} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${activeQuickFilter === 'sucesso' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-gray-700 hover:bg-white dark:bg-slate-950 dark:text-gray-200 dark:hover:bg-gray-800'}`}>Sucesso</button>
                    <button onClick={() => { setFilter({ status: 'falha' }); setActiveQuickFilter('falha'); }} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${activeQuickFilter === 'falha' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-gray-700 hover:bg-white dark:bg-slate-950 dark:text-gray-200 dark:hover:bg-gray-800'}`}>Falha</button>
                </div>
                <div className="flex items-center gap-2">
                    <select 
                        id="month-filter-select"
                        defaultValue=""
                        onChange={(e) => handleFilterChange('monthYear', e.target.value)}
                        className="rounded-md border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-slate-500/20"
                    >
                        <option value="">Filtrar por Mês...</option>
                        {monthOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Pesquisar por empresa..."
                        className="rounded-md border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-800 transition placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-slate-500/20"
                    />
                </div>
                {(filter.year || filter.month || filter.status || searchTerm) && (
                    <button onClick={clearFilters} className="ml-auto text-xs font-semibold text-gray-500 transition-colors hover:text-slate-900 dark:hover:text-slate-100">Limpar Filtros</button>
                )}
            </div>

            {loading && <div className="text-center text-gray-500 dark:text-gray-400">Carregando histórico...</div>}
            {error && <div className="text-center text-rose-500">{error}</div>}

            {!loading && !error && (
                <div className="relative">
                    <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200 dark:bg-gray-700 hidden sm:block" aria-hidden="true"></div>
                    <div className="space-y-8">
                        {filteredHistorico.length === 0 ? (
                            <div className="rounded-lg border border-gray-200 bg-white px-4 py-16 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <InformationCircleIcon className="mx-auto h-12 w-12 text-gray-400"/>
                                <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Nenhum Registro Encontrado</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Não há envios que correspondam aos filtros selecionados.</p>
                            </div>
                        ) : (
                            filteredHistorico.map((item, index) => (
                                <motion.div 
                                    key={item.id} 
                                    className="relative flex items-start"
                                    variants={itemVariants}
                                    initial="hidden"
                                    animate="visible"
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <div className="flex-shrink-0 flex items-center justify-center h-18 w-18">
                                        <span className="z-10 flex items-center justify-center p-1 rounded-full bg-white dark:bg-gray-800">
                                            {item.status?.trim().toLowerCase() === 'sucesso' ? (
                                                <CheckCircleIcon className="h-6 w-6 text-emerald-500" />
                                            ) : (
                                                <XCircleIcon className="h-6 w-6 text-rose-500" />
                                            )}
                                        </span>
                                    </div>
                                    <div className="ml-4 w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                        <div className="flex justify-between items-start mb-2 gap-2">
                                            <p className="font-semibold text-base text-gray-900 dark:text-white break-words">{item.arquivo}</p>
                                            <span className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${item.status?.trim().toLowerCase() === 'sucesso' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'}`}>
                                                {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Indefinido'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Empresa: <span className="font-medium">{item.nome_empresa || "Desconhecido"}</span>
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Para: <span className="font-medium">{item.remetente}</span>
                                        </p>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            Em: <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(item.data_hora).toLocaleString('pt-BR')}</span>
                                        </p>
                                        {item.message_id && (
                                            <div className="mt-2 flex items-center text-xs text-gray-500">
                                                <p className="truncate mr-2">
                                                    ID: <span className="text-gray-400">{item.message_id}</span>
                                                </p>
                                                <button onClick={() => copyToClipboard(item.message_id, item.id)} title="Copiar ID da Mensagem" className="text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">
                                                    {copiedId === item.id ? <ClipboardDocumentCheckIcon className="h-4 w-4 text-emerald-500" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        )}
                                        {item.empresa === null && (
                                            <p className="mt-1 text-xs text-amber-500">Aviso: Empresa não associada. Contate o administrador.</p>
                                        )}
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoricoWhatsApp;
