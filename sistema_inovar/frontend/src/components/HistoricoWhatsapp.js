import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { CheckCircleIcon, XCircleIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon, FunnelIcon } from '@heroicons/react/24/solid';

const API_BASE_URL = 'http://192.168.196.162:8000/api';

// Função para gerar os últimos 12 meses para o dropdown de filtro
const generateMonthOptions = () => {
    const options = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
        d.setDate(1); // Evita problemas com meses de durações diferentes
        const year = d.getFullYear();
        const month = d.getMonth() + 1; // 1-12
        const monthName = d.toLocaleString('pt-BR', { month: 'long' });
        
        options.push({
            value: `${year}-${month}`, // ex: "2025-6"
            label: `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`
        });
        d.setMonth(d.getMonth() - 1);
    }
    return options;
};


const HistoricoWhatsApp = () => {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    
    // Estado para controlar os filtros
    const [filter, setFilter] = useState({ year: '', month: '' });
    const [activeQuickFilter, setActiveQuickFilter] = useState(''); // 'hoje', 'este_mes'

    // Gera as opções do dropdown uma vez
    const monthOptions = useMemo(() => generateMonthOptions(), []);

    useEffect(() => {
        setLoading(true);
        setError(null);

        // Constrói os parâmetros da query a partir do estado de filtro
        const params = {};
        if (filter.year) params.year = filter.year;
        if (filter.month) params.month = filter.month;

        const queryParams = new URLSearchParams(params).toString();
        const url = `${API_BASE_URL}/historico-envios/?${queryParams}`;

        axiosInstance.get(url)
            .then(response => {
                setHistorico(response.data);
            })
            .catch(err => {
                console.error("Erro ao buscar histórico:", err);
                setError("Não foi possível carregar o histórico de envios.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, [filter]); // Re-executa o fetch sempre que o estado 'filter' mudar

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }, (err) => {
            console.error('Erro ao copiar: ', err);
            alert("Falha ao copiar o ID.");
        });
    };
    
    const applyQuickFilter = (type) => {
        const today = new Date();
        setActiveQuickFilter(type);

        if (type === 'hoje') {
            // Se o backend suportasse ?date=YYYY-MM-DD seria mais preciso.
            // Por agora, filtramos pelo dia de hoje usando o mês e ano atuais.
            setFilter({
                year: today.getFullYear().toString(),
                month: (today.getMonth() + 1).toString(),
            });
        } else if (type === 'este_mes') {
            setFilter({
                year: today.getFullYear().toString(),
                month: (today.getMonth() + 1).toString(),
            });
        }
    };
    
    const handleMonthSelectChange = (e) => {
        setActiveQuickFilter(''); // Desmarca filtros rápidos
        const value = e.target.value;
        if (!value) {
            clearFilters();
            return;
        }
        const [year, month] = value.split('-');
        setFilter({ year, month });
    };

    const clearFilters = () => {
        setFilter({ year: '', month: '' });
        setActiveQuickFilter('');
        // Para o select voltar para a opção "Todos os Períodos"
        document.getElementById('month-filter-select').value = '';
    };

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-indigo-400 mb-4">Histórico de Envios (WhatsApp)</h1>

            {/* --- INÍCIO: Controles de Filtro --- */}
            <div className="mb-8 p-4 bg-gray-800 rounded-lg shadow-lg flex flex-wrap items-center gap-4">
                <FunnelIcon className="h-6 w-6 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-gray-200 mr-4">Filtrar por:</span>
                
                <div className="flex items-center gap-2">
                    <button onClick={() => applyQuickFilter('hoje')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeQuickFilter === 'hoje' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Hoje</button>
                    <button onClick={() => applyQuickFilter('este_mes')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeQuickFilter === 'este_mes' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>Este Mês</button>
                </div>

                <div className="flex items-center gap-2">
                    <label htmlFor="month-filter-select" className="text-sm text-gray-400">Mês Específico:</label>
                    <select 
                        id="month-filter-select"
                        onChange={handleMonthSelectChange}
                        className="py-2 pl-3 pr-8 text-sm border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                    >
                        <option value="">Todos os Períodos</option>
                        {monthOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
                
                {(filter.year || filter.month) && (
                    <button onClick={clearFilters} className="px-4 py-2 text-sm text-red-400 hover:text-white hover:bg-red-600 rounded-md border border-red-500 transition-colors">Limpar Filtro</button>
                )}
            </div>
            {/* --- FIM: Controles de Filtro --- */}

            {loading && <div className="text-center text-gray-400">Carregando histórico...</div>}
            {error && <div className="text-center text-red-500">{error}</div>}

            {!loading && !error && (
                <div className="relative">
                    {/* Linha da timeline */}
                    <div className="absolute left-4 top-0 h-full w-0.5 bg-gray-700 hidden sm:block" aria-hidden="true"></div>

                    {/* Itens da timeline */}
                    <div className="space-y-8">
                        {historico.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-gray-500 text-lg">Nenhum registro de envio encontrado para o período selecionado.</p>
                            </div>
                        ) : (
                            historico.map(item => (
                                <div key={item.id} className="relative flex items-start">
                                    <div className="flex-shrink-0 flex items-center justify-center h-18 w-18">
                                        <div className="z-10 flex items-center justify-center rounded-full">
                                            {item.status && item.status.trim().toLowerCase() === 'sucesso' ? (
                                                <CheckCircleIcon className="h-8 w-8 text-green-500 bg-gray-900 rounded-full" />
                                            ) : (
                                                <XCircleIcon className="h-8 w-8 text-red-500 bg-gray-900 rounded-full" />
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="ml-4 w-full p-4 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
                                        <div className="flex justify-between items-center mb-2">
                                            <p className="font-semibold text-lg text-white break-words">{item.arquivo}</p>
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.status && item.status.trim().toLowerCase() === 'sucesso' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                                                {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Indefinido'}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-400">
                                            Enviado para: <span className="font-medium text-gray-300">{item.remetente}</span>
                                        </p>
                                        <p className="text-sm text-gray-400">
                                            Data: <span className="font-medium text-gray-300">{new Date(item.data_hora).toLocaleString('pt-BR')}</span>
                                        </p>
                                        {item.message_id && (
                                            <div className="mt-2 flex items-center text-xs text-gray-500">
                                                <p className="truncate mr-2">
                                                    Message ID: <span className="text-gray-400">{item.message_id}</span>
                                                </p>
                                                <button onClick={() => copyToClipboard(item.message_id, item.id)} title="Copiar ID da Mensagem" className="text-indigo-400 hover:text-indigo-200">
                                                    {copiedId === item.id ? (
                                                        <ClipboardDocumentCheckIcon className="h-4 w-4 text-green-400" />
                                                    ) : (
                                                        <ClipboardDocumentIcon className="h-4 w-4" />
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HistoricoWhatsApp;