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
        <div className="p-6 md:p-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8">Histórico de Envios por WhatsApp</h1>

            {/* --- Controles de Filtro Modernizados com Barra de Pesquisa --- */}
            <div className="mb-8 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-4">
                <FunnelIcon className="h-5 w-5 text-gray-500 dark:text-indigo-400" />
                <div className="flex items-center gap-2 border-r border-gray-200 dark:border-gray-600 pr-4">
                    <button onClick={() => { setFilter({ year: '', month: '', status: '' }); setActiveQuickFilter('all'); }} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeQuickFilter === 'all' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>Todos</button>
                    <button onClick={() => { setFilter({ status: 'sucesso' }); setActiveQuickFilter('sucesso'); }} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeQuickFilter === 'sucesso' ? 'bg-green-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>Sucesso</button>
                    <button onClick={() => { setFilter({ status: 'falha' }); setActiveQuickFilter('falha'); }} className={`px-3 py-1.5 text-sm rounded-md transition-colors ${activeQuickFilter === 'falha' ? 'bg-red-600 text-white shadow' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>Falha</button>
                </div>
                <div className="flex items-center gap-2">
                    <select 
                        id="month-filter-select"
                        defaultValue=""
                        onChange={(e) => handleFilterChange('monthYear', e.target.value)}
                        className="py-2 pl-3 pr-8 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
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
                        className="py-2 pl-3 pr-8 text-sm bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                    />
                </div>
                {(filter.year || filter.month || filter.status || searchTerm) && (
                    <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 ml-auto">Limpar Filtros</button>
                )}
            </div>

            {loading && <div className="text-center text-gray-500 dark:text-gray-400">Carregando histórico...</div>}
            {error && <div className="text-center text-red-500">{error}</div>}

            {!loading && !error && (
                <div className="relative">
                    <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-200 dark:bg-gray-700 hidden sm:block" aria-hidden="true"></div>
                    <div className="space-y-8">
                        {filteredHistorico.length === 0 ? (
                            <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
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
                                                <CheckCircleIcon className="h-6 w-6 text-green-500" />
                                            ) : (
                                                <XCircleIcon className="h-6 w-6 text-red-500" />
                                            )}
                                        </span>
                                    </div>
                                    <div className="ml-4 w-full p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700">
                                        <div className="flex justify-between items-start mb-2 gap-2">
                                            <p className="font-semibold text-base text-gray-900 dark:text-white break-words">{item.arquivo}</p>
                                            <span className={`flex-shrink-0 px-2 py-1 text-xs font-semibold rounded-full ${item.status?.trim().toLowerCase() === 'sucesso' ? 'bg-green-100 text-green-800 dark:bg-green-800/50 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-800/50 dark:text-red-300'}`}>
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
                                                <button onClick={() => copyToClipboard(item.message_id, item.id)} title="Copiar ID da Mensagem" className="text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200">
                                                    {copiedId === item.id ? <ClipboardDocumentCheckIcon className="h-4 w-4 text-green-500" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                                                </button>
                                            </div>
                                        )}
                                        {item.empresa === null && (
                                            <p className="text-xs text-yellow-500 mt-1">Aviso: Empresa não associada. Contate o administrador.</p>
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