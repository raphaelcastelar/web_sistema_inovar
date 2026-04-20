import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import { ChevronDownIcon, ChevronRightIcon, ArrowPathIcon, MagnifyingGlassIcon, BuildingOffice2Icon, BanknotesIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

/* ─── Status metadata ──────────────────────────────────────────────────────── */
const statusMeta = {
  registrado: {
    label: 'Registrado',
    dot: 'bg-amber-400',
    pill: 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    card: 'bg-amber-50 text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900',
    bar: 'bg-amber-400',
  },
  pago: {
    label: 'Pago',
    dot: 'bg-emerald-400',
    pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    card: 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-900',
    bar: 'bg-emerald-400',
  },
  baixado: {
    label: 'Baixado',
    dot: 'bg-sky-400',
    pill: 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
    card: 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-950/30 dark:text-sky-200 dark:ring-sky-900',
    bar: 'bg-sky-400',
  },
  cancelado: {
    label: 'Cancelado',
    dot: 'bg-rose-400',
    pill: 'bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900',
    card: 'bg-rose-50 text-rose-900 ring-1 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-200 dark:ring-rose-900',
    bar: 'bg-rose-400',
  },
};

/* ─── Utilities ────────────────────────────────────────────────────────────── */
function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function getBoletoReferenceDateValue(boleto) {
  return boleto?.atualizado_em || boleto?.criado_em || null;
}

function sortBoletosByRecent(a, b) {
  return new Date(getBoletoReferenceDateValue(b)) - new Date(getBoletoReferenceDateValue(a));
}

async function fetchAllBoletosFromApi() {
  try {
    let nextUrl = '/api/boletos-bb/';
    let guard = 0;
    const allRowsMap = new Map();

    const toRelativeApiPath = (url) => {
      if (!url) return null;
      if (url.startsWith('/')) return url;
      // Se vier URL absoluta do DRF (data.next), converte para path relativo.
      try {
        const parsed = new URL(url);
        return `${parsed.pathname}${parsed.search || ''}`;
      } catch (e) {
        return null;
      }
    };

    while (nextUrl && guard < 100) {
      const response = await axiosInstance.get(nextUrl, {
        params: { _ts: Date.now() },
      });

      const data = response?.data;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.results)) {
        data.results.forEach((row) => {
          allRowsMap.set(String(row.id), row);
        });
        nextUrl = toRelativeApiPath(data.next);
        guard += 1;
        continue;
      }

      return normalizeRows(data);
    }

    return Array.from(allRowsMap.values()).sort(sortBoletosByRecent);
  } catch (err) {
    // Fallback seguro: mantém a tela funcionando mesmo se a paginação completa falhar.
    const fallback = await axiosInstance.get('/api/boletos-bb/', {
      params: { _ts: Date.now() },
    });
    return normalizeRows(fallback?.data).sort(sortBoletosByRecent);
  }
}

function formatMoney(v) {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(v) {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('pt-BR');
}

function formatDateTime(v) {
  if (!v) return '-';
  return new Date(v).toLocaleString('pt-BR');
}

function getMonthKey(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey) return '-';
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function buildEmptySummary() {
  return { total: 0, registrado: 0, pago: 0, baixado: 0, cancelado: 0 };
}

/* ─── Sub-components ───────────────────────────────────────────────────────── */
function StatusPill({ status }) {
  const meta = statusMeta[status] || {
    label: status || 'desconhecido',
    dot: 'bg-gray-400',
    pill: 'bg-gray-100 text-gray-700 ring-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function SummaryCard({ label, value, colorClass }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${colorClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-widest opacity-60">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3.5 w-full animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
        </td>
      ))}
    </tr>
  );
}

function EmptyState({ message, icon: Icon = BanknotesIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="rounded-2xl bg-gray-100 p-4 dark:bg-gray-800">
        <Icon className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      </div>
      <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────────────────────── */
const BoletosPorEmpresaPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [boletos, setBoletos] = useState([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
  const [searchEmpresa, setSearchEmpresa] = useState('');
  const [searchBoleto, setSearchBoleto] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [historicoMesesAbertos, setHistoricoMesesAbertos] = useState({});
  const [updatingStatusIds, setUpdatingStatusIds] = useState([]);

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) { setLoading(true); setError(''); }
    try {
      const [empresasRes, boletosData] = await Promise.all([
        axiosInstance.get('/api/empresas/'),
        fetchAllBoletosFromApi(),
      ]);
      const empresasData = Array.isArray(empresasRes.data) ? empresasRes.data : [];
      setEmpresas(empresasData);
      setBoletos(boletosData);
      setLastUpdated(new Date());
      if (!selectedEmpresaId && empresasData.length > 0) {
        const empresaComBoleto = empresasData.find((e) =>
          boletosData.some((b) => String(b.empresa) === String(e.id))
        );
        setSelectedEmpresaId(String((empresaComBoleto || empresasData[0]).id));
      }
    } catch (err) {
      setError(err?.response?.data?.detail || 'Falha ao carregar os boletos por empresa.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedEmpresaId]);

  useEffect(() => { fetchData(true); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(() => fetchData(false), 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const resumoPorEmpresa = useMemo(() => {
    const map = new Map();
    boletos.forEach((b) => {
      const key = String(b.empresa);
      if (!map.has(key)) map.set(key, buildEmptySummary());
      const current = map.get(key);
      current.total += 1;
      if (statusMeta[b.status]) current[b.status] += 1;
    });
    return map;
  }, [boletos]);

  const empresasFiltradas = useMemo(() => {
    const term = searchEmpresa.trim().toLowerCase();
    const digits = searchEmpresa.replace(/\D/g, '');
    return empresas.filter((e) => {
      if (!term && !digits) return true;
      return (e.nome || '').toLowerCase().includes(term) || (digits && (e.cnpj || '').replace(/\D/g, '').includes(digits));
    });
  }, [empresas, searchEmpresa]);

  const empresaSelecionada = useMemo(
    () => empresas.find((e) => String(e.id) === String(selectedEmpresaId)),
    [empresas, selectedEmpresaId]
  );

  const boletosDaEmpresa = useMemo(() => {
    if (!selectedEmpresaId) return [];
    return boletos
      .filter((b) => String(b.empresa) === String(selectedEmpresaId))
      .sort(sortBoletosByRecent);
  }, [boletos, selectedEmpresaId]);

  const boletosFiltrados = useMemo(() => {
    const term = searchBoleto.trim().toLowerCase();
    const digits = searchBoleto.replace(/\D/g, '');
    return boletosDaEmpresa.filter((b) => {
      const matchStatus = !statusFilter || b.status === statusFilter;
      const matchSearch =
        !term ||
        String(b.numero_titulo_cliente || '').toLowerCase().includes(term) ||
        String(b.nosso_numero || '').toLowerCase().includes(term) ||
        String(b.numero_operacao || '').toLowerCase().includes(term) ||
        String(b.linha_digitavel || '').replace(/\D/g, '').includes(digits) ||
        String(b.codigo_barra || '').replace(/\D/g, '').includes(digits);
      return matchStatus && matchSearch;
    });
  }, [boletosDaEmpresa, searchBoleto, statusFilter]);

  const mesAtualKey = useMemo(() => getMonthKey(new Date()), []);
  const anoAtual = useMemo(() => new Date().getFullYear(), []);

  const boletosMesAtual = useMemo(
    () => boletosFiltrados.filter((b) => getMonthKey(getBoletoReferenceDateValue(b)) === mesAtualKey),
    [boletosFiltrados, mesAtualKey]
  );

  const boletosHistoricoPorMes = useMemo(() => {
    const groups = {};
    boletosFiltrados.forEach((b) => {
      const monthKey = getMonthKey(getBoletoReferenceDateValue(b));
      if (!monthKey || monthKey === mesAtualKey || !monthKey.startsWith(`${anoAtual}-`)) return;
      if (!groups[monthKey]) groups[monthKey] = [];
      groups[monthKey].push(b);
    });
    const currentMonth = new Date().getMonth() + 1;
    const previousMonthsKeys = [];
    for (let month = currentMonth - 1; month >= 1; month -= 1) {
      previousMonthsKeys.push(`${anoAtual}-${String(month).padStart(2, '0')}`);
    }
    return previousMonthsKeys.map((monthKey) => ({
      monthKey,
      label: formatMonthLabel(monthKey),
      boletos: (groups[monthKey] || []).sort(sortBoletosByRecent),
    }));
  }, [boletosFiltrados, mesAtualKey, anoAtual]);

  const boletosOutrosPeriodos = useMemo(
    () => boletosFiltrados.filter((b) => {
      const monthKey = getMonthKey(getBoletoReferenceDateValue(b));
      return !monthKey || (!monthKey.startsWith(`${anoAtual}-`) && monthKey !== mesAtualKey);
    }),
    [anoAtual, boletosFiltrados, mesAtualKey]
  );

  useEffect(() => { setHistoricoMesesAbertos({}); }, [selectedEmpresaId]);

  const resumeEmpresaSelecionada = useMemo(() => {
    if (!selectedEmpresaId) return buildEmptySummary();
    return resumoPorEmpresa.get(String(selectedEmpresaId)) || buildEmptySummary();
  }, [resumoPorEmpresa, selectedEmpresaId]);

  const handleStatusChange = async (boletoId, nextStatus) => {
    const id = String(boletoId);
    setUpdatingStatusIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setError('');

    try {
      const response = await axiosInstance.patch(`/api/boletos-bb/${boletoId}/`, {
        status: nextStatus,
      });
      const updatedBoleto = response.data;

      setBoletos((prev) => prev.map((boleto) => (
        String(boleto.id) === id ? updatedBoleto : boleto
      )));
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Falha ao atualizar o status do boleto.');
    } finally {
      setUpdatingStatusIds((prev) => prev.filter((currentId) => currentId !== id));
    }
  };

  /* ─── Table renderer ─────────────────────────────────────────────────────── */
  const renderBoletosTable = (rows, emptyMessage) => (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            {['Título', 'Nosso número', 'Valor', 'Vencimento', 'Pagamento', 'Status', 'Atualizado'].map((h) => (
              <th key={h} className="px-5 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {loading && rows.length === 0 && (
            <>
              <SkeletonRow /><SkeletonRow /><SkeletonRow />
            </>
          )}

          {!loading && !empresaSelecionada && (
            <tr>
              <td colSpan="7">
                <EmptyState message="Selecione uma empresa para visualizar os boletos." icon={BuildingOffice2Icon} />
              </td>
            </tr>
          )}

          {!loading && empresaSelecionada && rows.length === 0 && (
            <tr>
              <td colSpan="7">
                <EmptyState message={emptyMessage} />
              </td>
            </tr>
          )}

          {empresaSelecionada && rows.map((b, idx) => (
            <tr
              key={b.id}
              className="group transition-colors hover:bg-indigo-50/60 dark:hover:bg-indigo-950/20"
              style={{ animationDelay: `${idx * 20}ms` }}
            >
              <td className="px-5 py-3.5">
                <div className="font-semibold text-gray-900 dark:text-gray-100">{b.numero_titulo_cliente || '-'}</div>
                <div className="mt-0.5 max-w-[200px] truncate font-mono text-[11px] text-gray-400 dark:text-gray-500" title={b.linha_digitavel || '-'}>
                  {b.linha_digitavel || '-'}
                </div>
              </td>
              <td className="px-5 py-3.5 font-mono text-xs text-gray-700 dark:text-gray-300">{b.nosso_numero || '-'}</td>
              <td className="px-5 py-3.5">
                <div className="font-semibold text-gray-900 dark:text-gray-100">{formatMoney(b.valor_original)}</div>
                {b.valor_pago && (
                  <div className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">↳ {formatMoney(b.valor_pago)}</div>
                )}
              </td>
              <td className="px-5 py-3.5 tabular-nums text-gray-700 dark:text-gray-300">{formatDate(b.data_vencimento)}</td>
              <td className="px-5 py-3.5 tabular-nums text-gray-700 dark:text-gray-300">{formatDate(b.data_pagamento)}</td>
              <td className="px-5 py-3.5">
                <div className="flex min-w-[150px] flex-col gap-2">
                  <StatusPill status={b.status} />
                  <select
                    value={b.status || ''}
                    onChange={(e) => handleStatusChange(b.id, e.target.value)}
                    disabled={updatingStatusIds.includes(String(b.id))}
                    className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-900/40"
                    title="Alterar status do boleto"
                  >
                    {Object.entries(statusMeta).map(([statusKey, meta]) => (
                      <option key={statusKey} value={statusKey}>{meta.label}</option>
                    ))}
                  </select>
                </div>
              </td>
              <td className="px-5 py-3.5 text-[11px] text-gray-400 dark:text-gray-500">{formatDateTime(b.atualizado_em)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /* ─── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 text-gray-900 dark:text-gray-100 sm:px-6 lg:px-8">

      {/* ── Page header ── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
              <BanknotesIcon className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Boletos por Empresa</h1>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Acompanhe todos os boletos registrados, organizados por empresa e período.
          </p>
        </div>

        <div className="flex flex-col items-end gap-1.5">
          <button
            onClick={() => fetchData(true)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          {lastUpdated && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              Atualizado às {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3.5 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-200">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── Main layout ── */}
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">

        {/* ── Sidebar: empresa list ── */}
        <aside className="flex flex-col gap-0 self-start overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-900">
          {/* Sidebar header */}
          <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3.5 dark:border-gray-800 dark:bg-gray-800/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Empresas</span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                {empresasFiltradas.length}
              </span>
            </div>
            <div className="relative mt-3">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchEmpresa}
                onChange={(e) => setSearchEmpresa(e.target.value)}
                placeholder="Nome ou CNPJ…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-900/40"
              />
            </div>
          </div>

          {/* Empresa list */}
          <div className="max-h-[600px] overflow-y-auto p-3 scrollbar-thin">
            {empresasFiltradas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <BuildingOffice2Icon className="h-8 w-8 text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-400 dark:text-gray-500">Nenhuma empresa encontrada.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {empresasFiltradas.map((empresa) => {
                  const summary = resumoPorEmpresa.get(String(empresa.id)) || buildEmptySummary();
                  const isActive = String(empresa.id) === String(selectedEmpresaId);
                  const hasData = summary.total > 0;

                  return (
                    <button
                      key={empresa.id}
                      type="button"
                      onClick={() => setSelectedEmpresaId(String(empresa.id))}
                      className={`group w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-150 ${
                        isActive
                          ? 'border-indigo-300 bg-indigo-50 shadow-sm dark:border-indigo-600/60 dark:bg-indigo-950/40'
                          : 'border-transparent hover:border-gray-200 hover:bg-gray-50/80 dark:hover:border-gray-700 dark:hover:bg-gray-800/60'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          isActive ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                        }`}>
                          {(empresa.nome || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate text-sm font-semibold ${isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-800 dark:text-gray-200'}`}>
                            {empresa.nome}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-gray-400">{empresa.cnpj || '—'}</div>
                        </div>
                      </div>

                      {hasData && (
                        <div className="mt-3 space-y-1.5">
                          {/* Progress bar breakdown */}
                          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            {(['pago', 'registrado', 'baixado', 'cancelado']).map((s) => {
                              const pct = summary.total > 0 ? (summary[s] / summary.total) * 100 : 0;
                              return pct > 0 ? (
                                <div
                                  key={s}
                                  style={{ width: `${pct}%` }}
                                  className={`h-full ${statusMeta[s].bar}`}
                                  title={`${statusMeta[s].label}: ${summary[s]}`}
                                />
                              ) : null;
                            })}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
                            <span className="font-semibold text-gray-600 dark:text-gray-300">{summary.total} boletos</span>
                            {summary.registrado > 0 && <span className="text-amber-700 dark:text-amber-400">{summary.registrado} reg.</span>}
                            {summary.pago > 0 && <span className="text-emerald-700 dark:text-emerald-400">{summary.pago} pago</span>}
                            {summary.baixado > 0 && <span className="text-sky-700 dark:text-sky-400">{summary.baixado} baix.</span>}
                            {summary.cancelado > 0 && <span className="text-rose-700 dark:text-rose-400">{summary.cancelado} canc.</span>}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* ── Main panel ── */}
        <main className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700/80 dark:bg-gray-900">

          {/* Company header */}
          <div className="border-b border-gray-100 px-6 py-5 dark:border-gray-800">
            {empresaSelecionada ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold leading-tight">{empresaSelecionada.nome}</h2>
                  <p className="mt-0.5 font-mono text-sm text-gray-500 dark:text-gray-400">{empresaSelecionada.cnpj || '—'}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-gray-400">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow shadow-emerald-400/60" />
                  Sincronizado
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <BuildingOffice2Icon className="h-6 w-6 text-gray-300 dark:text-gray-600" />
                <h2 className="text-lg font-semibold text-gray-400 dark:text-gray-500">Selecione uma empresa</h2>
              </div>
            )}

            {/* Summary cards */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
              <SummaryCard
                label="Total"
                value={resumeEmpresaSelecionada.total}
                colorClass="bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
              />
              <SummaryCard label="Registrado" value={resumeEmpresaSelecionada.registrado} colorClass={statusMeta.registrado.card} />
              <SummaryCard label="Pago" value={resumeEmpresaSelecionada.pago} colorClass={statusMeta.pago.card} />
              <SummaryCard label="Baixado" value={resumeEmpresaSelecionada.baixado} colorClass={statusMeta.baixado.card} />
              <SummaryCard label="Cancelado" value={resumeEmpresaSelecionada.cancelado} colorClass={statusMeta.cancelado.card} />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 px-6 py-3.5 sm:flex-row dark:border-gray-800 dark:bg-gray-800/30">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={searchBoleto}
                onChange={(e) => setSearchBoleto(e.target.value)}
                placeholder="Título, nosso número, linha digitável…"
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-indigo-900/40"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Todos os status</option>
              {Object.entries(statusMeta).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {/* Current month section */}
          <div className="border-b border-gray-100 px-6 py-3 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-indigo-500" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  Mês atual
                </h3>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {boletosMesAtual.length} boleto{boletosMesAtual.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {renderBoletosTable(boletosMesAtual, 'Nenhum boleto gerado no mês atual para os filtros aplicados.')}

          {/* History section */}
          <div className="border-t border-gray-100 px-6 py-4 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-gray-400" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                Histórico — {anoAtual}
              </h3>
            </div>
          </div>

          <div className="space-y-2 px-4 pb-6">
            {empresaSelecionada && boletosHistoricoPorMes.length === 0 && (
              <EmptyState message="Ainda não existem meses anteriores neste ano para exibição." />
            )}

            {boletosHistoricoPorMes.map((group) => {
              const isOpen = Boolean(historicoMesesAbertos[group.monthKey]);
              const hasContent = group.boletos.length > 0;

              return (
                <div
                  key={group.monthKey}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    isOpen
                      ? 'border-indigo-200 dark:border-indigo-800/60'
                      : 'border-gray-200 dark:border-gray-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setHistoricoMesesAbertos((prev) => ({
                        ...prev,
                        [group.monthKey]: !prev[group.monthKey],
                      }))
                    }
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                      isOpen
                        ? 'bg-indigo-50 dark:bg-indigo-950/30'
                        : 'bg-white hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {isOpen
                        ? <ChevronDownIcon className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
                        : <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                      }
                      <span className={`text-sm font-semibold capitalize ${
                        isOpen ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {group.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {hasContent ? (
                        <div className="flex gap-1">
                          {(['pago', 'registrado', 'baixado', 'cancelado']).map((s) => {
                            const count = group.boletos.filter((b) => b.status === s).length;
                            return count > 0 ? (
                              <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${statusMeta[s].pill}`}>
                                {count}
                              </span>
                            ) : null;
                          })}
                        </div>
                      ) : (
                        <span className="rounded-full bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-400 ring-1 ring-gray-100 dark:bg-gray-800/50 dark:text-gray-500 dark:ring-gray-800">
                          0
                        </span>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-indigo-100 bg-white dark:border-indigo-900/40 dark:bg-gray-900">
                      {renderBoletosTable(group.boletos, 'Nenhum boleto encontrado neste mês.')}
                    </div>
                  )}
                </div>
              );
            })}

            {empresaSelecionada && boletosOutrosPeriodos.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 dark:bg-gray-900">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Outros periodos</span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {boletosOutrosPeriodos.length}
                  </span>
                </div>
                <div className="border-t border-gray-100 dark:border-gray-800">
                  {renderBoletosTable(boletosOutrosPeriodos, 'Nenhum boleto encontrado em outros periodos.')}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default BoletosPorEmpresaPage;
