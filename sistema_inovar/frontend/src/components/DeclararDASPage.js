import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
  UsersIcon,
  CalendarDaysIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

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
      receitasBrutasAnteriores: Array(12)
        .fill()
        .map((_, i) => ({
          pa: 202001 + i,
          valorInterno: 0,
          valorExterno: 0,
        })),
      folhasSalario: Array(12)
        .fill()
        .map((_, i) => ({
          pa: 202001 + i,
          valor: 0,
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
                  reducoes: [
                    { codTributo: 1007, valor: 0, percentualReducao: 0, identificador: 1 },
                  ],
                  qualificacoesTributarias: [],
                  exigibilidadesSuspensas: null,
                },
              ],
            },
          ],
        },
      ],
    },
    valoresParaComparacao: [
      { codigoTributo: 1001, valor: 0 },
      { codigoTributo: 1002, valor: 0 },
      { codigoTributo: 1004, valor: 0 },
      { codigoTributo: 1005, valor: 0 },
      { codigoTributo: 1006, valor: 0 },
      { codigoTributo: 1007, valor: 0 },
      { codigoTributo: 1010, valor: 0 },
    ],
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
          cnpjCompleto: empresas.find((e) => e.id === parseInt(empresaId))?.cnpj || '',
          pa: parseInt(periodoApuracao.replace(/\D/g, '')),
        },
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
    const meses = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ];
    return `${meses[parseInt(mes) - 1]}/${ano}`;
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-gray-100 dark:bg-gray-900 animate-fade-in">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-6"
      >
        <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-2">
          Declarar DAS
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Preencha os dados para declarar o Documento de Arrecadação do Simples Nacional.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-3">
            <InformationCircleIcon className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-800/50 border border-green-300 dark:border-green-600 text-green-700 dark:text-green-200 rounded-lg">
            {success}
          </div>
        )}
        {loading && (
          <div className="mb-4 p-3 bg-indigo-100 dark:bg-indigo-900/50 border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg flex items-center gap-3">
            <svg
              className="animate-spin h-5 w-5 text-indigo-700 dark:text-indigo-300"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Carregando...
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="empresa-select"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <UsersIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Empresa
            </label>
            <select
              id="empresa-select"
              value={empresaId}
              onChange={(e) => {
                setEmpresaId(e.target.value);
                const cnpj = empresas.find((e) => e.id === parseInt(e.target.value))?.cnpj || '';
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    estabelecimentos: [
                      {
                        ...dadosDeclaracao.declaracao.estabelecimentos[0],
                        cnpjCompleto: cnpj,
                      },
                    ],
                  },
                });
              }}
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
              required
            >
              <option value="" disabled>
                Selecione uma empresa
              </option>
              {empresas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="periodo-select"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <CalendarDaysIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Período de Apuração (YYYY-MM)
            </label>
            <input
              id="periodo-select"
              type="text"
              value={periodoApuracao}
              onChange={(e) => setPeriodoApuracao(e.target.value)}
              placeholder="YYYY-MM"
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
              required
            />
          </div>

          <div>
            <label
              htmlFor="receita-interno"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Receita Competência Interno
            </label>
            <input
              id="receita-interno"
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.receitaPaCompetenciaInterno}
              onChange={(e) =>
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    receitaPaCompetenciaInterno: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="receita-externo"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Receita Competência Externo
            </label>
            <input
              id="receita-externo"
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.receitaPaCompetenciaExterno}
              onChange={(e) =>
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    receitaPaCompetenciaExterno: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="icms-fixo"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Valor Fixo ICMS
            </label>
            <input
              id="icms-fixo"
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.valorFixoIcms}
              onChange={(e) =>
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    valorFixoIcms: parseFloat(e.target.value) || 0,
                  },
                })
              }
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label
              htmlFor="iss-fixo"
              className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Valor Fixo ISS (Opcional)
            </label>
            <input
              id="iss-fixo"
              type="number"
              step="0.01"
              value={dadosDeclaracao.declaracao.valorFixoIss || ''}
              onChange={(e) =>
                setDadosDeclaracao({
                  ...dadosDeclaracao,
                  declaracao: {
                    ...dadosDeclaracao.declaracao,
                    valorFixoIss: e.target.value ? parseFloat(e.target.value) : null,
                  },
                })
              }
              className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
            />
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Receitas Brutas Anteriores (12 Meses)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dadosDeclaracao.declaracao.receitasBrutasAnteriores.map((receita, index) => (
                <div
                  key={index}
                  className="p-4 bg-indigo-50 dark:bg-indigo-900/50 rounded-md"
                >
                  <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-2">
                    {formatPeriodo(receita.pa)}
                  </h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Valor Interno
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={receita.valorInterno}
                        onChange={(e) => {
                          const newReceitas = [
                            ...dadosDeclaracao.declaracao.receitasBrutasAnteriores,
                          ];
                          newReceitas[index].valorInterno = parseFloat(e.target.value) || 0;
                          setDadosDeclaracao({
                            ...dadosDeclaracao,
                            declaracao: {
                              ...dadosDeclaracao.declaracao,
                              receitasBrutasAnteriores: newReceitas,
                            },
                          });
                        }}
                        className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Valor Externo
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={receita.valorExterno}
                        onChange={(e) => {
                          const newReceitas = [
                            ...dadosDeclaracao.declaracao.receitasBrutasAnteriores,
                          ];
                          newReceitas[index].valorExterno = parseFloat(e.target.value) || 0;
                          setDadosDeclaracao({
                            ...dadosDeclaracao,
                            declaracao: {
                              ...dadosDeclaracao.declaracao,
                              receitasBrutasAnteriores: newReceitas,
                            },
                          });
                        }}
                        className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Folhas de Salário (12 Meses)
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dadosDeclaracao.declaracao.folhasSalario.map((folha, index) => (
                <div
                  key={index}
                  className="p-4 bg-indigo-50 dark:bg-indigo-900/50 rounded-md"
                >
                  <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-2">
                    {formatPeriodo(folha.pa)}
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Valor
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={folha.valor}
                      onChange={(e) => {
                        const newFolhas = [...dadosDeclaracao.declaracao.folhasSalario];
                        newFolhas[index].valor = parseFloat(e.target.value) || 0;
                        setDadosDeclaracao({
                          ...dadosDeclaracao,
                          declaracao: {
                            ...dadosDeclaracao.declaracao,
                            folhasSalario: newFolhas,
                          },
                        });
                      }}
                      className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-indigo-500 dark:text-indigo-400" />
              Atividade Principal do Estabelecimento
            </label>
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/50 rounded-md">
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    ID da Atividade
                  </label>
                  <input
                    type="number"
                    value={dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0].idAtividade}
                    onChange={(e) =>
                      setDadosDeclaracao({
                        ...dadosDeclaracao,
                        declaracao: {
                          ...dadosDeclaracao.declaracao,
                          estabelecimentos: [
                            {
                              ...dadosDeclaracao.declaracao.estabelecimentos[0],
                              atividades: [
                                {
                                  ...dadosDeclaracao.declaracao.estabelecimentos[0]
                                    .atividades[0],
                                  idAtividade: parseInt(e.target.value) || 1,
                                },
                              ],
                            },
                          ],
                        },
                      })
                    }
                    className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Valor da Atividade
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0]
                        .valorAtividade
                    }
                    onChange={(e) =>
                      setDadosDeclaracao({
                        ...dadosDeclaracao,
                        declaracao: {
                          ...dadosDeclaracao.declaracao,
                          estabelecimentos: [
                            {
                              ...dadosDeclaracao.declaracao.estabelecimentos[0],
                              atividades: [
                                {
                                  ...dadosDeclaracao.declaracao.estabelecimentos[0]
                                    .atividades[0],
                                  valorAtividade: parseFloat(e.target.value) || 0,
                                },
                              ],
                            },
                          ],
                        },
                      })
                    }
                    className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Valor da Receita (Atividade)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={
                      dadosDeclaracao.declaracao.estabelecimentos[0].atividades[0]
                        .receitasAtividade[0].valor
                    }
                    onChange={(e) =>
                      setDadosDeclaracao({
                        ...dadosDeclaracao,
                        declaracao: {
                          ...dadosDeclaracao.declaracao,
                          estabelecimentos: [
                            {
                              ...dadosDeclaracao.declaracao.estabelecimentos[0],
                              atividades: [
                                {
                                  ...dadosDeclaracao.declaracao.estabelecimentos[0]
                                    .atividades[0],
                                  receitasAtividade: [
                                    {
                                      ...dadosDeclaracao.declaracao.estabelecimentos[0]
                                        .atividades[0].receitasAtividade[0],
                                      valor: parseFloat(e.target.value) || 0,
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      })
                    }
                    className="w-full p-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg shadow-lg hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Enviando...
              </>
            ) : (
              <>
                <DocumentTextIcon className="h-6 w-6" />
                Declarar DAS
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default DeclararDASPage;