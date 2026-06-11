import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    ChartBarIcon,
    CheckCircleIcon,
    ClipboardDocumentCheckIcon,
    ClipboardDocumentIcon,
    ClockIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    FunnelIcon,
    InformationCircleIcon,
    MagnifyingGlassIcon,
    PaperAirplaneIcon,
    XCircleIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const monthNames = [
    'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const generateMonthOptions = () => {
    const options = [];
    const date = new Date();

    for (let i = 0; i < 12; i += 1) {
        date.setDate(1);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');

        options.push({
            value: `${year}-${month}`,
            label: `${monthNames[Number(month) - 1]} de ${year}`,
        });
        date.setMonth(date.getMonth() - 1);
    }

    return options;
};

const normalizeRows = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
};

const normalizeStatus = (status) => String(status || '').trim().toLowerCase();

const isSuccess = (item) => normalizeStatus(item.status) === 'sucesso';

const isFailure = (item) => normalizeStatus(item.status) === 'falha';

const getEventDate = (item) => item.data_envio || item.data_hora;

const dateKey = (value) => {
    if (!value) return 'sem-data';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'sem-data';
    return parsed.toISOString().slice(0, 10);
};

const formatDateTime = (value) => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const formatDayLabel = (key) => {
    if (key === 'sem-data') return 'Sem data';
    const [year, month, day] = key.split('-');
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    return parsed.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
    });
};

const formatPhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '-';
    if (digits.length === 13) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    if (digits.length === 12) return `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value || '-';
};

const buildSearchText = (item) => [
    item.nome_empresa,
    item.remetente,
    item.arquivo,
    item.message_id,
    item.erro,
].filter(Boolean).join(' ').toLowerCase();

const getFileKind = (filename) => {
    const value = String(filename || '').toLowerCase();
    if (value.includes('boleto') || value.includes('honorario') || value.includes('honorário')) return 'Boleto';
    if (value.includes('das') || value.includes('simples')) return 'Simples';
    if (value.includes('dp') || value.includes('folha') || value.includes('prolabore') || value.includes('pro-labore')) return 'DP';
    return 'Documento';
};

const pct = (part, total) => (total ? Math.round((part / total) * 100) : 0);

const StatTile = ({ icon: Icon, label, value, detail, tone = 'slate' }) => {
    const toneClass = {
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
        green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
        red: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    }[tone];

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-3 text-2xl font-bold text-gray-950 dark:text-white">{value}</p>
                </div>
                <div className={`rounded-md p-2.5 ${toneClass}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
            {detail && <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{detail}</p>}
        </div>
    );
};

const StatusBadge = ({ status }) => {
    const success = normalizeStatus(status) === 'sucesso';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
            success
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900'
                : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900'
        }`}>
            {success ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
            {success ? 'Sucesso' : 'Falha'}
        </span>
    );
};

const HistoricoWhatsApp = ({ companyName: companyNameProp = null }) => {
    const [historico, setHistorico] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [copiedId, setCopiedId] = useState(null);
    const [searchTerm, setSearchTerm] = useState(companyNameProp || '');
    const [filter, setFilter] = useState({ year: '', month: '', status: '' });
    const [activeQuickFilter, setActiveQuickFilter] = useState('all');

    const monthOptions = useMemo(() => generateMonthOptions(), []);
    const selectedMonthValue = filter.year && filter.month ? `${filter.year}-${String(filter.month).padStart(2, '0')}` : '';

    const loadHistorico = useCallback(() => {
        setLoading(true);
        setError(null);

        const params = {};
        if (filter.year) params.year = filter.year;
        if (filter.month) params.month = filter.month;
        if (filter.status) params.status = filter.status;

        const queryParams = new URLSearchParams(params).toString();
        const endpoint = queryParams ? `/api/historico-envios/?${queryParams}` : '/api/historico-envios/';

        axiosInstance.get(endpoint)
            .then((response) => {
                setHistorico(normalizeRows(response.data));
            })
            .catch((err) => {
                console.error('Erro ao buscar histórico:', err);
                setError('Não foi possível carregar o histórico de envios.');
            })
            .finally(() => {
                setLoading(false);
            });
    }, [filter]);

    useEffect(() => {
        loadHistorico();
    }, [loadHistorico]);

    const filteredHistorico = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase();
        const digits = searchTerm.replace(/\D/g, '');

        return historico.filter((item) => {
            if (!normalizedSearch) return true;
            const text = buildSearchText(item);
            const textDigits = text.replace(/\D/g, '');
            return text.includes(normalizedSearch) || (digits && textDigits.includes(digits));
        });
    }, [historico, searchTerm]);

    const summary = useMemo(() => {
        const total = filteredHistorico.length;
        const success = filteredHistorico.filter(isSuccess).length;
        const failure = filteredHistorico.filter(isFailure).length;
        const empresas = new Set(filteredHistorico.map((item) => item.nome_empresa || item.remetente || item.id)).size;
        const files = new Set(filteredHistorico.map((item) => item.arquivo).filter(Boolean)).size;
        const last = filteredHistorico[0];

        return {
            total,
            success,
            failure,
            empresas,
            files,
            rate: pct(success, total),
            last,
        };
    }, [filteredHistorico]);

    const groupedByDay = useMemo(() => {
        const map = new Map();

        filteredHistorico.forEach((item) => {
            const key = dateKey(getEventDate(item));
            if (!map.has(key)) {
                map.set(key, {
                    key,
                    label: formatDayLabel(key),
                    rows: [],
                    success: 0,
                    failure: 0,
                });
            }

            const group = map.get(key);
            group.rows.push(item);
            if (isSuccess(item)) group.success += 1;
            if (isFailure(item)) group.failure += 1;
        });

        return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
    }, [filteredHistorico]);

    const kindSummary = useMemo(() => {
        const map = new Map();
        filteredHistorico.forEach((item) => {
            const kind = getFileKind(item.arquivo);
            map.set(kind, (map.get(kind) || 0) + 1);
        });
        return Array.from(map.entries())
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);
    }, [filteredHistorico]);

    const visibleFailures = useMemo(
        () => filteredHistorico.filter(isFailure).slice(0, 3),
        [filteredHistorico]
    );

    const copyToClipboard = (text, id) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }, () => {
            alert('Falha ao copiar o ID.');
        });
    };

    const setQuickFilter = (status) => {
        setActiveQuickFilter(status || 'all');
        setFilter((prev) => ({ ...prev, status: status || '' }));
    };

    const handleMonthFilterChange = (value) => {
        setActiveQuickFilter('');
        if (!value) {
            setFilter((prev) => ({ ...prev, year: '', month: '' }));
            return;
        }

        const [year, month] = value.split('-');
        setFilter((prev) => ({ ...prev, year, month }));
    };

    const clearFilters = () => {
        setFilter({ year: '', month: '', status: '' });
        setActiveQuickFilter('all');
        setSearchTerm(companyNameProp || '');
    };

    const healthTone = summary.rate >= 90 ? 'text-emerald-600 dark:text-emerald-300' : summary.rate >= 70 ? 'text-amber-600 dark:text-amber-300' : 'text-rose-600 dark:text-rose-300';

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600 dark:text-emerald-300">Comunicação</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Histórico WhatsApp</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
                        Leitura rápida dos envios, falhas, empresas acionadas e documentos disparados.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={loadHistorico}
                    disabled={loading}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                    <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Atualizar
                </button>
            </div>

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                    <div className="border-b border-gray-200 p-5 dark:border-gray-800 lg:border-b-0 lg:border-r">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Saúde dos envios</p>
                                <p className={`mt-2 text-5xl font-bold ${healthTone}`}>{summary.rate}%</p>
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                <p><span className="font-bold text-emerald-600 dark:text-emerald-300">{summary.success}</span> sucesso(s)</p>
                                <p><span className="font-bold text-rose-600 dark:text-rose-300">{summary.failure}</span> falha(s)</p>
                            </div>
                        </div>

                        <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className="bg-emerald-500" style={{ width: `${pct(summary.success, summary.total)}%` }} />
                            <div className="bg-rose-500" style={{ width: `${pct(summary.failure, summary.total)}%` }} />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            {kindSummary.length ? kindSummary.map((kind) => (
                                <span key={kind.label} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                    {kind.label}: {kind.count}
                                </span>
                            )) : (
                                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">Sem documentos no filtro</span>
                            )}
                        </div>
                    </div>

                    <div className="p-5">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Último movimento</p>
                        {summary.last ? (
                            <div className="mt-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-bold text-gray-950 dark:text-white">{summary.last.nome_empresa || 'Empresa não associada'}</p>
                                        <p className="mt-1 truncate text-sm text-gray-500 dark:text-gray-400">{summary.last.arquivo || 'Documento sem nome'}</p>
                                    </div>
                                    <StatusBadge status={summary.last.status} />
                                </div>
                                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{formatDateTime(getEventDate(summary.last))}</p>
                                {summary.last.erro && (
                                    <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                                        {summary.last.erro}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Nenhum envio encontrado para os filtros atuais.</p>
                        )}
                    </div>
                </div>
            </section>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatTile icon={PaperAirplaneIcon} label="Envios no filtro" value={summary.total} detail="Total visível após filtros e busca" tone="slate" />
                <StatTile icon={BuildingOffice2Icon} label="Empresas acionadas" value={summary.empresas} detail="Empresas ou números distintos" tone="green" />
                <StatTile icon={DocumentTextIcon} label="Arquivos únicos" value={summary.files} detail="Documentos diferentes no período" tone="amber" />
                <StatTile icon={ExclamationTriangleIcon} label="Falhas abertas" value={summary.failure} detail={summary.failure ? 'Verifique o painel de atenção abaixo' : 'Nenhuma falha no filtro'} tone={summary.failure ? 'red' : 'green'} />
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                    <div className="flex items-center gap-2">
                        <FunnelIcon className="h-5 w-5 text-gray-400" />
                        <button
                            type="button"
                            onClick={() => setQuickFilter('')}
                            className={`h-9 rounded-md px-3 text-sm font-bold transition ${activeQuickFilter === 'all' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                        >
                            Todos
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickFilter('sucesso')}
                            className={`h-9 rounded-md px-3 text-sm font-bold transition ${activeQuickFilter === 'sucesso' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                        >
                            Sucesso
                        </button>
                        <button
                            type="button"
                            onClick={() => setQuickFilter('falha')}
                            className={`h-9 rounded-md px-3 text-sm font-bold transition ${activeQuickFilter === 'falha' ? 'bg-rose-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                        >
                            Falha
                        </button>
                    </div>

                    <select
                        value={selectedMonthValue}
                        onChange={(event) => handleMonthFilterChange(event.target.value)}
                        className="h-10 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
                    >
                        <option value="">Todos os meses</option>
                        {monthOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>

                    <div className="relative min-w-0 flex-1">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder="Buscar empresa, telefone, arquivo, erro ou ID"
                            className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:focus:ring-emerald-950/40"
                        />
                    </div>

                    {(filter.year || filter.month || filter.status || searchTerm) && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="h-10 rounded-md border border-gray-200 px-3 text-sm font-bold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                            Limpar
                        </button>
                    )}
                </div>
            </section>

            {loading && (
                <div className="rounded-lg border border-gray-200 bg-white px-4 py-12 text-center text-sm font-semibold text-gray-500 shadow-sm dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
                    Carregando histórico...
                </div>
            )}

            {error && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">
                    {error}
                </div>
            )}

            {!loading && !error && summary.failure > 0 && (
                <section className="rounded-lg border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/70 dark:bg-rose-950/20">
                    <div className="flex items-center gap-2 text-rose-800 dark:text-rose-200">
                        <ExclamationTriangleIcon className="h-5 w-5" />
                        <h2 className="text-sm font-bold uppercase tracking-[0.14em]">Atenção</h2>
                    </div>
                    <div className="mt-3 grid gap-2 lg:grid-cols-3">
                        {visibleFailures.map((item) => (
                            <div key={item.id} className="rounded-md border border-rose-200 bg-white p-3 text-sm dark:border-rose-900/70 dark:bg-gray-900">
                                <p className="truncate font-bold text-gray-950 dark:text-white">{item.nome_empresa || formatPhone(item.remetente)}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-rose-700 dark:text-rose-300">{item.erro || 'Falha sem detalhe registrado.'}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {!loading && !error && (
                <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <aside className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Radar diário</p>
                                <h2 className="mt-1 text-lg font-bold text-gray-950 dark:text-white">Movimento</h2>
                            </div>
                            <ChartBarIcon className="h-6 w-6 text-emerald-500" />
                        </div>

                        <div className="mt-4 space-y-3">
                            {groupedByDay.length === 0 ? (
                                <p className="rounded-md bg-gray-50 px-3 py-6 text-center text-sm text-gray-500 dark:bg-gray-950 dark:text-gray-400">Sem movimento no filtro.</p>
                            ) : groupedByDay.slice(0, 8).map((group) => {
                                const total = group.rows.length;
                                return (
                                    <div key={group.key} className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
                                        <div className="flex items-start justify-between gap-3">
                                            <p className="text-sm font-bold capitalize text-gray-950 dark:text-white">{group.label}</p>
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{total}</span>
                                        </div>
                                        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                                            <div className="bg-emerald-500" style={{ width: `${pct(group.success, total)}%` }} />
                                            <div className="bg-rose-500" style={{ width: `${pct(group.failure, total)}%` }} />
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{group.success} sucesso(s), {group.failure} falha(s)</p>
                                    </div>
                                );
                            })}
                        </div>
                    </aside>

                    <section className="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-col gap-1 border-b border-gray-200 p-4 dark:border-gray-800 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Linha de envios</p>
                                <h2 className="mt-1 text-lg font-bold text-gray-950 dark:text-white">{summary.total} registro(s)</h2>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Ordenado do mais recente para o mais antigo</p>
                        </div>

                        {filteredHistorico.length === 0 ? (
                            <div className="px-4 py-16 text-center">
                                <InformationCircleIcon className="mx-auto h-10 w-10 text-gray-400" />
                                <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-white">Nenhum registro encontrado</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros para ampliar a busca.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredHistorico.map((item, index) => (
                                    <motion.div
                                        key={item.id}
                                        className="grid gap-3 p-4 transition hover:bg-gray-50 dark:hover:bg-gray-800/50 lg:grid-cols-[minmax(0,1fr)_170px_130px]"
                                        initial={{ y: 10, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: Math.min(index * 0.015, 0.2) }}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <StatusBadge status={item.status} />
                                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                                    <DocumentTextIcon className="h-4 w-4" />
                                                    {getFileKind(item.arquivo)}
                                                </span>
                                                {!item.empresa && (
                                                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900">
                                                        Sem empresa
                                                    </span>
                                                )}
                                            </div>

                                            <p className="mt-3 truncate text-base font-bold text-gray-950 dark:text-white">{item.nome_empresa || 'Empresa não associada'}</p>
                                            <p className="mt-1 break-words text-sm text-gray-600 dark:text-gray-300">{item.arquivo || 'Documento sem nome'}</p>

                                            {item.erro && (
                                                <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                                                    {item.erro}
                                                </p>
                                            )}

                                            {item.message_id && (
                                                <div className="mt-2 flex max-w-full items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="truncate font-mono">ID: {item.message_id}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => copyToClipboard(item.message_id, item.id)}
                                                        title="Copiar ID da mensagem"
                                                        className="shrink-0 rounded p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                                    >
                                                        {copiedId === item.id ? <ClipboardDocumentCheckIcon className="h-4 w-4 text-emerald-500" /> : <ClipboardDocumentIcon className="h-4 w-4" />}
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 lg:block">
                                            <BuildingOffice2Icon className="h-4 w-4 text-gray-400 lg:mb-2" />
                                            <p className="font-semibold">{formatPhone(item.remetente)}</p>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 lg:block lg:text-right">
                                            <ClockIcon className="h-4 w-4 text-gray-400 lg:ml-auto lg:mb-2" />
                                            <p className="font-semibold">{formatDateTime(getEventDate(item))}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};

export default HistoricoWhatsApp;
