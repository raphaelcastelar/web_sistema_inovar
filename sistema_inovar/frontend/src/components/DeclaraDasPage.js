import React, { useState, useEffect } from 'react';
import axiosInstance from '../utils/axiosInstance';

const DeclararDASPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [empresaId, setEmpresaId] = useState('');
  const [periodoApuracao, setPeriodoApuracao] = useState('');
  const [dadosDeclaracao, setDadosDeclaracao] = useState({
    cnpjCompleto: '',
    pa: 0,
    indicadorTransmissao: true,
    indicadorComparacao: true,
    declaracao: {
      tipoDeclaracao: 1,
      receitaPaCompetenciaInterno: 0,
      receitaPaCompetenciaExterno: 0,
      receitaPaCaixaInterno: null,
      receitaPaCaixaExterno: null,
      valorFixoIcms: 0,
      valorFixoIss: null,
      receitasBrutasAnteriores: Array(12).fill().map((_, i) => ({
        pa: 202001 + i,
        valorInterno: 0,
        valorExterno: 0
      })),
      folhasSalario: Array(12).fill().map((_, i) => ({
        pa: 202001 + i,
        valor: 0
      })),
      naoOptante: null,
      estabelecimentos: []
    },
    valoresParaComparacao: []
  });
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

    try {
      // Atualizar cnpjCompleto e pa com base nos inputs
      const payload = {
        empresa_id: empresaId,
        periodo_apuracao,
        dados_declaracao: {
          ...dadosDeclaracao,
          cnpjCompleto: empresas.find(e => e.id === parseInt(empresaId))?.cnpj || '',
          pa: parseInt(periodo_apuracao.replace(/\D/g, ''))  // Converte "YYYY-MM" ou "YYYYMM" para inteiro
        }
      };
      const response = await axiosInstance.post('/api/declarar-das/', payload);
      setSuccess(response.data.message);
    } catch (err) {
      setError('Erro ao declarar DAS: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Declarar DAS</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}
      {loading && <p>Carregando...</p>}
      <form onSubmit={handleSubmit}>
        <div>
          <label>Empresa:</label>
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)} required>
            <option value="" disabled>Selecione uma empresa</option>
            {empresas.map(empresa => (
              <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Período de Apuração (YYYY-MM):</label>
          <input
            type="text"
            value={periodoApuracao}
            onChange={(e) => setPeriodoApuracao(e.target.value)}
            placeholder="YYYY-MM"
            required
          />
        </div>
        <div>
          <label>Receita Competência Interno:</label>
          <input
            type="number"
            value={dadosDeclaracao.declaracao.receitaPaCompetenciaInterno}
            onChange={(e) => setDadosDeclaracao({
              ...dadosDeclaracao,
              declaracao: {
                ...dadosDeclaracao.declaracao,
                receitaPaCompetenciaInterno: parseFloat(e.target.value) || 0
              }
            })}
          />
        </div>
        {/* Adicione mais campos conforme necessário para preencher dados_declaracao */}
        <button type="submit" disabled={loading}>Declarar DAS</button>
      </form>
    </div>
  );
};

export default DeclararDASPage;