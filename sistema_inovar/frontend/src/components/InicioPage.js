import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import {
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

// Registra os elementos necessários para o gráfico
ChartJS.register(ArcElement, Tooltip, Legend);

// Sub-componente para os Cards de Estatísticas
const StatCard = ({ icon: Icon, title, value, color }) => (
  <motion.div
    variants={{ hidden: { scale: 0.8, opacity: 0 }, visible: { scale: 1, opacity: 1 } }}
    className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex items-center space-x-4"
  >
    <div className={`p-3 rounded-full ${color}`}>
      <Icon className="h-7 w-7 text-white" />
    </div>
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value ?? '...'}</p>
    </div>
  </motion.div>
);

// Componente Principal da Página
const InicioPage = () => {
  const [data, setData] = useState(null);
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState([]);
  const [userCargo, setUserCargo] = useState('admin');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [empresaStatus, setEmpresaStatus] = useState({});
  const [checkboxState, setCheckboxState] = useState({});
  const navigate = useNavigate();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const dashboardResponse = await axiosInstance.get('/api/dashboard-summary/');
        setData(dashboardResponse.data);

        const empresasResponse = await axiosInstance.get('/api/empresas/');
        setEmpresasSelecionadas(empresasResponse.data);

        // Inicializar estado dos checkboxes com base nos dados das empresas
        const initialCheckboxState = {};
        empresasResponse.data.forEach((empresa) => {
          initialCheckboxState[empresa.id] = {
            inss: empresa.inss || false,
            fgts: empresa.fgts || false,
            folha: empresa.folha || false,
            honorario: empresa.honorario || false,
            simples_nacional: empresa.simples_nacional || false,
          };
        });
        setCheckboxState(initialCheckboxState);

        try {
          const userResponse = await axiosInstance.get('/api/current-user/');
          setUserCargo(userResponse.data.cargo || 'admin');
        } catch (userErr) {
          console.error('Erro ao buscar função do usuário:', userErr);
          setUserCargo('admin');
        }
      } catch (err) {
        const errorMessage =
          err.response?.data?.error || 'Não foi possível carregar os dados do dashboard.';
        setError(errorMessage);
        console.error('Erro ao carregar dados:', err.response || err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Função para resetar checkboxes e coletar pendências
  useEffect(() => {
    const checkResetDate = () => {
      console.log('Verificando reset de checkboxes...');
      const today = new Date();
      const day = today.getDate();
      const pendencias = [];

      const updatedCheckboxState = { ...checkboxState };

      Object.keys(checkboxState).forEach((empresaId) => {
        const empresa = empresasSelecionadas.find((e) => e.id === parseInt(empresaId));
        if (!empresa) return;

        // Reset para departamento pessoal (dia 15)
        if ((userCargo === 'pessoal' || userCargo === 'admin') && day === 15) {
          if (!checkboxState[empresaId].inss) pendencias.push({ empresa, tipo: 'INSS' });
          if (!checkboxState[empresaId].fgts) pendencias.push({ empresa, tipo: 'FGTS' });
          if (!checkboxState[empresaId].folha) pendencias.push({ empresa, tipo: 'Folha' });
          if (!checkboxState[empresaId].honorario) pendencias.push({ empresa, tipo: 'Honorário' });
          updatedCheckboxState[empresaId] = {
            ...updatedCheckboxState[empresaId],
            inss: false,
            fgts: false,
            folha: false,
            honorario: false,
          };
        }

        // Reset para departamento fiscal (dia 25)
        if ((userCargo === 'fiscal' || userCargo === 'admin') && day === 25) {
          if (!checkboxState[empresaId].simples_nacional) {
            pendencias.push({ empresa, tipo: 'Simples Nacional' });
          }
          updatedCheckboxState[empresaId] = {
            ...updatedCheckboxState[empresaId],
            simples_nacional: false,
          };
        }
      });

      // Atualizar estado dos checkboxes
      if (JSON.stringify(updatedCheckboxState) !== JSON.stringify(checkboxState)) {
        setCheckboxState(updatedCheckboxState);
      }

      // Enviar pendências para o backend
      if (pendencias.length > 0) {
        console.log('Enviando pendências:', pendencias);
        axiosInstance.post('/api/pendencias/', { pendencias }).catch((err) => {
          console.error('Erro ao enviar pendências:', err);
        });
      }
    };

    // Executar imediatamente ao carregar
    checkResetDate();
    // Verificar reset apenas uma vez por dia
    const interval = setInterval(checkResetDate, 24 * 60 * 60 * 1000); // 24 horas
    return () => clearInterval(interval);
  }, [checkboxState, empresasSelecionadas, userCargo]);

  // Função para atualizar checkbox
  const handleCheckboxChange = async (empresaId, field) => {
    console.log(`Clicado ${field} para empresa ${empresaId}`);
    const newState = {
      ...checkboxState,
      [empresaId]: {
        ...checkboxState[empresaId],
        [field]: !checkboxState[empresaId][field],
      },
    };
    setCheckboxState(newState);

    // Atualizar no backend
    try {
      await axiosInstance.patch(`/api/empresas/${empresaId}/`, {
        [field]: newState[empresaId][field],
      });
    } catch (err) {
      console.error(`Erro ao atualizar ${field} para empresa ${empresaId}:`, err);
      setError(`Erro ao atualizar ${field} para a empresa.`);
    }
  };

  // Função para gerar e enviar DAS via WhatsApp
  const handleGerarEEnviarDas = async (empresa) => {
    console.log(`Gerando e enviando DAS para empresa ${empresa.id}`);
    setEmpresaStatus((prev) => ({
      ...prev,
      [empresa.id]: { loading: true, error: '', success: '' },
    }));

    try {
      const response = await axiosInstance.post('/api/serpro/gerar-e-enviar-das/', {
        cnpj: empresa.cnpj.replace(/\D/g, ''),
      });

      const periodo = response.data.mensagem.match(/\d{2}\/\d{4}/)[0];
      setEmpresaStatus((prev) => ({
        ...prev,
        [empresa.id]: {
          loading: false,
          error: '',
          success: `DAS de ${periodo} enviado com sucesso para ${empresa.nome}!`,
        },
      }));

      // Marcar Simples Nacional como concluído
      handleCheckboxChange(empresa.id, 'simples_nacional');

      setTimeout(() => {
        setEmpresaStatus((prev) => ({
          ...prev,
          [empresa.id]: { loading: false, error: '', success: '' },
        }));
      }, 5000);
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || 'Erro ao gerar e enviar o DAS via WhatsApp.';
      setEmpresaStatus((prev) => ({
        ...prev,
        [empresa.id]: { loading: false, error: errorMessage, success: '' },
      }));
    }
  };

  // Configuração do Gráfico
  const chartConfig = {
    data: {
      labels: data?.chart_data?.labels || ['Concluído', 'Pendente', 'Vencido'],
      datasets: [
        {
          data: data?.chart_data?.data || [0, 0, 0],
          backgroundColor: ['#22c55e', '#ef4444', '#64748b'],
          borderColor: ['#ffffff', '#ffffff', '#ffffff'],
          borderWidth: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: 'rgb(55, 65, 81)',
            usePointStyle: true,
            font: { size: 14 },
            padding: 20,
          },
        },
      },
      cutout: '70%',
    },
  };

  // Ajusta a cor da legenda para o modo escuro
  useEffect(() => {
    const updateChartColors = () => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      ChartJS.overrides.doughnut.plugins.legend.labels.color = isDarkMode ? '#e5e7eb' : '#374151';
      ChartJS.getChart('doughnut-chart')?.update();
    };

    updateChartColors();
    const observer = new MutationObserver(updateChartColors);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando Dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 dark:text-red-400">{error}</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Nenhum dado disponível para o dashboard.</div>;
  }

  const isDepartamentoPessoal = userCargo === 'pessoal';
  const isDepartamentoFiscal = userCargo === 'fiscal';
  const isAdministrador = userCargo === 'admin';

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="p-6 md:p-8 animate-fade-in"
    >
      <motion.h1
        variants={itemVariants}
        className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8"
      >
        Dashboard
      </motion.h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <StatCard
          icon={UsersIcon}
          title="Total de Clientes"
          value={data.kpis.total_clientes}
          color="bg-blue-500"
        />
        <StatCard
          icon={ClockIcon}
          title="Tarefas Pendentes (Total)"
          value={data.kpis.tarefas_pendentes}
          color="bg-yellow-500"
        />
        <StatCard
          icon={ExclamationTriangleIcon}
          title="Vencendo em 7 dias"
          value={data.kpis.vencendo_em_7_dias}
          color="bg-red-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div
          variants={itemVariants}
          className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 min-h-[600px]"
        >
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
            Empresas Atribuídas
          </h2>
          <div className="overflow-y-auto max-h-[540px]">
            {empresasSelecionadas.length > 0 ? (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-indigo-50 dark:bg-indigo-900/50 sticky top-0">
                    <th className="p-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-2/5">
                      Empresa
                    </th>
                    <th className="p-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-2/5">
                      CNPJ
                    </th>
                    {(isDepartamentoPessoal || isAdministrador) && (
                      <>
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          INSS
                        </th>
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          FGTS
                        </th>
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          Folha
                        </th>
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          Honorário
                        </th>
                      </>
                    )}
                    {(isDepartamentoFiscal || isAdministrador) && (
                      <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/5">
                        Simples Nacional
                      </th>
                    )}
                    {(isDepartamentoFiscal || isAdministrador) && (
                      <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                        Enviar DAS
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {empresasSelecionadas.map((empresa) => (
                    <motion.tr
                      key={empresa.id}
                      variants={itemVariants}
                      className="border-b border-gray-200 dark:border-gray-700"
                    >
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                        <div className="flex items-center space-x-2">
                          <UsersIcon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                          <Link
                            to={`/consultar-declaracoes?empresa_id=${empresa.id}`}
                            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                            onClick={() => console.log(`Navegando para /consultar-declaracoes?empresa_id=${empresa.id}`)}
                          >
                            {empresa.nome}
                          </Link>
                        </div>
                      </td>
                      <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                        {empresa.cnpj}
                      </td>
                      {(isDepartamentoPessoal || isAdministrador) && (
                        <>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.inss ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                              onClick={() => !empresaStatus[empresa.id]?.loading && handleCheckboxChange(empresa.id, 'inss')}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.fgts ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                              onClick={() => !empresaStatus[empresa.id]?.loading && handleCheckboxChange(empresa.id, 'fgts')}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.folha ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                              onClick={() => !empresaStatus[empresa.id]?.loading && handleCheckboxChange(empresa.id, 'folha')}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.honorario ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                              onClick={() => !empresaStatus[empresa.id]?.loading && handleCheckboxChange(empresa.id, 'honorario')}
                            />
                          </td>
                        </>
                      )}
                      {(isDepartamentoFiscal || isAdministrador) && (
                        <td className="p-2 text-center">
                          <CheckCircleIcon
                            className={`h-5 w-5 mx-auto cursor-pointer ${
                              checkboxState[empresa.id]?.simples_nacional ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                            }`}
                            onClick={() => !empresaStatus[empresa.id]?.loading && handleCheckboxChange(empresa.id, 'simples_nacional')}
                          />
                        </td>
                      )}
                      {(isDepartamentoFiscal || isAdministrador) && (
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleGerarEEnviarDas(empresa)}
                            disabled={empresaStatus[empresa.id]?.loading}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Gerar e enviar DAS via WhatsApp"
                          >
                            {empresaStatus[empresa.id]?.loading ? (
                              <svg
                                className="animate-spin h-5 w-5 text-indigo-500 dark:text-indigo-400 mx-auto"
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
                            ) : (
                              <PaperAirplaneIcon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                            )}
                          </button>
                          {empresaStatus[empresa.id]?.success && (
                            <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                              {empresaStatus[empresa.id].success}
                            </div>
                          )}
                          {empresaStatus[empresa.id]?.error && (
                            <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                              {empresaStatus[empresa.id].error}
                            </div>
                          )}
                        </td>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                Nenhuma empresa atribuída a este usuário.
              </p>
            )}
          </div>
        </motion.div>

        <div className="space-y-8">
          <motion.div
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4 text-center">
              Status Simples ({data?.chart_data?.periodo || 'N/A'})
            </h2>
            <div className="h-64 relative">
              <Doughnut id="doughnut-chart" data={chartConfig.data} options={chartConfig.options} />
            </div>
          </motion.div>
          <motion.div
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Acesso Rápido
            </h2>
            <div className="space-y-3">
              <Link
                to="/gerar-das"
                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                onClick={() => console.log('Navegando para /gerar-das')}
              >
                <span>Gerar Guia DAS</span>
                <ArrowRightIcon className="h-5 w-5 text-gray-400 dark:text-gray-300" />
              </Link>
              <Link
                to="/consultar-extrato"
                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                onClick={() => console.log('Navegando para /consultar-extrato')}
              >
                <span>Consultar Extrato</span>
                <ArrowRightIcon className="h-5 w-5 text-gray-400 dark:text-gray-300" />
              </Link>
              <Link
                to="/pendencias"
                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                onClick={() => console.log('Navegando para /pendencias')}
              >
                <span>Ver Pendências</span>
                <ArrowRightIcon className="h-5 w-5 text-gray-400 dark:text-gray-300" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default InicioPage;