// src/pages/GerarDasPage.js
import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance'; // Use a instância customizada!

const GerarDasPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresa, setSelectedEmpresa] = useState('');
    const [periodo, setPeriodo] = useState(''); // Formato YYYY-MM
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
        if (!selectedEmpresa || !periodo) {
            setError("Por favor, selecione uma empresa e um período.");
            return;
        }

        setLoading(true);
        setError('');

        const [year, month] = periodo.split('-');
        const periodoApuracao = `${year}${month}`; // Converte YYYY-MM para YYYYMM
        const empresaSelecionada = empresas.find(e => e.id === parseInt(selectedEmpresa));
        const cnpjLimpo = empresaSelecionada.cnpj.replace(/\D/g, ''); // Limpa o CNPJ

        try {
            const response = await axiosInstance.post('/api/serpro/gerar-das/', {
                cnpj: cnpjLimpo,
                periodo: periodoApuracao,
            }, {
                responseType: 'blob', // IMPORTANTE: espera uma resposta binária (arquivo)
            });

            // Cria um link temporário para iniciar o download do PDF
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            // Pega o nome do arquivo do header da resposta, se disponível
            const contentDisposition = response.headers['content-disposition'];
            let filename = `DAS_${cnpjLimpo}_${periodoApuracao}.pdf`; // Nome padrão
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                if (filenameMatch.length === 2)
                  filename = filenameMatch[1];
            }
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);

        } catch (err) {
            console.error("Erro ao gerar DAS:", err);
            // Se o erro for um JSON, precisamos ler o Blob para ver a mensagem
            if (err.response && err.response.data.type === 'application/json') {
                const errorJson = await err.response.data.text();
                const errorObj = JSON.parse(errorJson);
                setError(errorObj.error || "Ocorreu um erro ao gerar o DAS.");
            } else {
                setError("Ocorreu um erro inesperado ao gerar o DAS.");
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
                    <label htmlFor="empresa-select" className="block text-sm font-medium text-gray-300 mb-1">Empresa</label>
                    <select
                        id="empresa-select"
                        value={selectedEmpresa}
                        onChange={(e) => setSelectedEmpresa(e.target.value)}
                        className="w-full p-3 bg-gray-700 text-white rounded-md"
                    >
                        <option value="">Selecione uma empresa...</option>
                        {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nome}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="periodo-input" className="block text-sm font-medium text-gray-300 mb-1">Período de Apuração</label>
                    <input
                        type="month" // Input de mês/ano
                        id="periodo-input"
                        value={periodo}
                        onChange={(e) => setPeriodo(e.target.value)}
                        className="w-full p-3 bg-gray-700 text-white rounded-md"
                    />
                </div>

                {error && <p className="text-red-500 text-sm">{error}</p>}

                <div className="pt-4">
                    <button
                        onClick={handleGerarDas}
                        disabled={loading || !selectedEmpresa || !periodo}
                        className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Gerando...' : 'Gerar DAS'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GerarDasPage;