import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';

const ConsultarDeclaracoesPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [anoCalendario, setAnoCalendario] = useState('');
  const [declaracoes, setDeclaracoes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    const fetchEmpresas = async () => {
      setLoading(true);
      try {
        const response = await axiosInstance.get('/api/empresas/');
        setEmpresas(response.data);
      } catch (err) {
        setError('Erro ao carregar empresas: ' + (err.response?.data?.error || err.message));
      } finally {
        setLoading(false);
      }
    };
    fetchEmpresas();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    setDeclaracoes([]);

    try {
      const response = await axiosInstance.post('/api/consultar-declaracoes/', {
        empresa_id: empresaId,
        ano_calendario: anoCalendario
      });
      setDeclaracoes(response.data.declaracoes || []);
      setSuccess(response.data.message);
    } catch (err) {
      setError('Erro ao consultar declarações: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-6">
        <h1 className="text-2xl font-bold text-indigo-900 mb-6">Consultar Declarações</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-100 text-green-700 rounded-md">
            {success}
          </div>
        )}
        {loading && (
          <div className="mb-4 p-4 bg-indigo-100 text-indigo-700 rounded-md">
            Carregando...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Empresa
            </label>
            <select
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              required
            >
              <option value="" disabled>Selecione uma empresa</option>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ano-Calendário
            </label>
            <input
              type="text"
              value={anoCalendario}
              onChange={(e) => setAnoCalendario(e.target.value)}
              placeholder="YYYY"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2 px-4 rounded-md text-white font-medium transition-colors duration-200 ${
              loading
                ? 'bg-indigo-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {loading ? 'Consultando...' : 'Consultar Declarações'}
          </button>
        </form>

        {declaracoes.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-indigo-900 mb-4">Declarações Encontradas</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-indigo-50">
                    <th className="p-2 text-left text-sm font-medium text-gray-700">Período de Apuração</th>
                    <th className="p-2 text-left text-sm font-medium text-gray-700">Número da Declaração</th>
                    <th className="p-2 text-left text-sm font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {declaracoes.map((declaracao, index) => (
                    <tr key={index} className="border-b border-gray-200">
                      <td className="p-2 text-sm text-gray-600">{declaracao.periodo_apuracao}</td>
                      <td className="p-2 text-sm text-gray-600">{declaracao.numero_declaracao}</td>
                      <td className="p-2 text-sm text-gray-600">{declaracao.status || 'Consultado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsultarDeclaracoesPage;

