import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';

const statusColors = {
  registrado: 'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200',
  pago: 'bg-green-100 text-green-800 ring-1 ring-green-200',
  baixado: 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  cancelado: 'bg-red-100 text-red-800 ring-1 ring-red-200',
};

function formatMoney(v) {
  if (v === null || v === undefined) return '-';
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('pt-BR');
}

function formatDateTime(d) {
  if (!d) return '-';
  return new Date(d).toLocaleString('pt-BR');
}

function normalizeBoletosResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

const BoletoMonitorPage = () => {
  const [boletos, setBoletos] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [filters, setFilters] = useState({ search: '', status: '', empresa_id: '' });

  const fetchEmpresas = useCallback(async () => {
    try {
      const res = await axiosInstance.get('/api/empresas/');
      setEmpresas(res.data || []);
    } catch (err) {
      console.error('Erro ao carregar empresas', err);
    }
  }, []);

  const fetchBoletos = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setLoading(true);
      setError(null);
    }

    try {
      const params = {};
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;
      if (filters.empresa_id) params.empresa_id = filters.empresa_id;
      params._ts = Date.now(); // Evita cache e força retorno atualizado.

      const res = await axiosInstance.get('/api/boletos-bb/', { params });
      setBoletos(normalizeBoletosResponse(res.data));
      setLastUpdated(new Date());
    } catch (err) {
      setError(err?.response?.data?.detail || 'Falha ao carregar boletos.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchEmpresas();
  }, [fetchEmpresas]);

  useEffect(() => {
    fetchBoletos(true);
  }, [fetchBoletos]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchBoletos(false);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [fetchBoletos]);

  const filteredLabel = useMemo(() => {
    const parts = [];
    if (filters.status) parts.push(`Status: ${filters.status}`);
    if (filters.empresa_id) {
      const emp = empresas.find((e) => String(e.id) === String(filters.empresa_id));
      if (emp) parts.push(`Empresa: ${emp.nome}`);
    }
    if (filters.search) parts.push(`Busca: ${filters.search}`);
    return parts.join(' • ') || 'Todos os boletos';
  }, [filters, empresas]);

  const handleChange = (e) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const statusBadge = (status) => {
    const cls = statusColors[status] || 'bg-gray-100 text-gray-800 ring-1 ring-gray-200';
    return <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cls}`}>{status || 'desconhecido'}</span>;
  };

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor de Boletos BB</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">Acompanhe registro, baixa e pagamento por empresa.</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Última atualização: {lastUpdated ? formatDateTime(lastUpdated) : '-'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fetchBoletos(true)}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Buscar</label>
          <input
            name="search"
            value={filters.search}
            onChange={handleChange}
            placeholder="Nosso número, título, linha digitável ou empresa"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
          <select
            name="status"
            value={filters.status}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todos</option>
            <option value="registrado">Registrado</option>
            <option value="pago">Pago</option>
            <option value="baixado">Baixado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresa</label>
          <select
            name="empresa_id"
            value={filters.empresa_id}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 px-3 py-2 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">{filteredLabel}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{boletos.length} resultados</div>
        </div>

        {error && <div className="px-4 py-3 text-sm text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-100 border-b border-red-200 dark:border-red-800">{error}</div>}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Empresa</th>
                <th className="px-4 py-3 text-left font-semibold">Título / Nosso Nº</th>
                <th className="px-4 py-3 text-left font-semibold">Valor</th>
                <th className="px-4 py-3 text-left font-semibold">Vencimento</th>
                <th className="px-4 py-3 text-left font-semibold">Pagamento</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Operação / Convênio</th>
                <th className="px-4 py-3 text-left font-semibold">Linha Digitável / Código</th>
                <th className="px-4 py-3 text-left font-semibold">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading && (
                <tr>
                  <td colSpan="9" className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && boletos.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-4 py-6 text-center text-gray-500 dark:text-gray-400">
                    Nenhum boleto encontrado.
                  </td>
                </tr>
              )}
              {!loading &&
                boletos.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{b.empresa_nome}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">ID {b.empresa}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-900 dark:text-gray-100 font-semibold">{b.numero_titulo_cliente || '-'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Nosso nº: {b.nosso_numero || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{formatMoney(b.valor_original)}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">Pago: {formatMoney(b.valor_pago)}</div>
                    </td>
                    <td className="px-4 py-3">{formatDate(b.data_vencimento)}</td>
                    <td className="px-4 py-3">{formatDate(b.data_pagamento)}</td>
                    <td className="px-4 py-3">{statusBadge(b.status)}</td>
                    <td className="px-4 py-3">
                      <div>Operação: {b.numero_operacao || '-'}</div>
                      <div>Convênio: {b.numero_convenio || '-'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Cart/Var: {b.carteira || '-'} / {b.variacao_carteira || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[280px] truncate" title={b.linha_digitavel || '-'}>
                        {b.linha_digitavel || '-'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[280px] truncate" title={b.codigo_barra || '-'}>
                        {b.codigo_barra || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(b.atualizado_em)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BoletoMonitorPage;
