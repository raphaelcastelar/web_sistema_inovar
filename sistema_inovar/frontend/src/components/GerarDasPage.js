import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { 
    DocumentArrowDownIcon, 
    CalendarDaysIcon, 
    UsersIcon,
    InformationCircleIcon,
    CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const GerarDasPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
    const [selectedMonth, setSelectedMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const yearOptions = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const years = [];
        for (let i = -4; i <= 2; i++) {
            years.push(currentYear - i);
        }
        return years.sort((a, b) => b - a);
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
        axiosInstance.get('/api/empresas/?all=true')
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
        setSuccessMessage('');

        const periodoApuracao = `${selectedYear}${selectedMonth}`;
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresaId));
        if (!empresaSelecionada) {
            setError("Erro: Empresa selecionada não encontrada.");
            setLoading(false);
            return;
        }
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, '');

        try {
            const response = await axiosInstance.post('/api/serpro/gerar-das/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            }, {
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            const contentDisposition = response.headers['content-disposition'];
            let filename = `DAS_${cnpjLimpo}_${periodoApuracao}.pdf`;
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
            
            setSuccessMessage(`Guia DAS para ${empresaSelecionada.nome} (${selectedMonth}/${selectedYear}) baixada com sucesso!`);

        } catch (err) {
            console.error("Erro ao gerar DAS:", err);
            if (err.response?.data?.type === 'application/json') {
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
        <div className="p-6 md:p-8 animate-fade-in">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-2">Gerar Guia DAS</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-8">Selecione a empresa e o período para emitir o Documento de Arrecadação do Simples Nacional.</p>
                
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 space-y-6"
                >
                    <div>
                        <label htmlFor="empresa-select" className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <UsersIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400"/>
                            Empresa
                        </label>
                        <select
                            id="empresa-select"
                            value={selectedEmpresaId}
                            onChange={(e) => setSelectedEmpresaId(e.target.value)}
                            className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                        >
                            <option value="">Selecione uma empresa...</option>
                            {empresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nome}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                           <CalendarDaysIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400"/>
                           Período de Apuração
                        </label>
                        <div className="grid grid-cols-2 gap-4">
                            <select
                                id="month-select"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            >
                                {monthOptions.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                            </select>
                            <select
                                id="year-select"
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            >
                                {yearOptions.map(year => (<option key={year} value={year}>{year}</option>))}
                            </select>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleGerarDas}
                            disabled={loading || !selectedEmpresaId || !selectedYear || !selectedMonth}
                            className="w-full flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
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
                                    <DocumentArrowDownIcon className="h-6 w-6"/>
                                    Gerar e Baixar DAS
                                </>
                            )}
                        </button>
                    </div>

                    {error && 
                        <div className="p-3 mt-4 text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg flex items-center gap-3">
                            <InformationCircleIcon className="h-5 w-5 text-red-700 dark:text-red-400"/>
                            <span>{error}</span>
                        </div>
                    }
                    {successMessage &&
                        <div className="p-3 mt-4 text-green-700 dark:text-green-200 bg-green-100 dark:bg-green-800/50 border border-green-300 dark:border-green-600 rounded-lg flex items-center gap-3">
                            <CheckCircleIcon className="h-5 w-5 text-green-700 dark:text-green-200"/>
                            <span>{successMessage}</span>
                        </div>
                    }
                </motion.div>
            </div>
        </div>
    );
};

export default GerarDasPage;