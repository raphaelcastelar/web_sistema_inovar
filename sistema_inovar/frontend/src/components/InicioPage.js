import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import {
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
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
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? '...'}</p>
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Buscar dados do dashboard
        const dashboardResponse = await axiosInstance.get('/api/dashboard-summary/');
        setData(dashboardResponse.data);

        // Buscar empresas atribuídas ao usuário
        const empresasResponse = await axiosInstance.get('/api/empresas/');
        console.log('Resposta do /api/empresas/:', empresasResponse.data); // Log para depuração
        setEmpresasSelecionadas(empresasResponse.data);

        // Buscar função do usuário
        try {
          const userResponse = await axiosInstance.get('/api/current-user/');
          console.log('Resposta do /api/current-user/:', userResponse.data);
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

  // Configuração do Gráfico
  const chartConfig = {
    data: {
      labels: data?.chart_data?.labels || [],
      datasets: [
        {
          data: data?.chart_data?.data || [],
          backgroundColor: ['#22c55e', '#ef4444', '#64748b'],
          borderColor: document.documentElement.classList.contains('dark')
            ? '#1f2937'
            : '#ffffff',
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
            color: document.documentElement.classList.contains('dark') ? 'white' : '#374151',
          },
        },
      },
      cutout: '70%',
    },
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando Dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 dark:text-red-400">{error}</div>;
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Nenhum dado disponível para o dashboard.</div>;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  const isDepartamentoPessoal = userCargo === 'pessoal';
  const isDepartamentoFiscal = userCargo === 'fiscal';
  const isAdministrador = userCargo === 'admin';

  console.log('Função do usuário (userCargo):', userCargo, 'isAdministrador:', isAdministrador);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="p-6 md:p-8"
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
          <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
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
                              className={`h-5 w-5 mx-auto ${
                                empresa.inss ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto ${
                                empresa.fgts ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto ${
                                empresa.folha ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto ${
                                empresa.honorario ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                              }`}
                            />
                          </td>
                        </>
                      )}
                      {(isDepartamentoFiscal || isAdministrador) && (
                        <td className="p-2 text-center">
                          <CheckCircleIcon
                            className={`h-5 w-5 mx-auto ${
                              empresa.simples_nacional ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'
                            }`}
                          />
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
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 text-center">
              Status Simples ({data.chart_data.periodo})
            </h2>
            <div className="h-64 relative">
              <Doughnut data={chartConfig.data} options={chartConfig.options} />
            </div>
          </motion.div>
          <motion.div
            variants={itemVariants}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
          >
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">
              Acesso Rápido
            </h2>
            <div className="space-y-3">
              <Link
                to="/gerar-das"
                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span>Gerar Guia DAS</span>
                <ArrowRightIcon className="h-5 w-5 text-gray-400" />
              </Link>
              <Link
                to="/consultar-extrato"
                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <span>Consultar Extrato</span>
                <ArrowRightIcon className="h-5 w-5 text-gray-400" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default InicioPage;