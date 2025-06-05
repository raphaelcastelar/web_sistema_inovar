// src/pages/HistoricoWhatsApp.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { CheckCircleIcon, XCircleIcon, ClipboardDocumentIcon, ClipboardDocumentCheckIcon } from '@heroicons/react/24/solid';

const API_BASE_URL = 'http://192.168.196.162:8000/api';

const HistoricoWhatsApp = () => {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    useEffect(() => {
        setLoading(true);
        axios.get(`${API_BASE_URL}/historico-envios/`)
            .then(response => {
                setHistorico(response.data);
                setError(null);
            })
            .catch(err => {
                console.error("Erro ao buscar histórico:", err);
                setError("Não foi possível carregar o histórico de envios.");
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000); // Reseta o ícone após 2 segundos
        }, (err) => {
            console.error('Erro ao copiar: ', err);
            alert("Falha ao copiar o ID.");
        });
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-400">Carregando histórico...</div>;
    }

    if (error) {
        return <div className="p-8 text-center text-red-500">{error}</div>;
    }

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-indigo-400 mb-8">Histórico de Envios (WhatsApp)</h1>
            
            <div className="relative">
                {/* Linha da timeline */}
                <div className="absolute left-9 top-0 h-full w-0.5 bg-gray-700" aria-hidden="true"></div>

                {/* Itens da timeline */}
                <div className="space-y-8">
                    {historico.length === 0 ? (
                        <p className="text-gray-500">Nenhum registro de envio encontrado.</p>
                    ) : (
                        historico.map(item => (
                            <div key={item.id} className="relative flex items-start">
                                {/* Ícone e Ponto na Linha */}
                                <div className="flex items-center justify-center h-18">
                                    <div className="z-10 flex items-center justify-center w-18 h-18 rounded-full">
                                        {item.status === 'sucesso' ? (
                                            <CheckCircleIcon className="h-8 w-8 text-green-500 bg-gray-900 rounded-full" />
                                        ) : (
                                            <XCircleIcon className="h-8 w-8 text-red-500 bg-gray-900 rounded-full" />
                                        )}
                                    </div>
                                </div>
                                
                                {/* Card com os Detalhes */}
                                <div className="ml-8 w-full p-4 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="font-semibold text-lg text-white">{item.arquivo}</p>
                                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${item.status === 'sucesso' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
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
        </div>
    );
};

export default HistoricoWhatsApp;