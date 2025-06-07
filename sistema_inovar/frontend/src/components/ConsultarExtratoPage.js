// src/pages/ConsultarExtratoPage.js
import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { UsersIcon, CalendarDaysIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const ConsultarExtratoPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [extratoData, setExtratoData] = useState(null); // Para armazenar os dados do extrato

    const yearOptions = useMemo(() => { /* ... mesma lógica de GerarDasPage ... */
        const currentYear = new Date().getFullYear(); const years = [];
        for (let i = -2; i <= 4; i++) { years.push(currentYear - i); } return years;
    }, []);
    const monthOptions = useMemo(() => [
        { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
        { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
        { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
        { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
        { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
        { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' }
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
        setExtratoData(null); // Limpa o resultado anterior

        const periodoApuracao = `${selectedYear}${selectedMonth}`;
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');

        try {
            const response = await axiosInstance.post('/api/serpro/consultar-extrato/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            });
            setExtratoData(response.data);
        } catch (err) {
            console.error("Erro ao consultar extrato:", err);
            const errorDetail = err.response?.data?.error || "Ocorreu um erro ao consultar o extrato.";
            setError(errorDetail);
        } finally {
            setLoading(false);
        }
    };

    // Função para formatar números como moeda
    const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-indigo-400 mb-8">Consultar Extrato do Simples Nacional</h1>

            <div className="max-w-xl mx-auto bg-gray-800 p-8 rounded-xl shadow-lg space-y-6">
                {/* Seus seletores de Empresa, Mês e Ano aqui (idênticos aos de GerarDasPage) */}
                {/* ... */}
                <div className="pt-4">
                    <button
                        onClick={handleConsultarExtrato}
                        disabled={loading || !selectedEmpresaId || !selectedYear || !selectedMonth}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50"
                    >
                        {loading ? 'Consultando...' : <><MagnifyingGlassIcon className="h-5 w-5"/> Consultar Extrato</>}
                    </button>
                </div>
            </div>

            {error && <p className="text-red-500 text-center mt-6">{error}</p>}

            {extratoData && (
                <div className="max-w-4xl mx-auto mt-10 bg-gray-800 p-8 rounded-xl shadow-lg animate-fade-in">
                    <h2 className="text-2xl font-bold text-indigo-400 mb-6 border-b border-gray-700 pb-4">
                        Extrato para {extratoData.pa.substring(4, 6)}/{extratoData.pa.substring(0, 4)}
                    </h2>
                    
                    {extratoData.declaracoes && extratoData.declaracoes.map((dec, index) => (
                        <div key={index}>
                            {dec.das && dec.das.map((das, dasIndex) => (
                                <div key={dasIndex}>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6 text-center">
                                        <div className="bg-gray-700 p-4 rounded-lg">
                                            <p className="text-sm text-gray-400">Número do Documento</p>
                                            <p className="text-xl font-semibold text-white">{das.numeroDocumento}</p>
                                        </div>
                                        <div className="bg-gray-700 p-4 rounded-lg">
                                            <p className="text-sm text-gray-400">Data de Vencimento</p>
                                            <p className="text-xl font-semibold text-white">
                                                {new Date(das.dataVencimento.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                                            </p>
                                        </div>
                                        <div className="bg-green-800 p-4 rounded-lg">
                                            <p className="text-sm text-green-200">Valor Total</p>
                                            <p className="text-xl font-semibold text-white">{formatCurrency(das.valores.total)}</p>
                                        </div>
                                        <div className="bg-gray-700 p-4 rounded-lg">
                                            <p className="text-sm text-gray-400">Situação</p>
                                            <p className="text-xl font-semibold text-white">{das.situacao}</p>
                                        </div>
                                    </div>
                                    
                                    <h3 className="text-xl font-semibold text-indigo-300 mt-8 mb-4">Composição dos Tributos</h3>
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full bg-gray-750 rounded-lg">
                                            <thead>
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tributo</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase">Valor Principal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-700">
                                                {das.composicao.map((comp, compIndex) => (
                                                    <tr key={compIndex} className="hover:bg-gray-700">
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200">{comp.denominacao} ({comp.codigo})</td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-200 text-right">{formatCurrency(comp.valores.principal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ConsultarExtratoPage;