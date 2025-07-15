import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  PaperAirplaneIcon,
  BellIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const StatCard = ({ icon: Icon, title, value, color, subtitle }) => (
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
      {subtitle && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>
      )}
    </div>
  </motion.div>
);

const NotificationDropdown = ({ notifications, onMarkAsRead, onClearAll }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="absolute top-14 right-0 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 z-50"
  >
    <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Notificações</h3>
      {notifications.length > 0 && (
        <button
          onClick={onClearAll}
          className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Limpar todas
        </button>
      )}
    </div>
    <div className="max-h-80 overflow-y-auto">
      {notifications.length === 0 ? (
        <p className="p-8 text-gray-500 dark:text-gray-400 text-center">Nenhuma notificação nova.</p>
      ) : (
        notifications.map((n) => (
          <div
            key={n.id}
            onClick={() => onMarkAsRead(n.id)}
            className={`p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer ${
              !n.lida ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
            }`}
          >
            <p className={`text-sm ${!n.lida ? 'font-semibold text-gray-800 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
              {n.mensagem}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{new Date(n.timestamp).toLocaleString('pt-BR')}</p>
          </div>
        ))
      )}
    </div>
  </motion.div>
);

const InicioPage = () => {
  const [data, setData] = useState(null);
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState([]);
  const [userCargo, setUserCargo] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [empresaStatus, setEmpresaStatus] = useState({});
  const [checkboxState, setCheckboxState] = useState({});
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [diasVencimento, setDiasVencimento] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
      borderColor: ['#fff', '#fff', '#fff', '#fff', '#fff'],
      borderWidth: 1,
    }],
  });
  const [chartLoading, setChartLoading] = useState(false); // Nova flag para controle do gráfico
  const navigate = useNavigate();
  const isInitialized = useRef(false);
  const lastClickRef = useRef(0); // Para debounce no clique

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [userResponse, dashboardResponse, empresasResponse] = await Promise.all([
        axiosInstance.get('/api/current-user/'),
        axiosInstance.get('/api/dashboard-summary/'),
        axiosInstance.get('/api/empresas/'),
      ]);
      console.log('Resposta /api/current-user/:', userResponse.data);
      setUserCargo(userResponse.data.cargo || 'admin');
      setIsSuperuser(userResponse.data.is_superuser || false);
      setData(dashboardResponse.data);
      console.log('Resposta /api/dashboard-summary/:', dashboardResponse.data);
      setEmpresasSelecionadas(empresasResponse.data);
      console.log('Resposta /api/empresas/:', empresasResponse.data);

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
      console.log('Initial checkboxState:', initialCheckboxState);
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || 'Não foi possível carregar os dados do dashboard.';
      setError(errorMessage);
      console.error('Erro ao carregar dados:', err.response || err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await axiosInstance.get('/api/notificacoes/');
      console.log('Resposta /api/notificacoes/:', response.data);
      setNotifications(response.data);
    } catch (err) {
      console.error('Erro ao buscar notificações:', err.response?.data || err.message);
    }
  }, []);

  const calculateTarefasPendentes = useCallback((checkboxState, empresasSelecionadas) => {
    let pendentes = 0;
    Object.keys(checkboxState).forEach((empresaId) => {
      const checks = checkboxState[empresaId];
      if (userCargo === 'pessoal' || userCargo === 'admin' || isSuperuser) {
        if (!checks.inss) pendentes++;
        if (!checks.fgts) pendentes++;
        if (!checks.folha) pendentes++;
        if (!checks.honorario) pendentes++;
      }
      if (userCargo === 'fiscal' || userCargo === 'admin' || isSuperuser) {
        if (!checks.simples_nacional) pendentes++;
      }
    });
    console.log('Tarefas pendentes calculadas:', pendentes);
    return pendentes;
  }, [userCargo, isSuperuser]);

  const fetchChartData = useCallback(async () => {
    if (chartLoading || !userCargo || !empresasSelecionadas.length || !Object.keys(checkboxState).length) {
      console.log('fetchChartData: Carregando ou dados insuficientes, ignorando atualização');
      return;
    }
    setChartLoading(true);
    try {
      let newChartData;
      if (userCargo === 'admin' || isSuperuser) {
        const totalEmpresas = empresasSelecionadas.length;
        const pendentes = calculateTarefasPendentes(checkboxState, empresasSelecionadas);
        const concluidas = (totalEmpresas * 5) - pendentes;

        newChartData = {
          labels: ['INSS', 'FGTS', 'Folha', 'Honorário', 'Simples Nacional'],
          datasets: [{
            data: [
              totalEmpresas - Object.values(checkboxState).filter(c => c.inss).length,
              totalEmpresas - Object.values(checkboxState).filter(c => c.fgts).length,
              totalEmpresas - Object.values(checkboxState).filter(c => c.folha).length,
              totalEmpresas - Object.values(checkboxState).filter(c => c.honorario).length,
              totalEmpresas - Object.values(checkboxState).filter(c => c.simples_nacional).length,
            ],
            backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
            borderColor: ['#fff', '#fff', '#fff', '#fff', '#fff'],
            borderWidth: 1,
          }],
        };
      } else {
        const totalTarefas = userCargo === 'pessoal' ? empresasSelecionadas.length * 4 : empresasSelecionadas.length;
        const pendentes = calculateTarefasPendentes(checkboxState, empresasSelecionadas);
        newChartData = {
          labels: userCargo === 'pessoal'
            ? ['Tarefas Pendentes', 'Tarefas Concluídas']
            : ['Simples Nacional Pendente', 'Simples Nacional Concluído'],
          datasets: [{
            data: pendentes === 0
              ? [0, totalTarefas]
              : [pendentes, totalTarefas - pendentes >= 0 ? totalTarefas - pendentes : 0],
            backgroundColor: ['#FF6384', '#36A2EB'],
            borderColor: ['#fff', '#fff'],
            borderWidth: 1,
          }],
        };
      }
      console.log('Novo chartData:', newChartData);
      setChartData(newChartData);
    } catch (error) {
      console.error('Erro ao buscar dados do gráfico:', error, 'Status:', error.response?.status, 'Data:', error.response?.data);
      setError('Erro ao carregar dados do gráfico de pizza.');
      setChartData({
        labels: ['Erro', 'N/A'],
        datasets: [{
          data: [1, 0],
          backgroundColor: ['#FF6384', '#36A2EB'],
          borderColor: ['#fff', '#fff'],
          borderWidth: 1,
        }],
      });
    } finally {
      setChartLoading(false);
    }
  }, [chartLoading, userCargo, isSuperuser, empresasSelecionadas, checkboxState, calculateTarefasPendentes]);

  useEffect(() => {
    if (!isInitialized.current) {
      fetchData();
      isInitialized.current = true;
    }
  }, [fetchData]);

  useEffect(() => {
    if (!userCargo || !empresasSelecionadas.length || !Object.keys(checkboxState).length) return;
    fetchNotifications();
    const pendentes = calculateTarefasPendentes(checkboxState, empresasSelecionadas);
    setTarefasPendentes(pendentes);
    fetchChartData();
    const interval = setInterval(() => {
      console.log('Atualizando notificações e gráfico...');
      fetchNotifications();
      fetchChartData();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchChartData, userCargo, empresasSelecionadas, checkboxState, calculateTarefasPendentes]);

  useEffect(() => {
    const handleAtribuicoesUpdated = (event) => {
      console.log('Evento atribuicoesUpdated recebido:', event.detail);
      fetchData();
      fetchChartData();
    };
    window.addEventListener('atribuicoesUpdated', handleAtribuicoesUpdated);
    return () => window.removeEventListener('atribuicoesUpdated', handleAtribuicoesUpdated);
  }, [fetchData, fetchChartData]);

  const markAsRead = async (id) => {
    try {
      await axiosInstance.patch(`/api/notificacoes/${id}/`, { lida: true });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
    } catch (err) {
      console.error('Erro ao marcar notificação como lida:', err);
    }
  };

  const clearNotifications = async () => {
    try {
      await axiosInstance.post('/api/notificacoes/marcar_todas_como_lidas/');
      setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
    } catch (err) {
      console.error('Erro ao limpar notificações:', err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.lida).length;

  useEffect(() => {
    if (!userCargo || !Object.keys(checkboxState).length) return;

    const pendentes = calculateTarefasPendentes(checkboxState, empresasSelecionadas);
    setTarefasPendentes(pendentes);

    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth();
    const year = today.getFullYear();
    let targetDay = userCargo === 'fiscal' ? 25 : 15;
    let targetDate = new Date(year, month, targetDay);

    if (day > targetDay) {
      targetDate = new Date(year, month + 1, targetDay);
    }

    const timeDiff = targetDate - today;
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    setDiasVencimento(daysRemaining);
    console.log('Dias até vencimento:', daysRemaining);
  }, [checkboxState, userCargo, empresasSelecionadas, calculateTarefasPendentes]);

  const handleCheckboxChange = async (empresaId, field) => {
    const now = Date.now();
    if (now - lastClickRef.current < 500 || empresaStatus[empresaId]?.loading) return; // Debounce e verifica loading
    lastClickRef.current = now;

    console.log(`Clicado ${field} para empresa ${empresaId}`);
    setEmpresaStatus((prev) => ({
      ...prev,
      [empresaId]: { ...prev[empresaId], loading: true, error: '', success: '' },
    }));

    const currentState = checkboxState[empresaId] || {};
    const newValue = !currentState[field];
    const newState = {
      ...checkboxState,
      [empresaId]: { ...currentState, [field]: newValue },
    };
    setCheckboxState(newState);

    const pendentes = calculateTarefasPendentes(newState, empresasSelecionadas);
    setTarefasPendentes(pendentes);

    try {
      const response = await axiosInstance.patch(`/api/empresas/${empresaId}/`, { [field]: newValue });
      console.log(`PATCH /api/empresas/${empresaId}/ response:`, response.data);
      setCheckboxState((prev) => ({
        ...prev,
        [empresaId]: { ...prev[empresaId], [field]: response.data[field] },
      }));
    } catch (err) {
      console.error(`Erro ao atualizar ${field} para empresa ${empresaId}:`, err);
      setError(
        err.response?.status === 403
          ? `Permissão negada para atualizar ${field}. Contate o administrador.`
          : `Erro ao atualizar ${field} para a empresa.`
      );
      setCheckboxState((prev) => ({
        ...prev,
        [empresaId]: { ...prev[empresaId], [field]: !newValue },
      }));
      setTarefasPendentes(calculateTarefasPendentes(checkboxState, empresasSelecionadas));
    } finally {
      setEmpresaStatus((prev) => ({
        ...prev,
        [empresaId]: { ...prev[empresaId], loading: false },
      }));
    }
  };

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

      const periodo = response.data.mensagem.match(/\d{2}\/\d{4}/)?.[0] || 'período desconhecido';
      setEmpresaStatus((prev) => ({
        ...prev,
        [empresa.id]: {
          loading: false,
          error: '',
          success: `DAS de ${periodo} enviado com sucesso para ${empresa.nome}!`,
        },
      }));

      await handleCheckboxChange(empresa.id, 'simples_nacional');
    } catch (err) {
      const errorMessage =
        err.response?.data?.erro || 'Erro ao gerar e enviar o DAS via WhatsApp.';
      setEmpresaStatus((prev) => ({
        ...prev,
        [empresa.id]: { loading: false, error: errorMessage, success: '' },
      }));
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetchData();
      await fetchChartData();
    } catch (err) {
      console.error('Erro ao recarregar dados:', err);
      setError('Erro ao recarregar dados do dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!userCargo || !Object.keys(checkboxState).length) return;

    const checkResetDate = () => {
      console.log('Verificando reset de checkboxes...');
      const today = new Date();
      const day = today.getDate();
      const pendencias = [];
      const updatedCheckboxState = { ...checkboxState };
      let stateChanged = false;

      Object.keys(checkboxState).forEach((empresaId) => {
        const empresa = empresasSelecionadas.find((e) => e.id === parseInt(empresaId));
        if (!empresa) return;

        if ((userCargo === 'pessoal' || userCargo === 'admin' || isSuperuser) && day === 15) {
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
          stateChanged = true;
        }

        if ((userCargo === 'fiscal' || userCargo === 'admin' || isSuperuser) && day === 25) {
          if (!checkboxState[empresaId].simples_nacional) pendencias.push({ empresa, tipo: 'Simples Nacional' });
          updatedCheckboxState[empresaId] = {
            ...updatedCheckboxState[empresaId],
            simples_nacional: false,
          };
          stateChanged = true;
        }
      });

      const lastChange = lastClickRef.current;
      const isRecentChange = lastChange && (Date.now() - lastChange < 5000);

      if (stateChanged && !isRecentChange && JSON.stringify(updatedCheckboxState) !== JSON.stringify(checkboxState)) {
        setCheckboxState(updatedCheckboxState);
        const pendentes = calculateTarefasPendentes(updatedCheckboxState, empresasSelecionadas);
        setTarefasPendentes(pendentes);
        fetchChartData();
      }

      if (pendencias.length > 0 && !isRecentChange) {
        console.log('Enviando pendências:', pendencias);
        axiosInstance.post('/api/pendencias/', { pendencias })
          .catch((err) => {
            console.error('Erro ao enviar pendências:', err);
          });
      }
    };

    checkResetDate();
    const interval = setInterval(checkResetDate, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkboxState, empresasSelecionadas, userCargo, isSuperuser, fetchChartData, calculateTarefasPendentes]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: document.documentElement.classList.contains('dark') ? '#e5e7eb' : '#374151',
          usePointStyle: true,
          font: { size: 14 },
          padding: 20,
        },
      },
      tooltip: {
        enabled: true,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.raw || 0;
            return `${label}: ${value} tarefa(s)`;
          },
        },
      },
    },
    cutout: '70%',
  };

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

  if (loading || !userCargo) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando Dashboard...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 dark:text-red-400">{error}</div>;
  }

  const isDepartamentoPessoal = userCargo === 'pessoal';
  const isDepartamentoFiscal = userCargo === 'fiscal';
  const isAdministrador = userCargo === 'admin' || isSuperuser;

  const vencimentoColor = diasVencimento <= 3 ? 'bg-red-500' : 'bg-orange-500';
  const vencimentoIcon = diasVencimento <= 3 ? ExclamationTriangleIcon : ClockIcon;
  const vencimentoSubtitle =
    diasVencimento > 7
      ? 'Nenhum vencimento próximo'
      : `Vencimento em ${isDepartamentoFiscal ? '25' : '15'}/${new Date().getMonth() + (diasVencimento > 7 ? 2 : 1)}`;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="p-6 md:p-8 animate-fade-in relative"
    >
      <div className="absolute top-6 right-8 flex items-center gap-4 z-20">
        <button onClick={handleRefresh} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Atualizar Dados">
          <ArrowPathIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="relative">
          <button onClick={() => setShowNotifications(prev => !prev)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Notificações">
            <BellIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 block h-3 w-3 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
            )}
          </button>
          <AnimatePresence>
            {showNotifications && (
              <NotificationDropdown
                notifications={notifications}
                onMarkAsRead={markAsRead}
                onClearAll={clearNotifications}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

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
          value={empresasSelecionadas.length}
          color="bg-blue-500"
        />
        <StatCard
          icon={ClockIcon}
          title="Tarefas Pendentes"
          value={tarefasPendentes}
          color="bg-yellow-500"
          subtitle={tarefasPendentes === 0 ? 'Todas as tarefas concluídas!' : 'Complete suas tarefas!'}
        />
        <StatCard
          icon={vencimentoIcon}
          title="Dias até Vencimento"
          value={diasVencimento >= 0 ? diasVencimento : '...'}
          color={vencimentoColor}
          subtitle={vencimentoSubtitle}
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
                    {isDepartamentoPessoal && (
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
                    {isDepartamentoFiscal && (
                      <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/5">
                        Simples Nacional
                      </th>
                    )}
                    {isDepartamentoFiscal && (
                      <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                        Enviar DAS
                      </th>
                    )}
                    {isAdministrador && (
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
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          Simples Nacional
                        </th>
                        <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                          Enviar DAS
                        </th>
                      </>
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
                      {isDepartamentoPessoal && (
                        <>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.inss
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'inss');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.fgts
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'fgts');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.folha
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'folha');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.honorario
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'honorario');
                                }
                              }}
                            />
                          </td>
                        </>
                      )}
                      {isDepartamentoFiscal && (
                        <>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.simples_nacional
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'simples_nacional');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleGerarEEnviarDas(empresa)}
                              disabled={empresaStatus[empresa.id]?.loading || false}
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
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
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
                        </>
                      )}
                      {isAdministrador && (
                        <>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.inss
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'inss');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.fgts
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'fgts');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.folha
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'folha');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.honorario
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'honorario');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <CheckCircleIcon
                              className={`h-5 w-5 mx-auto cursor-pointer ${
                                checkboxState[empresa.id]?.simples_nacional
                                  ? 'text-green-500'
                                  : 'text-gray-300 dark:text-gray-600'
                              } ${empresaStatus[empresa.id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                              onClick={() => {
                                if (!empresaStatus[empresa.id]?.loading) {
                                  handleCheckboxChange(empresa.id, 'simples_nacional');
                                }
                              }}
                            />
                          </td>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleGerarEEnviarDas(empresa)}
                              disabled={empresaStatus[empresa.id]?.loading || false}
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
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
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
                        </>
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
              Status das Tarefas
            </h2>
            <div className="h-64 relative">
              {chartData.labels.length === 0 || chartData.datasets[0].data.every(val => val === 0) ? (
                <p className="text-gray-500 dark:text-gray-400 text-center">
                  Não há dados disponíveis para o gráfico. Verifique as configurações ou entre em contato com o suporte.
                </p>
              ) : (
                <Doughnut id="doughnut-chart" data={chartData} options={chartOptions} />
              )}
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