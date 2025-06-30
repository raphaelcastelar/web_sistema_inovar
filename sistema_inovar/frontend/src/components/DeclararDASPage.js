// frontend/src/components/DeclararDASPage.js
import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';

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
      estabelecimentos: [
        {
          cnpjCompleto: '',
          atividades: [
            {
              idAtividade: 1,
              valorAtividade: 0,
              receitasAtividade: [
                {
                  valor: 0,
                  codigoOutroMunicipio: null,
                  outraUf: null,
                  isencoes: [{ codTributo: 1007, valor: 0, identificador: 1 }],
                  reducoes: [{ codTributo: 1007, valor: 0, percentualReducao: 0, identificador: 1 }],
                  qualificacoesTributarias: [],
                  exigibilidadesSuspensas: null
                }
              ]
            }
          ]
        }
      ]
    },
    valoresParaComparacao: [
      { codigoTributo: 1001, valor: 0 },
      { codigoTributo: 1002, valor: 0 },
      { codigoTributo: 1004, valor: 0 },
      { codigoTributo: 1005, valor: 0 },
      { codigoTributo: 1006, valor: 0 },
      { codigoTributo: 1007, valor: 0 },
      { codigoTributo: 1010, valor: 0 }
    ]
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
      const payload = {
        empresa_id: empresaId,
        periodo_apuracao: periodoApuracao,
        dados_declaracao: {
          ...dadosDeclaracao,
          cnpjCompleto: empresas.find(e => e.id === parseInt(empresaId))?.cnpj || '',
          pa: parseInt(periodoApuracao.replace(/\D/g, ''))
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

  // Função auxiliar para formatar período (ex.: 202001 -> Jan/2020)
  const formatPeriodo = (pa) => {
    const ano = String(pa).slice(0, 4);
    const mes = String(pa).slice(4, 6);
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${meses[parseInt(mes) - 1]}/${ano}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-6">
        <h1 className="text-2xl font-bold text-indigo-900 mb-6">Declarar DAS</h1>

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
              onChange={(e) => {
                setEmpresaId(e.target.value);
                const cnpj = empresas.find(e => e.id === parseInt(e.target.value))?.cnpj || '';
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    estabelecimentos: [
                      { ...dadosDeclaracao.declaracao.estabelecimentos[0], cnpjCompleto: cnpj }
                    ]
                  }
                });
              }}
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
              Período de Apuração (YYYY-MM)
            </label>
            <input
              type="text"
              value={periodoApuracao}
              onChange={(e) => setPeriodoApuracao(e.target.value)}
              placeholder="YYYY-MM"
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Receita Competência Interno
            </label>
            <input
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.receitaPaCompetenciaInterno}
              onChange={(e) => setDadosDeclaracao({
                ...dadosDeclaracao,
                declaracao: {
                  ...dadosDeclaracao.declaracao,
                  receitaPaCompetenciaInterno: parseFloat(e.target.value) || 0
                }
              })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Receita Competência Externo
            </label>
            <input
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.receitaPaCompetenciaExterno}
              onChange={(e) => setDadosDeclaracao({
                ...dadosDeclaracao,
                declaracao: {
                  ...dadosDeclaracao.declaracao,
                  receitaPaCompetenciaExterno: parseFloat(e.target.value) || 0
                }
              })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Valor Fixo ICMS
            </label>
            <input
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.valorFixoIcms}
              onChange={(e) => setDadosDeclaracao({
                ...dadosDeclaracao,
                declaracao: {
                  ...dadosDeclaracao.declaracao,
                  valorFixoIcms: parseFloat(e.target.value) || 0
                }
              })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Valor Fixo ISS (Opcional)
            </label>
            <input
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.valorFixoIss || ''}
              onChange={(e) => setDadosDeclaracao({
                ...dadosDeclaracao,
                declaracao: {
                  ...dadosDeclaracao.declaracao,
                  valorFixoIss: e.target.value ? parseFloat(e.target.value) : null
                }
              })}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Receitas Brutas Anteriores (12 Meses)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dadosDeclaracao.declaracao.receitasBrutasAnteriores.map((receita, index) => (
                <div key={index} className="p-4 bg-indigo-50 rounded-md">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-2">{formatPeriodo(receita.pa)}</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Valor Interno</label>
                      <input
                        type="number"
                        step="0.01"
                        value={receita.valorInterno}
                        onChange={(e) => {
                          const newReceitas = [...dadosDeclaracao.declaracao.receitasBrutasAnteriores];
                          newReceitas[index].valorInterno = parseFloat(e.target.value) || 0;
                          setDadosDeclaracao({
                            ...dadosDeclaracao,
                            declaracao: { ...dadosDeclaracao.declaracao, receitasBrutasAnteriores: newReceitas }
                          });
                        }}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600">Valor Externo</label>
                      <input
                        type="number"
                        step="0.01"
                        value={receita.valorExterno}
                        onChange={(e) => {
                          const newReceitas = [...dadosDeclaracao.declaracao.receitasBrutasAnteriores];
                          newReceitas[index].valorExterno = parseFloat(e.target.value) || 0;
                          setDadosDeclaracao({
                            ...dadosDeclaracao,
                            declaracao: { ...dadosDeclaracao.declaracao, receitasBrutasAnteriores: newReceitas }
                          });
                        }}
                        className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Folhas de Salário (12 Meses)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dadosDeclaracao.declaracao.folhasSalario.map((folha, index) => (
                <div key={index} className="p-4 bg-indigo-50 rounded-md">
                  <h3 className="text-sm font-semibold text-indigo-900 mb-2">{formatPeriodo(folha.pa)}</h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-600">Valor</label>
                    <input
                      type="number"
                      step="0.01"
                      value={folha.valor}
                      onChange={(e) => {
                        const newFolhas = [...dadosDeclaracao.declaracao.folhasSalario];
                        newFolhas[index].valor = parseFloat(e.target.value) || 0;
                        setDadosDeclaracao({
                          ...dadosDeclaracao,
                          declaracao: { ...dadosDeclaracao.declaracao, folhasSalario: newFolhas }
                        });
                      }}
                      className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Atividade Principal do Estabelecimento
            </label>
            <div className="p-4 bg-indigo-50 rounded-md">
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600">ID da Atividade</label>
                  <input
                    type="number"
                    value={dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0].idAtividade}
                    onChange={(e) => setDadosDeclaracao({
                      ...dadosDeclaracao,
                      declaracao: {
                        ...dadosDeclaracao.declaracao,
                        estabelecimentos: [{
                          ...dadosDeclaracao.declaracao.estabelecimentos[0],
                          atividades: [{
                            ...dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0],
                            idAtividade: parseInt(e.target.value) || 1
                          }]
                        }]
                      }
                    })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Valor da Atividade</label>
                  <input
                    type="number"
                    step="0.01"
                    value={dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0].valorAtividade}
                    onChange={(e) => setDadosDeclaracao({
                      ...dadosDeclaracao,
                      declaracao: {
                        ...dadosDeclaracao.declaracao,
                        estabelecimentos: [{
                          ...dadosDeclaracao.declaracao.estabelecimentos[0],
                          atividades: [{
                            ...dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0],
                            valorAtividade: parseFloat(e.target.value) || 0
                          }]
                        }]
                      }
                    })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600">Valor da Receita (Atividade)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0].receitasAtividade[0].valor}
                    onChange={(e) => setDadosDeclaracao({
                      ...dadosDeclaracao,
                      declaracao: {
                        ...dadosDeclaracao.declaracao,
                        estabelecimentos: [{
                          ...dadosDeclaracao.declaracao.estabelecimentos[0],
                          atividades: [{
                            ...dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0],
                            receitasAtividade: [{
                              ...dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0].receitasAtividade[0],
                              valor: parseFloat(e.target.value) || 0
                            }]
                          }]
                        }]
                      }
                    })}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
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
            {loading ? 'Enviando...' : 'Declarar DAS'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default DeclararDASPage;