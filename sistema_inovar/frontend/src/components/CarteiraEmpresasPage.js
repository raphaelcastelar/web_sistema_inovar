import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  BanknotesIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import {
  buildCompanyStatus,
  getDaysToDue,
  getStatusClasses,
  getTaskDefinitions,
  taskPalette,
} from '../utils/carteiraEmpresas';

const filterOptions = [
  { id: 'acao', label: 'Precisa de ação' },
  { id: 'pendencias', label: 'Com pendências' },
  { id: 'vencendo', label: 'Vencendo' },
  { id: 'em-dia', label: 'Em dia' },
  { id: 'todas', label: 'Todas' },
];

const areaOptions = ['Todas', 'Fiscal', 'Pessoal', 'Financeiro'];

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function formatCnpj(value) {
  return value || 'CNPJ não informado';
}

function getResponsibleName(empresa) {
  return empresa.responsavel_nome || empresa.responsavel || empresa.usuario_responsavel || 'Sem responsável';
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-200 via-violet-200 to-emerald-200 transition-all"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  const toneClass = {
    neutral: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-800',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
    warning: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-950/30 dark:text-orange-300 dark:ring-orange-900',
    attention: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900',
  }[tone || 'neutral'];

  return (
    <div className={`rounded-lg px-4 py-3 ring-1 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

const CarteiraEmpresasPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('acao');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [viewMode, setViewMode] = useState('cards');
  const [updatingIds, setUpdatingIds] = useState([]);

  const userCargo = currentUser?.cargo || 'admin';
  const isSuperuser = Boolean(currentUser?.is_superuser);
  const tasks = useMemo(() => getTaskDefinitions(userCargo, isSuperuser), [userCargo, isSuperuser]);
  const daysToDue = useMemo(() => getDaysToDue(userCargo), [userCargo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [userResponse, empresasResponse] = await Promise.all([
        axiosInstance.get('/api/current-user/'),
        axiosInstance.get('/api/empresas/'),
      ]);
      setCurrentUser(userResponse.data);
      setEmpresas(Array.isArray(empresasResponse.data) ? empresasResponse.data : []);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Não foi possível carregar a carteira de empresas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const empresasComStatus = useMemo(() => (
    empresas.map((empresa) => ({
      empresa,
      status: buildCompanyStatus(empresa, tasks, daysToDue),
    }))
  ), [empresas, tasks, daysToDue]);

  const summary = useMemo(() => {
    const total = empresasComStatus.length;
    const emDia = empresasComStatus.filter((item) => item.status.tone === 'success').length;
    const vencendo = empresasComStatus.filter((item) => item.status.tone === 'warning').length;
    const pendencias = empresasComStatus.filter((item) => ['warning', 'attention'].includes(item.status.tone)).length;

    return { total, emDia, vencendo, pendencias };
  }, [empresasComStatus]);

  const filteredEmpresas = useMemo(() => {
    const term = normalizeText(search);
    const digits = search.replace(/\D/g, '');
    const areaTasks = areaFilter === 'Todas'
      ? tasks
      : tasks.filter((task) => task.area === areaFilter);

    return empresasComStatus
      .filter(({ empresa, status }) => {
        const matchesSearch = !term && !digits
          ? true
          : normalizeText(empresa.nome).includes(term)
            || normalizeText(empresa.cnpj).includes(term)
            || (digits && String(empresa.cnpj || '').replace(/\D/g, '').includes(digits));

        const hasAreaTask = areaFilter === 'Todas' || areaTasks.some((task) => task.key in empresa);

        const matchesStatus = (() => {
          if (statusFilter === 'todas') return true;
          if (statusFilter === 'acao') return ['warning', 'attention'].includes(status.tone);
          if (statusFilter === 'pendencias') return status.pending > 0;
          if (statusFilter === 'vencendo') return status.tone === 'warning';
          if (statusFilter === 'em-dia') return status.tone === 'success';
          return true;
        })();

        return matchesSearch && hasAreaTask && matchesStatus;
      })
      .sort((a, b) => a.status.priority - b.status.priority || a.empresa.nome.localeCompare(b.empresa.nome));
  }, [areaFilter, empresasComStatus, search, statusFilter, tasks]);

  const handleTaskToggle = async (empresa, task) => {
    const id = String(empresa.id);
    if (updatingIds.includes(id)) return;
    const nextValue = !empresa[task.key];

    setUpdatingIds((current) => [...current, id]);
    setEmpresas((current) => current.map((item) => (
      String(item.id) === id ? { ...item, [task.key]: nextValue } : item
    )));

    try {
      const response = await axiosInstance.patch(`/api/empresas/${empresa.id}/`, {
        [task.key]: nextValue,
      });
      setEmpresas((current) => current.map((item) => (
        String(item.id) === id ? { ...item, ...response.data } : item
      )));
    } catch (err) {
      setEmpresas((current) => current.map((item) => (
        String(item.id) === id ? { ...item, [task.key]: !nextValue } : item
      )));
      setError(err?.response?.data?.detail || `Falha ao atualizar ${task.label}.`);
    } finally {
      setUpdatingIds((current) => current.filter((itemId) => itemId !== id));
    }
  };

  const renderTaskPill = (empresa, task) => {
    const done = Boolean(empresa[task.key]);
    return (
      <button
        key={task.key}
        type="button"
        onClick={() => handleTaskToggle(empresa, task)}
        disabled={updatingIds.includes(String(empresa.id))}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${done ? taskPalette.done : taskPalette.pending}`}
      >
        <CheckCircleIcon className="h-3.5 w-3.5" />
        {task.label}
      </button>
    );
  };

  const renderCompanyCard = ({ empresa, status }) => (
    <div key={empresa.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-gray-950 dark:text-gray-100">{empresa.nome}</h2>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClasses(status.tone)}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{formatCnpj(empresa.cnpj)}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{getResponsibleName(empresa)}</p>
        </div>

        <div className="w-full min-w-0 lg:w-56">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{status.done}/{status.total} concluídas</span>
            <span>{status.progress}%</span>
          </div>
          <ProgressBar value={status.progress} />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{status.description}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tasks.map((task) => renderTaskPill(empresa, task))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Link to={`/empresas/${empresa.id}/pastas`} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          <FolderOpenIcon className="h-4 w-4" />
          Pasta
        </Link>
        <Link to="/gerar-das" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          <DocumentArrowDownIcon className="h-4 w-4" />
          DAS
        </Link>
        <Link to="/boletos-por-empresa" className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-gray-200 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">
          <BanknotesIcon className="h-4 w-4" />
          Boletos
        </Link>
        <Link to="/gerenciamento-integrado" className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-900 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
          <Squares2X2Icon className="h-4 w-4" />
          Operar
        </Link>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 text-gray-900 dark:text-gray-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Operação mensal</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-gray-950 dark:text-white">Carteira de Empresas</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Acompanhe obrigações, progresso e próximas ações das empresas atribuídas.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Atribuídas" value={summary.total} />
        <SummaryCard label="Em dia" value={summary.emDia} tone="success" />
        <SummaryCard label="Com pendências" value={summary.pendencias} tone="attention" />
        <SummaryCard label="Vencendo" value={summary.vencendo} tone="warning" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
          <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <MagnifyingGlassIcon className="h-4 w-4" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por empresa ou CNPJ"
              className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setStatusFilter(option.id)}
                className={`h-9 rounded-md px-3 text-xs font-semibold transition-colors ${
                  statusFilter === option.id
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={areaFilter}
              onChange={(event) => setAreaFilter(event.target.value)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              {areaOptions.map((area) => (
                <option key={area} value={area}>{area}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'cards' ? 'tabela' : 'cards')}
              className="h-9 rounded-md border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {viewMode === 'cards' ? 'Tabela' : 'Cards'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          Carregando carteira...
        </div>
      ) : filteredEmpresas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Nenhuma empresa encontrada</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros ou faça uma nova busca.</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid gap-4">
          {filteredEmpresas.map(renderCompanyCard)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Empresa</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progresso</th>
                  <th className="px-4 py-3">Pendências</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredEmpresas.map(({ empresa, status }) => (
                  <tr key={empresa.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-950 dark:text-gray-100">{empresa.nome}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{formatCnpj(empresa.cnpj)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(status.tone)}`}>{status.label}</span>
                    </td>
                    <td className="min-w-48 px-4 py-3">
                      <ProgressBar value={status.progress} />
                      <div className="mt-1 text-xs text-gray-500">{status.progress}%</div>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700 dark:text-gray-200">{status.pending}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link to={`/empresas/${empresa.id}/pastas`} className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800">Pasta</Link>
                        <Link to="/gerenciamento-integrado" className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950">Operar</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarteiraEmpresasPage;
