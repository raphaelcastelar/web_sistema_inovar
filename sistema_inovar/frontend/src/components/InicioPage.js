import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion, AnimatePresence } from 'framer-motion';
import {
  UsersIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  BellIcon,
  ArrowPathIcon,
  BanknotesIcon,
  PaperAirplaneIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import {
  buildCompanyStatus,
  getDaysToDue,
  getStatusClasses,
  getTaskDefinitions,
} from '../utils/carteiraEmpresas';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, Filler);

const taskChartPalette = ['#a7c7e7', '#b8d8be', '#f6d6ad', '#d7c4f2', '#f4b6c2'];

const StatCard = ({ icon: Icon, title, value, color, subtitle, onClick, disabled }) => {
  const MotionTag = onClick ? motion.button : motion.div;

  return (
  <MotionTag
    variants={{ hidden: { scale: 0.8, opacity: 0 }, visible: { scale: 1, opacity: 1 } }}
    type={onClick ? 'button' : undefined}
    onClick={onClick}
    disabled={onClick ? disabled : undefined}
    className={`min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5 ${onClick ? 'text-left transition hover:-translate-y-0.5 hover:border-orange-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 dark:hover:border-orange-900/70' : ''}`}
  >
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{title}</p>
        <p className="mt-3 break-words text-2xl font-bold tabular-nums text-gray-950 dark:text-gray-100">{value ?? '...'}</p>
      </div>
      <div className={`shrink-0 rounded-md p-2.5 ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
    </div>
    {subtitle && (
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
    )}
  </MotionTag>
  );
};

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) return String(value);
  return numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('pt-BR');
}

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function toRelativeApiPath(url) {
  if (!url) return null;
  if (url.startsWith('/')) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search || ''}`;
  } catch (e) {
    return null;
  }
}

async function fetchAllBoletosFromApi() {
  try {
    let nextUrl = '/api/boletos-bb/';
    let guard = 0;
    const allRowsMap = new Map();

    while (nextUrl && guard < 100) {
      const response = await axiosInstance.get(nextUrl, {
        params: { _ts: Date.now() },
      });

      const data = response?.data;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.results)) {
        data.results.forEach((row) => allRowsMap.set(String(row.id), row));
        nextUrl = toRelativeApiPath(data.next);
        guard += 1;
        continue;
      }

      return normalizeRows(data);
    }

    return Array.from(allRowsMap.values());
  } catch (err) {
    const fallback = await axiosInstance.get('/api/boletos-bb/', {
      params: { _ts: Date.now() },
    });
    return normalizeRows(fallback?.data);
  }
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateOnlyKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const dateOnly = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    if (dateOnly) return dateOnly;
  }
  const parsed = getValidDate(value);
  return parsed ? dateKey(parsed) : null;
}

function getValidDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSameMonth(date, referenceDate) {
  return date
    && date.getFullYear() === referenceDate.getFullYear()
    && date.getMonth() === referenceDate.getMonth();
}

const NotificationDropdown = ({ notifications, onMarkAsRead, onClearAll }) => (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -10 }}
    className="absolute right-0 top-14 z-50 w-[calc(100vw-2rem)] max-w-80 rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800 sm:w-80"
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
            className={`p-4 border-b border-gray-100 dark:border-gray-700 last:border-b-0 cursor-pointer ${!n.lida ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
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
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState([]);
  const [boletos, setBoletos] = useState([]);
  const [userCargo, setUserCargo] = useState(null);
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checkboxState, setCheckboxState] = useState({});
  const [tarefasPendentes, setTarefasPendentes] = useState(0);
  const [diasVencimento, setDiasVencimento] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showCobrancaModal, setShowCobrancaModal] = useState(false);
  const [sendingCobranca, setSendingCobranca] = useState(false);
  const [cobrancaFeedback, setCobrancaFeedback] = useState(null);
  const [cobrancaTestRecipientNumber, setCobrancaTestRecipientNumber] = useState('');
  const [selectedCobrancaIds, setSelectedCobrancaIds] = useState([]);
  const [chartData, setChartData] = useState({
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: taskChartPalette,
      borderColor: '#ffffff',
      borderWidth: 3,
      hoverOffset: 4,
    }],
  });
  const [chartLoading, setChartLoading] = useState(false); // Nova flag para controle do gráfico
  const isInitialized = useRef(false);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [userResponse, empresasResponse, boletosData] = await Promise.all([
        axiosInstance.get('/api/current-user/'),
        axiosInstance.get('/api/empresas/'),
        fetchAllBoletosFromApi(),
      ]);
      console.log('Resposta /api/current-user/:', userResponse.data);
      setUserCargo(userResponse.data.cargo || 'admin');
      setIsSuperuser(userResponse.data.is_superuser || false);
      const empresasAtivas = empresasResponse.data.filter((empresa) => empresa.ativo === true);
      setEmpresasSelecionadas(empresasAtivas);
      setBoletos(boletosData);
      console.log('Resposta /api/empresas/:', empresasResponse.data);

      const initialCheckboxState = {};
      empresasAtivas.forEach((empresa) => {
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
            backgroundColor: taskChartPalette,
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 4,
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
            backgroundColor: ['#f4b6c2', '#b8d8be'],
            borderColor: '#ffffff',
            borderWidth: 3,
            hoverOffset: 4,
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
          backgroundColor: ['#f4b6c2', '#d8dee9'],
          borderColor: '#ffffff',
          borderWidth: 3,
          hoverOffset: 4,
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
      setNotifications([]);
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

      if (stateChanged && JSON.stringify(updatedCheckboxState) !== JSON.stringify(checkboxState)) {
        setCheckboxState(updatedCheckboxState);
        const pendentes = calculateTarefasPendentes(updatedCheckboxState, empresasSelecionadas);
        setTarefasPendentes(pendentes);
        fetchChartData();
      }

      if (pendencias.length > 0) {
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
          boxWidth: 8,
          font: { size: 12 },
          padding: 14,
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
    cutout: '68%',
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

  const isInitialDataLoading = loading && !userCargo && empresasSelecionadas.length === 0 && boletos.length === 0;
  const cargoForLayout = userCargo || 'admin';
  const isDepartamentoFiscal = cargoForLayout === 'fiscal';
  const hasDiasVencimento = typeof diasVencimento === 'number';

  const vencimentoColor = hasDiasVencimento && diasVencimento <= 3 ? 'bg-rose-300' : 'bg-orange-300';
  const vencimentoIcon = hasDiasVencimento && diasVencimento <= 3 ? ExclamationTriangleIcon : ClockIcon;
  const vencimentoSubtitle =
    !hasDiasVencimento
      ? 'Aguardando dados do usuário'
      : diasVencimento > 7
      ? 'Nenhum vencimento próximo'
      : `Vencimento em ${isDepartamentoFiscal ? '25' : '15'}/${new Date().getMonth() + (diasVencimento > 7 ? 2 : 1)}`;

  const empresasAtivasCount = empresasSelecionadas.filter((empresa) => empresa.ativo).length;
  const carteiraTasks = getTaskDefinitions(cargoForLayout, isSuperuser);
  const carteiraDaysToDue = getDaysToDue(cargoForLayout);
  const prioridadeEmpresas = empresasSelecionadas
    .map((empresa) => ({
      empresa,
      status: buildCompanyStatus(empresa, carteiraTasks, carteiraDaysToDue),
    }))
    .filter(({ status }) => ['warning', 'attention'].includes(status.tone))
    .sort((a, b) => a.status.priority - b.status.priority || a.empresa.nome.localeCompare(b.empresa.nome))
    .slice(0, 6);
  const today = new Date();
  const currentMonthLabel = today.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const boletosGeradosMesAtual = boletos.filter((boleto) => {
    const generatedDate = getValidDate(boleto.criado_em || boleto.atualizado_em);
    return isSameMonth(generatedDate, today);
  });
  const boletosPagosMesAtual = boletos.filter((boleto) => {
    const paidDate = getValidDate(
      boleto.data_pagamento || (boleto.status === 'pago' ? boleto.atualizado_em : null)
    );
    return boleto.status === 'pago' && isSameMonth(paidDate, today);
  });
  const boletosGeradosCount = boletosGeradosMesAtual.length;
  const boletosPagosCount = boletosPagosMesAtual.length;
  const todayKey = dateKey(today);
  const currentMonthKey = todayKey.slice(0, 7);
  const boletosVencidosEmAberto = boletos.filter((boleto) => {
    const vencimentoKey = dateOnlyKey(boleto.data_vencimento);
    return (
      boleto.status === 'registrado'
      && vencimentoKey
      && vencimentoKey.slice(0, 7) === currentMonthKey
      && vencimentoKey < todayKey
    );
  });
  const boletosRegistradosCount = boletosVencidosEmAberto.length;
  const empresasById = new Map(empresasSelecionadas.map((empresa) => [String(empresa.id), empresa]));
  const boletosEmAbertoRows = boletosVencidosEmAberto.map((boleto) => {
    const empresa = empresasById.get(String(boleto.empresa)) || {};
    return {
      ...boleto,
      empresa_nome: boleto.empresa_nome || empresa.nome || 'Empresa não identificada',
      empresa_cnpj: empresa.cnpj || '-',
      empresa_telefone: empresa.telefone || '-',
      empresa_numero: empresa.numero || '-',
    };
  });
  const cobrancaRowIdsKey = boletosEmAbertoRows.map((boleto) => boleto.id).join('|');
  const selectedCobrancaCount = selectedCobrancaIds.length;
  const percentualPago = isInitialDataLoading
    ? 'Aguardando boletos'
    : boletosGeradosCount > 0
    ? `${Math.round((boletosPagosCount / boletosGeradosCount) * 100)}% pagos`
    : 'Sem boletos neste mês';

  const boletoVolumePoints = Array.from({ length: today.getDate() }).map((_, index) => {
    const currentDate = new Date(today.getFullYear(), today.getMonth(), index + 1);
    currentDate.setHours(0, 0, 0, 0);

    return {
      key: dateKey(currentDate),
      label: currentDate.toLocaleDateString('pt-BR', { day: '2-digit' }),
      gerados: 0,
      pagos: 0,
    };
  });

  const boletoVolumeMap = new Map(boletoVolumePoints.map((point) => [point.key, point]));

  boletos.forEach((boleto) => {
    const generatedDate = getValidDate(boleto.criado_em || boleto.atualizado_em);
    const paidDate = getValidDate(
      boleto.data_pagamento || (boleto.status === 'pago' ? boleto.atualizado_em : null)
    );

    if (generatedDate) {
      const point = boletoVolumeMap.get(dateKey(generatedDate));
      if (point && isSameMonth(generatedDate, today)) point.gerados += 1;
    }

    if (paidDate) {
      const point = boletoVolumeMap.get(dateKey(paidDate));
      if (point && boleto.status === 'pago' && isSameMonth(paidDate, today)) point.pagos += 1;
    }
  });

  const boletoVolumeData = {
    labels: boletoVolumePoints.map((point) => point.label),
    datasets: [
      {
        label: 'Gerados',
        data: boletoVolumePoints.map((point) => point.gerados),
        borderColor: '#c8a46d',
        backgroundColor: 'rgba(200, 164, 109, 0.18)',
        pointBackgroundColor: '#c8a46d',
        pointBorderColor: '#ffffff',
        fill: true,
        tension: 0.38,
      },
      {
        label: 'Pagos',
        data: boletoVolumePoints.map((point) => point.pagos),
        borderColor: '#84c7a2',
        backgroundColor: 'rgba(132, 199, 162, 0.16)',
        pointBackgroundColor: '#84c7a2',
        pointBorderColor: '#ffffff',
        fill: true,
        tension: 0.38,
      },
    ],
  };

  const boletoVolumeOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          boxWidth: 8,
          color: document.documentElement.classList.contains('dark') ? '#e5e7eb' : '#374151',
          font: { size: 12 },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.raw} boleto(s)`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#6b7280',
          font: { size: 11 },
        },
      },
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: document.documentElement.classList.contains('dark') ? '#9ca3af' : '#6b7280',
          font: { size: 11 },
        },
        grid: {
          color: document.documentElement.classList.contains('dark') ? 'rgba(75, 85, 99, 0.45)' : 'rgba(229, 231, 235, 0.9)',
        },
      },
    },
  };

  const handleOpenCobrancaModal = () => {
    setCobrancaFeedback(null);
    setSelectedCobrancaIds((currentIds) => (
      currentIds.length > 0 || boletosEmAbertoRows.length === 0
        ? currentIds
        : [boletosEmAbertoRows[0].id]
    ));
    setShowCobrancaModal(true);
  };

  useEffect(() => {
    if (boletosEmAbertoRows.length === 0) {
      setSelectedCobrancaIds([]);
      return;
    }

    setSelectedCobrancaIds((currentIds) => {
      const availableIds = new Set(boletosEmAbertoRows.map((boleto) => boleto.id));
      const keptIds = currentIds.filter((id) => availableIds.has(id));
      const isSameSelection = currentIds.length === keptIds.length
        && currentIds.every((id, index) => id === keptIds[index]);
      return isSameSelection ? currentIds : keptIds;
    });
  }, [cobrancaRowIdsKey, boletosEmAbertoRows]);

  const toggleCobrancaSelection = (boletoId) => {
    setSelectedCobrancaIds((currentIds) => (
      currentIds.includes(boletoId)
        ? currentIds.filter((id) => id !== boletoId)
        : [...currentIds, boletoId]
    ));
  };

  const selectAllCobrancas = () => {
    setSelectedCobrancaIds(boletosEmAbertoRows.map((boleto) => boleto.id));
  };

  const clearCobrancaSelection = () => {
    setSelectedCobrancaIds([]);
  };

  const handleEnviarCobranca = async () => {
    if (selectedCobrancaIds.length === 0) return;

    setSendingCobranca(true);
    setCobrancaFeedback(null);

    try {
      const testNumber = cobrancaTestRecipientNumber.trim();
      const response = await axiosInstance.post('/api/boletos-bb/enviar-cobranca/', {
        boleto_ids: selectedCobrancaIds,
        ...(testNumber ? { test_recipient_number: testNumber } : {}),
      });
      const successCount = response.data?.success_count ?? 0;
      const failedCount = response.data?.failed_count ?? 0;
      const testSuffix = response.data?.test_mode
        ? ` Teste enviado para ${response.data.test_recipient_number}.`
        : '';
      setCobrancaFeedback({
        type: failedCount > 0 ? 'warning' : 'success',
        text: `${successCount} cobrança(s) enviada(s). ${failedCount} falha(s).${testSuffix}`,
      });
      if (successCount > 0) {
        setSelectedCobrancaIds([]);
      }
    } catch (err) {
      const data = err?.response?.data;
      const successCount = data?.success_count ?? 0;
      const failedCount = data?.failed_count ?? selectedCobrancaIds.length;
      setCobrancaFeedback({
        type: 'error',
        text: data?.error || `${successCount} cobrança(s) enviada(s). ${failedCount} falha(s).`,
      });
    } finally {
      setSendingCobranca(false);
    }
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <motion.div variants={itemVariants} className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Operação</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Acompanhe empresas, tarefas e o volume de boletos do escritório.
          </p>
        </motion.div>

        <div className="flex shrink-0 items-center justify-end gap-3">
          <button onClick={handleRefresh} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700" title="Atualizar Dados">
            <ArrowPathIcon className={`h-6 w-6 text-gray-600 dark:text-gray-300 ${loading ? 'animate-spin' : ''}`} />
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
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 2xl:gap-4">
        <StatCard
          icon={UsersIcon}
          title="Empresas Ativas"
          value={isInitialDataLoading ? undefined : empresasAtivasCount}
          color="bg-sky-300"
        />
        <StatCard
          icon={BanknotesIcon}
          title="Boletos Gerados"
          value={isInitialDataLoading ? undefined : boletosGeradosCount}
          color="bg-amber-300"
          subtitle="Gerados no mês atual"
        />
        <StatCard
          icon={CheckCircleIcon}
          title="Boletos Pagos"
          value={isInitialDataLoading ? undefined : boletosPagosCount}
          color="bg-emerald-300"
          subtitle={percentualPago}
        />
        <StatCard
          icon={ClockIcon}
          title="Em Aberto"
          value={isInitialDataLoading ? undefined : boletosRegistradosCount}
          color="bg-orange-300"
          subtitle={boletosRegistradosCount > 0 ? 'Clique para cobrar os vencidos' : 'Nenhum boleto vencido aguardando pagamento'}
          onClick={handleOpenCobrancaModal}
          disabled={isInitialDataLoading}
        />
        <StatCard
          icon={vencimentoIcon}
          title="Dias até Vencimento"
          value={hasDiasVencimento && diasVencimento >= 0 ? diasVencimento : undefined}
          color={vencimentoColor}
          subtitle={vencimentoSubtitle}
        />
      </div>

      <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-5">
        <motion.div
          variants={itemVariants}
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5 xl:col-span-3"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100">Volume de boletos</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Gerados e pagos em {currentMonthLabel}</p>
            </div>
            <Link
              to="/boletos-por-empresa"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
            >
              Ver boletos
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 h-[240px] sm:h-[280px]">
            <Line data={boletoVolumeData} options={boletoVolumeOptions} />
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5 xl:col-span-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100">Status das tarefas</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isInitialDataLoading ? 'Carregando pendências' : `${tarefasPendentes} pendência(s) por obrigação`}
              </p>
            </div>
            <span className="rounded-md border border-gray-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:border-gray-700 dark:text-gray-400">
              Atual
            </span>
          </div>
          <div className="relative mt-4 h-[240px] sm:h-[280px]">
            {isInitialDataLoading ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                Carregando dados do gráfico.
              </p>
            ) : chartData.labels.length === 0 || chartData.datasets[0].data.every(val => val === 0) ? (
              <p className="flex h-full items-center justify-center text-center text-sm text-gray-500 dark:text-gray-400">
                Não há dados disponíveis para o gráfico.
              </p>
            ) : (
              <>
                <Doughnut id="doughnut-chart" data={chartData} options={chartOptions} />
                <div className="pointer-events-none absolute inset-x-0 top-[38%] flex -translate-y-1/2 flex-col items-center justify-center">
                  <span className="text-2xl font-bold tabular-nums text-gray-950 dark:text-gray-100">{tarefasPendentes}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">pendentes</span>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-3">
        <motion.div
          variants={itemVariants}
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5 xl:col-span-2"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100">Empresas que precisam de atenção</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Prioridade calculada por pendências e vencimento mensal.</p>
            </div>
            <Link
              to="/carteira-empresas"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white sm:w-auto"
            >
              Abrir carteira
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {prioridadeEmpresas.length > 0 ? (
              prioridadeEmpresas.map(({ empresa, status }) => (
                <div key={empresa.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/empresas/${empresa.id}/pastas`} className="truncate font-semibold text-gray-950 hover:underline dark:text-gray-100">
                          {empresa.nome}
                        </Link>
                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(status.tone)}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{empresa.cnpj || 'CNPJ não informado'}</p>
                    </div>
                    <div className="shrink-0 text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
                      {status.done}/{status.total}
                    </div>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-sky-200 via-violet-200 to-emerald-200"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{status.description}</p>
                </div>
              ))
            ) : isInitialDataLoading ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-800 dark:bg-gray-900/60">
                <ClockIcon className="mx-auto h-8 w-8 text-gray-400" />
                <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Carregando empresas.</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">As prioridades aparecem assim que os dados retornarem.</p>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/70 dark:bg-emerald-950/30">
                <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-500" />
                <p className="mt-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Nenhuma empresa crítica agora.</p>
                <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">A carteira completa continua disponível para acompanhamento.</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5"
        >
          <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100">Acesso rápido</h2>
          <div className="mt-4 space-y-2">
            {[
              { to: '/carteira-empresas', label: 'Carteira de Empresas' },
              { to: '/gerar-das', label: 'Gerar Guia DAS' },
              { to: '/consultar-extrato', label: 'Consultar Extrato' },
              { to: '/pendencias', label: 'Ver Pendências' },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex w-full items-center justify-between rounded-lg p-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <span>{item.label}</span>
                <ArrowRightIcon className="h-4 w-4 text-gray-400 dark:text-gray-300" />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>

      <AnimatePresence>
        {showCobrancaModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !sendingCobranca && setShowCobrancaModal(false)}
          >
            <motion.div
              className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-gray-900"
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5 dark:border-gray-800">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">Cobrança de honorário</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-950 dark:text-white">Boletos em aberto</h2>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {boletosEmAbertoRows.length} boleto(s) vencido(s), {selectedCobrancaCount} selecionado(s).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !sendingCobranca && setShowCobrancaModal(false)}
                  disabled={sendingCobranca}
                  className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                  title="Fechar"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="overflow-y-auto p-5">
                {cobrancaFeedback && (
                  <div className={`mb-4 rounded-lg px-4 py-3 text-sm font-semibold ${
                    cobrancaFeedback.type === 'success'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : cobrancaFeedback.type === 'warning'
                        ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300'
                        : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300'
                  }`}>
                    {cobrancaFeedback.text}
                  </div>
                )}

                {boletosEmAbertoRows.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center dark:border-emerald-900/70 dark:bg-emerald-950/30">
                    <CheckCircleIcon className="mx-auto h-9 w-9 text-emerald-500" />
                    <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-300">Nenhum boleto vencido em aberto.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
                    <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-950/40 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        Selecione uma cobrança para enviar
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={selectAllCobrancas}
                          disabled={sendingCobranca}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Selecionar todas
                        </button>
                        <button
                          type="button"
                          onClick={clearCobrancaSelection}
                          disabled={sendingCobranca || selectedCobrancaCount === 0}
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-white disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          Limpar
                        </button>
                      </div>
                    </div>
                    <div className="hidden grid-cols-[44px_1.4fr_120px_120px_1fr_120px_110px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:border-gray-800 dark:bg-gray-950/40 dark:text-gray-400 lg:grid">
                      <span></span>
                      <span>Empresa</span>
                      <span>CNPJ</span>
                      <span>Telefone</span>
                      <span>Número do boleto</span>
                      <span>Vencimento</span>
                      <span className="text-right">Valor</span>
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                      {boletosEmAbertoRows.map((boleto) => {
                        const checked = selectedCobrancaIds.includes(boleto.id);
                        return (
                        <label key={boleto.id} className={`grid cursor-pointer gap-3 px-4 py-4 text-sm transition hover:bg-orange-50/60 dark:hover:bg-orange-950/20 lg:grid-cols-[44px_1.4fr_120px_120px_1fr_120px_110px] lg:items-center ${checked ? 'bg-orange-50/80 dark:bg-orange-950/20' : ''}`}>
                          <span className="flex items-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCobrancaSelection(boleto.id)}
                              disabled={sendingCobranca}
                              className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500 disabled:opacity-50"
                            />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-950 dark:text-gray-100">{boleto.empresa_nome}</p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 lg:hidden">CNPJ: {boleto.empresa_cnpj}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 lg:hidden">Telefone: {boleto.empresa_telefone}</p>
                          </div>
                          <span className="hidden text-gray-600 dark:text-gray-300 lg:block">{boleto.empresa_cnpj}</span>
                          <span className="hidden text-gray-600 dark:text-gray-300 lg:block">{boleto.empresa_telefone}</span>
                          <span className="break-all font-mono text-xs text-gray-700 dark:text-gray-200">{boleto.numero_titulo_cliente || boleto.nosso_numero || '-'}</span>
                          <span className="text-gray-600 dark:text-gray-300">{formatDate(boleto.data_vencimento)}</span>
                          <span className="font-semibold text-gray-950 dark:text-gray-100 lg:text-right">{formatMoney(boleto.valor_original)}</span>
                        </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 border-t border-gray-200 p-5 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Template: <span className="font-semibold text-gray-700 dark:text-gray-200">honorario_cobranca</span> · {selectedCobrancaCount} selecionado(s)
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={cobrancaTestRecipientNumber}
                    onChange={(event) => setCobrancaTestRecipientNumber(event.target.value)}
                    placeholder="Numero de teste"
                    inputMode="tel"
                    disabled={sendingCobranca}
                    className="h-10 rounded-md border border-amber-300 bg-amber-50 px-3 text-sm text-gray-900 outline-none transition placeholder:text-amber-700/70 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 disabled:opacity-60 dark:border-amber-800 dark:bg-amber-950/30 dark:text-gray-100 dark:placeholder:text-amber-300/70 dark:focus:ring-amber-950/50 sm:w-44"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCobrancaModal(false)}
                    disabled={sendingCobranca}
                    className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={handleEnviarCobranca}
                    disabled={sendingCobranca || selectedCobrancaCount === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sendingCobranca ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
                    {sendingCobranca ? 'Enviando...' : 'Enviar cobrança'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default InicioPage;
