import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PaperAirplaneIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const MONTHS = [
  { value: '01', short: 'Jan', label: 'Janeiro' },
  { value: '02', short: 'Fev', label: 'Fevereiro' },
  { value: '03', short: 'Mar', label: 'Marco' },
  { value: '04', short: 'Abr', label: 'Abril' },
  { value: '05', short: 'Mai', label: 'Maio' },
  { value: '06', short: 'Jun', label: 'Junho' },
  { value: '07', short: 'Jul', label: 'Julho' },
  { value: '08', short: 'Ago', label: 'Agosto' },
  { value: '09', short: 'Set', label: 'Setembro' },
  { value: '10', short: 'Out', label: 'Outubro' },
  { value: '11', short: 'Nov', label: 'Novembro' },
  { value: '12', short: 'Dez', label: 'Dezembro' },
];

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
  } catch {
    return null;
  }
}

async function fetchAllBoletos() {
  let nextUrl = '/api/boletos-bb/';
  let guard = 0;
  const allRowsMap = new Map();

  while (nextUrl && guard < 100) {
    const response = await axiosInstance.get(nextUrl, { params: { _ts: Date.now() } });
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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return dateKey(parsed);
}

function formatMoney(value) {
  const numericValue = Number(value || 0);
  return numericValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  const key = dateOnlyKey(value);
  if (!key) return '-';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('pt-BR');
}

function makePeriodo(year, month) {
  return `${year}-${month}`;
}

function buildSearchText(row) {
  return [
    row.empresa_nome,
    row.empresa_cnpj,
    row.empresa_telefone,
    row.numero_titulo_cliente,
    row.nosso_numero,
    row.linha_digitavel,
  ].filter(Boolean).join(' ').toLowerCase();
}

const StatTile = ({ icon: Icon, label, value, detail }) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-3 text-2xl font-bold text-gray-950 dark:text-white">{value}</p>
      </div>
      <div className="rounded-md bg-rose-100 p-2.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
        <Icon className="h-5 w-5" />
      </div>
    </div>
    {detail && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
  </div>
);

const InadimplenciaBoletosPage = () => {
  const today = useMemo(() => new Date(), []);
  const currentYear = today.getFullYear();
  const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
  const todayKey = dateKey(today);

  const [boletos, setBoletos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    setFeedback(null);

    try {
      const [boletosData, empresasResponse] = await Promise.all([
        fetchAllBoletos(),
        axiosInstance.get('/api/empresas/'),
      ]);
      setBoletos(boletosData);
      setEmpresas(Array.isArray(empresasResponse.data) ? empresasResponse.data : []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || 'Nao foi possivel carregar a inadimplencia.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const empresasById = useMemo(() => (
    new Map(empresas.map((empresa) => [String(empresa.id), empresa]))
  ), [empresas]);

  const enrichedBoletos = useMemo(() => (
    boletos.map((boleto) => {
      const empresa = empresasById.get(String(boleto.empresa)) || {};
      return {
        ...boleto,
        vencimento_key: dateOnlyKey(boleto.data_vencimento),
        valor_numeric: Number(boleto.valor_original || 0),
        empresa_nome: boleto.empresa_nome || empresa.nome || 'Empresa nao identificada',
        empresa_cnpj: empresa.cnpj || '-',
        empresa_telefone: empresa.telefone || '-',
      };
    })
  ), [boletos, empresasById]);

  const inadimplentesAno = useMemo(() => (
    enrichedBoletos.filter((boleto) => (
      boleto.status === 'registrado'
      && boleto.vencimento_key
      && boleto.vencimento_key.startsWith(`${selectedYear}-`)
      && boleto.vencimento_key < todayKey
    ))
  ), [enrichedBoletos, selectedYear, todayKey]);

  const monthSummaries = useMemo(() => (
    MONTHS.map((month) => {
      const periodo = makePeriodo(selectedYear, month.value);
      const rows = inadimplentesAno.filter((boleto) => boleto.vencimento_key.startsWith(periodo));
      const total = rows.reduce((sum, boleto) => sum + boleto.valor_numeric, 0);
      const empresasCount = new Set(rows.map((boleto) => String(boleto.empresa))).size;
      return { ...month, periodo, rows, total, empresasCount };
    })
  ), [inadimplentesAno, selectedYear]);

  const selectedPeriodo = makePeriodo(selectedYear, selectedMonth);
  const selectedMonthSummary = monthSummaries.find((month) => month.value === selectedMonth) || monthSummaries[0];
  const selectedMonthRows = useMemo(() => (
    inadimplentesAno
      .filter((boleto) => boleto.vencimento_key.startsWith(selectedPeriodo))
      .sort((a, b) => a.empresa_nome.localeCompare(b.empresa_nome) || a.vencimento_key.localeCompare(b.vencimento_key))
  ), [inadimplentesAno, selectedPeriodo]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return selectedMonthRows;
    const searchDigits = search.replace(/\D/g, '');
    return selectedMonthRows.filter((boleto) => (
      buildSearchText(boleto).includes(normalizedSearch)
      || (searchDigits && buildSearchText(boleto).replace(/\D/g, '').includes(searchDigits))
    ));
  }, [search, selectedMonthRows]);

  useEffect(() => {
    setSelectedIds(selectedMonthRows.map((boleto) => boleto.id));
    setFeedback(null);
  }, [selectedPeriodo, selectedMonthRows]);

  const totalAno = inadimplentesAno.reduce((sum, boleto) => sum + boleto.valor_numeric, 0);
  const empresasAno = new Set(inadimplentesAno.map((boleto) => String(boleto.empresa))).size;
  const worstMonth = monthSummaries.reduce((winner, month) => (
    month.total > (winner?.total || 0) ? month : winner
  ), null);
  const ticketMedio = inadimplentesAno.length ? totalAno / inadimplentesAno.length : 0;

  const yearOptions = useMemo(() => {
    const years = new Set([String(currentYear), String(currentYear - 1), String(currentYear - 2)]);
    enrichedBoletos.forEach((boleto) => {
      if (boleto.vencimento_key) years.add(boleto.vencimento_key.slice(0, 4));
    });
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [currentYear, enrichedBoletos]);

  const toggleSelected = (boletoId) => {
    setSelectedIds((prev) => (
      prev.includes(boletoId)
        ? prev.filter((id) => id !== boletoId)
        : [...prev, boletoId]
    ));
  };

  const selectFilteredRows = () => {
    setSelectedIds(filteredRows.map((boleto) => boleto.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const handleEnviarCobranca = async () => {
    if (selectedIds.length === 0) return;
    setSending(true);
    setFeedback(null);

    try {
      const response = await axiosInstance.post('/api/boletos-bb/enviar-cobranca/', {
        boleto_ids: selectedIds,
        periodo_vencimento: selectedPeriodo,
      });
      const successCount = response.data?.success_count ?? 0;
      const failedCount = response.data?.failed_count ?? 0;
      setFeedback({
        type: failedCount > 0 ? 'warning' : 'success',
        text: `${successCount} cobranca(s) enviada(s). ${failedCount} falha(s).`,
      });
    } catch (err) {
      const data = err?.response?.data;
      setFeedback({
        type: 'error',
        text: data?.error || 'Falha ao enviar as cobrancas selecionadas.',
      });
    } finally {
      setSending(false);
    }
  };

  const handleExportarExcel = async () => {
    setExporting(true);
    setFeedback(null);

    try {
      const reportPeriodo = makePeriodo(selectedYear, selectedMonth);
      const response = await axiosInstance.get(`/api/boletos-bb/relatorio-em-aberto/?periodo_vencimento=${encodeURIComponent(reportPeriodo)}&ano=${encodeURIComponent(selectedYear)}&mes=${encodeURIComponent(selectedMonth)}`, {
        responseType: 'blob',
      });
      const contentDisposition = response.headers?.['content-disposition'] || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || `relatorio_boletos_em_aberto_${reportPeriodo.replace('-', '_')}.xlsx`;
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setFeedback({
        type: 'success',
        text: `Relatorio Excel de ${selectedMonthSummary?.label || selectedMonth}/${selectedYear} gerado com sucesso.`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: 'Falha ao gerar o relatorio Excel de boletos em aberto.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-rose-500">Financeiro</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Inadimplencia de boletos</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
            Acompanhe os boletos vencidos do ano, entenda a concentracao por mes e envie cobrancas por periodo.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Ultima atualizacao: {lastUpdated ? formatDateTime(lastUpdated) : '-'}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={selectedYear}
            onChange={(event) => setSelectedYear(event.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            aria-label="Selecionar ano"
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            aria-label="Selecionar mes"
          >
            {MONTHS.map((month) => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadData}
            disabled={loading || sending || exporting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleExportarExcel}
            disabled={loading || exporting}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DocumentArrowDownIcon className="h-4 w-4" />}
            {exporting ? 'Gerando...' : 'Excel boletos em aberto'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={BanknotesIcon} label="Total vencido" value={formatMoney(totalAno)} detail={`${inadimplentesAno.length} boleto(s) em aberto no ano`} />
        <StatTile icon={UserGroupIcon} label="Empresas inadimplentes" value={empresasAno} detail="Clientes com pelo menos um boleto vencido" />
        <StatTile icon={CalendarDaysIcon} label="Mes mais critico" value={worstMonth?.total ? worstMonth.short : '-'} detail={worstMonth?.total ? `${formatMoney(worstMonth.total)} em ${worstMonth.rows.length} boleto(s)` : 'Sem inadimplencia no ano'} />
        <StatTile icon={ExclamationTriangleIcon} label="Ticket medio" value={formatMoney(ticketMedio)} detail="Media dos boletos vencidos em aberto" />
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-950 dark:text-white">Mapa mensal da inadimplencia</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Clique em um mes para abrir a carteira vencida daquele periodo.</p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">Vencimento no ano {selectedYear}</p>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {monthSummaries.map((month) => {
            const active = selectedMonth === month.value;
            const intensity = month.total > 0 ? Math.min(100, Math.round((month.total / (worstMonth?.total || month.total)) * 100)) : 0;
            return (
              <button
                key={month.value}
                type="button"
                onClick={() => setSelectedMonth(month.value)}
                className={`min-h-[116px] rounded-lg border p-3 text-left transition ${
                  active
                    ? 'border-rose-400 bg-rose-50 shadow-sm dark:border-rose-700 dark:bg-rose-950/30'
                    : 'border-gray-200 bg-gray-50 hover:border-rose-200 hover:bg-white dark:border-gray-800 dark:bg-gray-950/40 dark:hover:border-rose-900/70 dark:hover:bg-gray-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-bold text-gray-950 dark:text-white">{month.label}</span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-gray-600 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-700">
                    {month.rows.length}
                  </span>
                </div>
                <p className="mt-3 text-lg font-bold text-rose-700 dark:text-rose-300">{formatMoney(month.total)}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{month.empresasCount} empresa(s)</p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                  <div className="h-full rounded-full bg-rose-500" style={{ width: `${intensity}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 border-b border-gray-200 p-4 dark:border-gray-800 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-500">Periodo selecionado</p>
            <h2 className="mt-1 text-xl font-bold text-gray-950 dark:text-white">
              {selectedMonthSummary?.label || '-'} de {selectedYear}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {filteredRows.length} boleto(s) visivel(is), {selectedIds.length} selecionado(s), {formatMoney(selectedMonthSummary?.total || 0)} no mes.
            </p>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-0 md:w-80">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar empresa, CNPJ, telefone ou boleto"
                className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-rose-300 focus:ring-2 focus:ring-rose-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-rose-950/40"
              />
            </div>
            <button
              type="button"
              onClick={selectFilteredRows}
              disabled={filteredRows.length === 0 || sending || exporting}
              className="h-10 rounded-md border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Selecionar visiveis
            </button>
            <button
              type="button"
              onClick={clearSelection}
              disabled={selectedIds.length === 0 || sending || exporting}
              className="h-10 rounded-md border border-gray-200 px-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              Limpar selecao
            </button>
            <button
              type="button"
              onClick={handleEnviarCobranca}
              disabled={selectedIds.length === 0 || sending || exporting}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PaperAirplaneIcon className="h-4 w-4" />}
              {sending ? 'Enviando...' : 'Cobrar selecionados'}
            </button>
          </div>
        </div>

        {feedback && (
          <div className={`mx-4 mt-4 rounded-lg px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300'
              : feedback.type === 'warning'
                ? 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300'
                : 'border border-red-200 bg-red-50 text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300'
          }`}>
            {feedback.text}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:bg-gray-950/50 dark:text-gray-400">
              <tr>
                <th className="w-12 px-4 py-3 text-left"></th>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-left">Contato</th>
                <th className="px-4 py-3 text-left">Boleto</th>
                <th className="px-4 py-3 text-left">Vencimento</th>
                <th className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</td>
                </tr>
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-10 text-center">
                    <CheckCircleIcon className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Nenhum inadimplente neste periodo.</p>
                  </td>
                </tr>
              )}
              {!loading && filteredRows.map((boleto) => {
                const checked = selectedIds.includes(boleto.id);
                return (
                  <tr key={boleto.id} className={checked ? 'bg-rose-50/70 dark:bg-rose-950/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(boleto.id)}
                        className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-[300px] truncate font-semibold text-gray-950 dark:text-gray-100">{boleto.empresa_nome}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{boleto.empresa_cnpj}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{boleto.empresa_telefone}</td>
                    <td className="px-4 py-3">
                      <p className="break-all font-mono text-xs text-gray-800 dark:text-gray-200">{boleto.numero_titulo_cliente || boleto.nosso_numero || '-'}</p>
                      <p className="mt-1 max-w-[280px] truncate text-xs text-gray-500 dark:text-gray-400" title={boleto.linha_digitavel || ''}>{boleto.linha_digitavel || '-'}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(boleto.data_vencimento)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-950 dark:text-white">{formatMoney(boleto.valor_original)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default InadimplenciaBoletosPage;
