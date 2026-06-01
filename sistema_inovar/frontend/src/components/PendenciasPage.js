import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { getDaysToDue, getTaskDefinitions } from '../utils/carteiraEmpresas';

const areaOptions = ['Todas', 'Pessoal', 'Fiscal', 'Financeiro'];
const statusOptions = [
  { id: 'vencidas', label: 'Vencidas' },
  { id: 'proximas', label: 'Proximas' },
  { id: 'todas', label: 'Todas' },
];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getTaskDueDay(task, userCargo) {
  if (task.area === 'Fiscal' || userCargo === 'fiscal') return 25;
  return 15;
}

function getCurrentDeadline(task, userCargo, today) {
  return new Date(today.getFullYear(), today.getMonth(), getTaskDueDay(task, userCargo));
}

function getDaysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
}

function getResponsibleName(empresa) {
  return empresa.responsavel_nome || empresa.responsavel || empresa.usuario_responsavel || 'Sem responsavel';
}

function getRiskTone(daysUntilDue, overdue) {
  if (overdue) return 'critical';
  if (daysUntilDue <= 3) return 'warning';
  return 'attention';
}

const toneClasses = {
  critical: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300',
  warning: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300',
  attention: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300',
  neutral: 'border-gray-200 bg-white text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

const StatCard = ({ icon: Icon, label, value, detail, tone = 'neutral' }) => (
  <div className={`rounded-lg border p-4 shadow-sm ${toneClasses[tone]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] opacity-70">{label}</p>
        <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      </div>
      <Icon className="h-6 w-6 shrink-0 opacity-80" />
    </div>
    {detail && <p className="mt-3 text-xs opacity-80">{detail}</p>}
  </div>
);

const PendenciasPage = () => {
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);
  const todayKey = dateKey(today);

  const [empresas, setEmpresas] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('vencidas');
  const [updatingKey, setUpdatingKey] = useState('');

  const userCargo = currentUser?.cargo || 'admin';
  const isSuperuser = Boolean(currentUser?.is_superuser);
  const tasks = useMemo(() => getTaskDefinitions(userCargo, isSuperuser), [userCargo, isSuperuser]);
  const dashboardDaysToDue = useMemo(() => getDaysToDue(userCargo), [userCargo]);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const [userResponse, empresasResponse] = await Promise.all([
        axiosInstance.get('/api/current-user/'),
        axiosInstance.get('/api/empresas/'),
      ]);
      setCurrentUser(userResponse.data);
      setEmpresas(Array.isArray(empresasResponse.data) ? empresasResponse.data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Nao foi possivel carregar as pendencias.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  const allPendencias = useMemo(() => {
    const activeEmpresas = empresas.filter((empresa) => empresa.ativo !== false);

    return activeEmpresas.flatMap((empresa) => (
      tasks
        .filter((task) => !empresa[task.key])
        .map((task) => {
          const deadline = getCurrentDeadline(task, userCargo, today);
          const deadlineKey = dateKey(deadline);
          const daysUntilDue = getDaysBetween(today, deadline);
          const overdue = deadlineKey < todayKey;
          const daysLate = overdue ? Math.abs(daysUntilDue) : 0;
          const tone = getRiskTone(daysUntilDue, overdue);

          return {
            id: `${empresa.id}-${task.key}`,
            empresa,
            task,
            deadline,
            deadlineKey,
            daysUntilDue,
            daysLate,
            overdue,
            tone,
            responsible: getResponsibleName(empresa),
          };
        })
    ));
  }, [empresas, tasks, today, todayKey, userCargo]);

  const vencidas = useMemo(() => (
    allPendencias
      .filter((item) => item.overdue)
      .sort((a, b) => b.daysLate - a.daysLate || a.empresa.nome.localeCompare(b.empresa.nome))
  ), [allPendencias]);

  const proximas = useMemo(() => (
    allPendencias
      .filter((item) => !item.overdue)
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue || a.empresa.nome.localeCompare(b.empresa.nome))
  ), [allPendencias]);

  const filteredPendencias = useMemo(() => {
    const term = normalizeText(search);
    const digits = search.replace(/\D/g, '');
    const source = statusFilter === 'vencidas'
      ? vencidas
      : statusFilter === 'proximas'
        ? proximas
        : allPendencias;

    return source.filter((item) => {
      const matchesArea = areaFilter === 'Todas' || item.task.area === areaFilter;
      const matchesSearch = !term && !digits
        ? true
        : normalizeText(item.empresa.nome).includes(term)
          || normalizeText(item.empresa.cnpj).includes(term)
          || normalizeText(item.task.label).includes(term)
          || normalizeText(item.responsible).includes(term)
          || (digits && String(item.empresa.cnpj || '').replace(/\D/g, '').includes(digits));

      return matchesArea && matchesSearch;
    });
  }, [allPendencias, areaFilter, proximas, search, statusFilter, vencidas]);

  const summaryByArea = useMemo(() => (
    areaOptions
      .filter((area) => area !== 'Todas')
      .map((area) => ({
        area,
        vencidas: vencidas.filter((item) => item.task.area === area).length,
        total: allPendencias.filter((item) => item.task.area === area).length,
      }))
  ), [allPendencias, vencidas]);

  const companiesWithOverdue = new Set(vencidas.map((item) => String(item.empresa.id))).size;
  const mostCriticalCompany = useMemo(() => {
    const byCompany = new Map();
    vencidas.forEach((item) => {
      const key = String(item.empresa.id);
      const current = byCompany.get(key) || { empresa: item.empresa, count: 0, maxLate: 0 };
      current.count += 1;
      current.maxLate = Math.max(current.maxLate, item.daysLate);
      byCompany.set(key, current);
    });

    return Array.from(byCompany.values()).sort((a, b) => (
      b.count - a.count || b.maxLate - a.maxLate || a.empresa.nome.localeCompare(b.empresa.nome)
    ))[0];
  }, [vencidas]);

  const insightText = useMemo(() => {
    if (vencidas.length > 0) {
      const areaCritica = [...summaryByArea].sort((a, b) => b.vencidas - a.vencidas)[0];
      return `${vencidas.length} tarefa(s) ja passaram do vencimento mensal. A maior concentracao esta em ${areaCritica?.area || 'operacao'}.`;
    }

    if (proximas.length > 0) {
      return `Nenhuma tarefa vencida agora. A proxima janela vence em ${Math.max(dashboardDaysToDue, 0)} dia(s), seguindo a mesma data do card do dashboard.`;
    }

    return 'Todas as tarefas atribuídas estao concluidas para a janela atual.';
  }, [dashboardDaysToDue, proximas.length, summaryByArea, vencidas.length]);

  const handleMarkDone = async (item) => {
    setUpdatingKey(item.id);
    setError('');
    const empresaId = String(item.empresa.id);

    setEmpresas((current) => current.map((empresa) => (
      String(empresa.id) === empresaId ? { ...empresa, [item.task.key]: true } : empresa
    )));

    try {
      const response = await axiosInstance.patch(`/api/empresas/${item.empresa.id}/`, {
        [item.task.key]: true,
      });
      setEmpresas((current) => current.map((empresa) => (
        String(empresa.id) === empresaId ? { ...empresa, ...response.data } : empresa
      )));
    } catch (err) {
      setEmpresas((current) => current.map((empresa) => (
        String(empresa.id) === empresaId ? { ...empresa, [item.task.key]: false } : empresa
      )));
      setError(err?.response?.data?.detail || `Falha ao concluir ${item.task.label}.`);
    } finally {
      setUpdatingKey('');
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  };
  const itemVariants = { hidden: { y: 12, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando pendencias...</div>;
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-500">Operacao mensal</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Central de Pendencias</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
            Leitura inteligente das tarefas que ficaram para tras, usando a mesma janela de vencimento mensal do dashboard.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing || updatingKey}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ExclamationTriangleIcon} label="Tarefas vencidas" value={vencidas.length} detail={`${companiesWithOverdue} empresa(s) impactada(s)`} tone={vencidas.length ? 'critical' : 'success'} />
        <StatCard icon={CalendarDaysIcon} label="Data do card" value={`${dashboardDaysToDue} dia(s)`} detail="Mesmo calculo de Dias ate Vencimento" tone={dashboardDaysToDue <= 3 ? 'warning' : 'attention'} />
        <StatCard icon={ClipboardDocumentCheckIcon} label="No radar" value={proximas.length} detail="Pendencias ainda dentro do prazo mensal" tone="attention" />
        <StatCard icon={BuildingOffice2Icon} label="Mais critica" value={mostCriticalCompany?.empresa?.nome || '-'} detail={mostCriticalCompany ? `${mostCriticalCompany.count} tarefa(s) vencida(s)` : 'Sem empresa vencida'} tone={mostCriticalCompany ? 'critical' : 'success'} />
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex gap-3">
          <div className="rounded-md bg-orange-100 p-2.5 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-950 dark:text-white">Insight operacional</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{insightText}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {summaryByArea.map((item) => (
                <button
                  key={item.area}
                  type="button"
                  onClick={() => setAreaFilter(item.area)}
                  className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-left transition hover:bg-white dark:border-gray-800 dark:bg-gray-950/40 dark:hover:bg-gray-900"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{item.area}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{item.vencidas} vencida(s) de {item.total}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-500">Fila de trabalho</p>
            <h2 className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
              {statusOptions.find((option) => option.id === statusFilter)?.label || 'Pendencias'}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {filteredPendencias.length} item(ns) encontrados. Vencimento atual: {tasks.length ? tasks.map((task) => `${task.label} ${formatDate(getCurrentDeadline(task, userCargo, today))}`).join(' | ') : '-'}.
            </p>
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 lg:w-80">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empresa, CNPJ, tarefa ou responsavel"
                className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-orange-300 focus:ring-2 focus:ring-orange-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-orange-950/40"
              />
            </div>
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            >
              {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
            </select>
            <div className="grid grid-cols-3 gap-1 rounded-md bg-gray-100 p-1 dark:bg-gray-950">
              {statusOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded px-3 py-2 text-xs font-bold transition ${
                    statusFilter === option.id
                      ? 'bg-gray-950 text-white shadow-sm dark:bg-gray-100 dark:text-gray-950'
                      : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {filteredPendencias.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <CheckCircleIcon className="mx-auto h-9 w-9 text-emerald-500" />
              <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Nenhuma pendencia para este filtro.</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Troque para Proximas ou Todas para enxergar a preparacao do mes.</p>
            </div>
          ) : (
            filteredPendencias.map((item) => (
              <motion.div
                key={item.id}
                variants={itemVariants}
                className="grid gap-4 px-4 py-4 lg:grid-cols-[1.3fr_160px_170px_150px_140px] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${toneClasses[item.tone]}`}>
                      {item.overdue ? `${item.daysLate} dia(s) atrasada` : `vence em ${item.daysUntilDue} dia(s)`}
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{item.task.area}</span>
                  </div>
                  <Link
                    to={`/empresas/editar/${item.empresa.id}`}
                    className="mt-2 block truncate text-base font-bold text-gray-950 transition hover:text-orange-600 dark:text-white dark:hover:text-orange-300"
                  >
                    {item.empresa.nome}
                  </Link>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.empresa.cnpj || 'CNPJ nao informado'}</p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Tarefa</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{item.task.label}</p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Vencimento</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">{formatDate(item.deadline)}</p>
                </div>

                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Responsavel</p>
                  <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-300">{item.responsible}</p>
                </div>

                <button
                  type="button"
                  onClick={() => handleMarkDone(item)}
                  disabled={updatingKey === item.id}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {updatingKey === item.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  Concluir
                </button>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </motion.div>
  );
};

export default PendenciasPage;
