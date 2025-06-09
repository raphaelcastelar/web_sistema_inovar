import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance'; // Use a instância customizada!
import { DocumentArrowDownIcon, CalendarDaysIcon, UsersIcon } from '@heroicons/react/24/outline'; // Adicionando ícones para UI

const GerarDasPage = () => {
    const [empresas, setEmpresas] = useState([]);
    // --- INÍCIO: Estados modificados para seletores separados ---
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    // --- FIM: Estados modificados ---
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Gera a lista de anos para o dropdown (ex: 2 anos futuros, ano atual, 4 anos passados)
    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = -2; i <= 4; i++) {
            years.push(currentYear - i);
        }
        return years;
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
        // Carrega a lista de empresas para o dropdown
        axiosInstance.get('/api/empresas/')
            .then(response => {
                setEmpresas(response.data);
            })
            .catch(err => {
                console.error("Erro ao buscar empresas:", err);
                setError("Não foi possível carregar a lista de empresas.");
            });
    }, []);

    const handleGerarDas = async () => {
        if (!selectedEmpresaId || !selectedYear || !selectedMonth) {
            setError("Por favor, selecione uma empresa, um ano e um mês.");
            return;
        }

        setLoading(true);
        setError('');

        // Monta o período no formato YYYYMM
        const periodoApuracao = `${selectedYear}${selectedMonth}`; 
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');

        try {
            const response = await axiosInstance.post('/api/serpro/gerar-das/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            }, {
                responseType: 'blob', // Espera uma resposta binária (arquivo)
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const contentDisposition = response.headers['content-disposition'];
            let filename = `DAS_${cnpjLimpo}_${periodoApuracao}.pdf`; // Nome padrão
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch && filenameMatch.length === 2)
                  filename = filenameMatch[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url); // Libera a memória

        } catch (err) {
            console.error("Erro ao gerar DAS:", err);
            if (err.response && err.response.data && err.response.data.type === 'application/json') {
                const errorJsonText = await err.response.data.text();
                const errorObj = JSON.parse(errorJsonText);
                setError(errorObj.error || "Ocorreu um erro ao gerar o DAS.");
            } else {
                setError("Ocorreu um erro inesperado ou de comunicação com o servidor ao gerar o DAS.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <h1 className="text-3xl font-bold text-indigo-400 mb-8">Gerar Guia DAS (Simples Nacional)</h1>

            <div className="max-w-xl mx-auto bg-gray-800 p-8 rounded-xl shadow-lg space-y-6">
                <div>
                    <label htmlFor="empresa-select" className="flex items-center text-sm font-medium text-gray-300 mb-1">
                        <UsersIcon className="h-5 w-5 mr-2 text-indigo-400"/>
                        Empresa
                    </label>
                    <select
                        id="empresa-select"
                        value={selectedEmpresaId}
                        onChange={(e) => setSelectedEmpresaId(e.target.value)}
                        className="w-full p-3 bg-gray-700 text-white rounded-md mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        <option value="">Selecione uma empresa...</option>
                        {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="flex items-center text-sm font-medium text-gray-300 mb-1">
                       <CalendarDaysIcon className="h-5 w-5 mr-2 text-indigo-400"/>
                       Período de Apuração
                    </label>
                    <div className="flex items-center gap-4 mt-1">
                        <select
                            id="month-select"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full p-3 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {monthOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <select
                            id="year-select"
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(e.target.value)}
                            className="w-full p-3 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            {yearOptions.map(year => (
                                <option key={year} value={year}>{year}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <p className="text-red-500 text-sm bg-red-900/20 p-3 rounded-md">{error}</p>}

                <div className="pt-4">
                    <button
                        onClick={handleGerarDas}
                        disabled={loading || !selectedEmpresaId || !selectedYear || !selectedMonth}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                        {loading ? (
                            <>
                               <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                               </svg>
                               Gerando...
                            </>
                        ) : (
                            <>
                                <DocumentArrowDownIcon className="h-5 w-5 mr-1"/>
                                Gerar DAS
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GerarDasPage;