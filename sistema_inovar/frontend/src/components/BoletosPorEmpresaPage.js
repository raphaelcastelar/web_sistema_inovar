import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';

const statusMeta = {
  registrado: { label: 'Registrado', pill: 'bg-amber-100 text-amber-800 ring-amber-200' },
  pago: { label: 'Pago', pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200' },
  baixado: { label: 'Baixado', pill: 'bg-sky-100 text-sky-800 ring-sky-200' },
  cancelado: { label: 'Cancelado', pill: 'bg-rose-100 text-rose-800 ring-rose-200' },
};

function normalizeRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
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

function buildEmptySummary() {
  return {
    total: 0,
    registrado: 0,
    pago: 0,
    baixado: 0,
    cancelado: 0,
  };
}

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

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError('');
    }
    try {
      const [empresasRes, boletosRes] = await Promise.all([
        axiosInstance.get('/api/empresas/'),
        axiosInstance.get('/api/boletos-bb/', { params: { _ts: Date.now() } }),
      ]);

      const empresasData = Array.isArray(empresasRes.data) ? empresasRes.data : [];
      const boletosData = normalizeRows(boletosRes.data);

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

  useEffect(() => {
    fetchData(true);
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(false), 30000);
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
      const nome = (e.nome || '').toLowerCase();
      const cnpj = (e.cnpj || '').replace(/\D/g, '');
      return nome.includes(term) || (digits && cnpj.includes(digits));
    });
  }, [empresas, searchEmpresa]);

  const empresaSelecionada = useMemo(
    () => empresas.find((e) => String(e.id) === String(selectedEmpresaId)),
    [empresas, selectedEmpresaId]
  );

  const boletosDaEmpresa = useMemo(() => {
    if (!selectedEmpresaId) return [];
    return boletos.filter((b) => String(b.empresa) === String(selectedEmpresaId));
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

  const resumeEmpresaSelecionada = useMemo(() => {
    if (!selectedEmpresaId) return buildEmptySummary();
    return resumoPorEmpresa.get(String(selectedEmpresaId)) || buildEmptySummary();
  }, [resumoPorEmpresa, selectedEmpresaId]);

  const renderStatusPill = (status) => {
    const meta = statusMeta[status] || { label: status || 'desconhecido', pill: 'bg-gray-100 text-gray-700 ring-gray-200' };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold ring-1 ${meta.pill}`}>
        {meta.label}
      </span>
    );
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-4 text-gray-900 dark:text-gray-100 sm:px-6 sm:py-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Boletos por Empresa</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Clique na empresa para acompanhar boletos e status em um so lugar.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Ultima atualizacao: {lastUpdated ? formatDateTime(lastUpdated) : '-'}
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-100">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <div className="mb-2 text-sm font-semibold">Empresas</div>
            <input
              value={searchEmpresa}
              onChange={(e) => setSearchEmpresa(e.target.value)}
              placeholder="Buscar empresa por nome ou CNPJ"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>

          <div className="max-h-[640px] overflow-y-auto p-3">
            {empresasFiltradas.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Nenhuma empresa encontrada.
              </div>
            )}

            <div className="space-y-2">
              {empresasFiltradas.map((empresa) => {
                const summary = resumoPorEmpresa.get(String(empresa.id)) || buildEmptySummary();
                const isActive = String(empresa.id) === String(selectedEmpresaId);
                return (
                  <button
                    key={empresa.id}
                    type="button"
                    onClick={() => setSelectedEmpresaId(String(empresa.id))}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800/70'
                    }`}
                  >
                    <div className="truncate text-sm font-semibold">{empresa.nome}</div>
                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{empresa.cnpj || '-'}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                        Total {summary.total}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{summary.registrado}</span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{summary.pago}</span>
                      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{summary.baixado}</span>
                      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{summary.cancelado}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-gray-800">
            {empresaSelecionada ? (
              <>
                <h2 className="text-xl font-bold">{empresaSelecionada.nome}</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{empresaSelecionada.cnpj || '-'}</p>
              </>
            ) : (
              <h2 className="text-xl font-bold">Selecione uma empresa</h2>
            )}

            <div className="mt-4 grid gap-2 sm:grid-cols-5">
              <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm dark:bg-gray-800">
                <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
                <div className="font-semibold">{resumeEmpresaSelecionada.total}</div>
              </div>
              <div className="rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
                <div className="text-xs">Registrado</div>
                <div className="font-semibold">{resumeEmpresaSelecionada.registrado}</div>
              </div>
              <div className="rounded-xl bg-emerald-100 px-3 py-2 text-sm text-emerald-900">
                <div className="text-xs">Pago</div>
                <div className="font-semibold">{resumeEmpresaSelecionada.pago}</div>
              </div>
              <div className="rounded-xl bg-sky-100 px-3 py-2 text-sm text-sky-900">
                <div className="text-xs">Baixado</div>
                <div className="font-semibold">{resumeEmpresaSelecionada.baixado}</div>
              </div>
              <div className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-900">
                <div className="text-xs">Cancelado</div>
                <div className="font-semibold">{resumeEmpresaSelecionada.cancelado}</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 border-b border-gray-200 px-4 py-3 sm:grid-cols-2 dark:border-gray-800">
            <input
              value={searchBoleto}
              onChange={(e) => setSearchBoleto(e.target.value)}
              placeholder="Buscar boleto por titulo, nosso numero, linha digitavel"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">Todos os status</option>
              <option value="registrado">Registrado</option>
              <option value="pago">Pago</option>
              <option value="baixado">Baixado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Titulo</th>
                  <th className="px-4 py-3 text-left font-semibold">Nosso numero</th>
                  <th className="px-4 py-3 text-left font-semibold">Valor</th>
                  <th className="px-4 py-3 text-left font-semibold">Vencimento</th>
                  <th className="px-4 py-3 text-left font-semibold">Pagamento</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Atualizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {!empresaSelecionada && (
                  <tr>
                    <td colSpan="7" className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      Selecione uma empresa para visualizar os boletos.
                    </td>
                  </tr>
                )}

                {empresaSelecionada && boletosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                      Nenhum boleto encontrado para os filtros aplicados.
                    </td>
                  </tr>
                )}

                {empresaSelecionada && boletosFiltrados.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/70">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{b.numero_titulo_cliente || '-'}</div>
                      <div className="mt-1 max-w-[220px] truncate text-xs text-gray-500 dark:text-gray-400" title={b.linha_digitavel || '-'}>
                        {b.linha_digitavel || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">{b.nosso_numero || '-'}</td>
                    <td className="px-4 py-3">
                      <div>{formatMoney(b.valor_original)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Pago: {formatMoney(b.valor_pago)}</div>
                    </td>
                    <td className="px-4 py-3">{formatDate(b.data_vencimento)}</td>
                    <td className="px-4 py-3">{formatDate(b.data_pagamento)}</td>
                    <td className="px-4 py-3">{renderStatusPill(b.status)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(b.atualizado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};

export default BoletosPorEmpresaPage;
