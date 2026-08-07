import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    CalendarDaysIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    FunnelIcon,
    InformationCircleIcon,
    MagnifyingGlassIcon,
    TagIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { formatCnpj, isValidCnpj, normalizeCnpj } from '../utils/cnpj';

export const toneStyles = {
    emerald: {
        icon: 'text-emerald-600 dark:text-emerald-400',
        badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
        action: 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950 dark:hover:bg-emerald-300',
    },
    slate: {
        icon: 'text-slate-600 dark:text-slate-300',
        badge: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
        action: 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white',
    },
    amber: {
        icon: 'text-amber-600 dark:text-amber-400',
        badge: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
        action: 'bg-amber-700 hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950 dark:hover:bg-amber-300',
    },
};

const cardClass = 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900';
const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400';
const controlClass = 'h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-slate-500/20';
const chipClass = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors';
const chipOff = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const chipOn = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950';
const rowActionClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:border-[#c49a61] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-[#c49a61] dark:hover:bg-gray-800 dark:disabled:hover:border-gray-700';

const MONTHS = [
    ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
    ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
    ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
];

const DEFAULT_FILTERS = {
    carteira: '',
    regime: '',
    tagIds: [],
    incluirInativas: false,
    extras: {},
};

const shiftCompetencia = (monthsBack) => {
    const reference = new Date();
    reference.setDate(1);
    reference.setMonth(reference.getMonth() - monthsBack);
    return {
        month: String(reference.getMonth() + 1).padStart(2, '0'),
        year: String(reference.getFullYear()),
    };
};

const readStoredState = (storageKey) => {
    try {
        const raw = window.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed || typeof parsed !== 'object') return null;
        const storedFilters = parsed.filters && typeof parsed.filters === 'object' ? parsed.filters : {};
        return {
            month: typeof parsed.month === 'string' ? parsed.month : null,
            year: typeof parsed.year === 'string' ? parsed.year : null,
            filters: {
                ...storedFilters,
                tagIds: Array.isArray(storedFilters.tagIds) ? storedFilters.tagIds.map(String) : [],
                extras: storedFilters.extras && typeof storedFilters.extras === 'object' ? storedFilters.extras : {},
            },
        };
    } catch {
        return null;
    }
};

const CentralDocumentosPage = ({
    eyebrow = 'Fiscal',
    titulo,
    descricao,
    storageKey,
    services,
    extraFilters = [],
    observacao,
    periodoLabel = 'Competência',
}) => {
    // Lê o estado salvo uma única vez, na montagem.
    const [stored] = useState(() => readStoredState(storageKey));
    const searchInputRef = useRef(null);
    const cancelBatchRef = useRef(false);

    const [empresas, setEmpresas] = useState([]);
    const [tags, setTags] = useState([]);
    const [loadingEmpresas, setLoadingEmpresas] = useState(true);
    const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text }

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...(stored?.filters || {}) });
    const [showTagPanel, setShowTagPanel] = useState((stored?.filters?.tagIds || []).length > 0);

    const initialCompetencia = shiftCompetencia(0);
    const [month, setMonth] = useState(stored?.month || initialCompetencia.month);
    const [year, setYear] = useState(stored?.year || initialCompetencia.year);

    const [selectedIds, setSelectedIds] = useState([]);
    const [pending, setPending] = useState({});
    const [rowStatus, setRowStatus] = useState({});
    const [batch, setBatch] = useState(null); // { serviceKey, total, done, running, results }

    const periodo = `${year}${month}`;

    const years = useMemo(() => {
        const current = new Date().getFullYear();
        return Array.from({ length: 8 }, (_, index) => String(current + 1 - index));
    }, []);

    // --- Carga de dados ---
    const loadEmpresas = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoadingEmpresas(true);
        try {
            const response = await axiosInstance.get('/api/empresas/?all=true');
            setEmpresas(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
            setFeedback({ type: 'error', text: 'Não foi possível carregar as empresas.' });
        } finally {
            setLoadingEmpresas(false);
        }
    }, []);

    useEffect(() => {
        loadEmpresas();
        axiosInstance.get('/api/tags/')
            .then((response) => setTags(Array.isArray(response.data) ? response.data : []))
            .catch((error) => console.error('Erro ao carregar tags:', error));
    }, [loadEmpresas]);

    // --- Busca com debounce ---
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    // --- Persistência de filtros e competência ---
    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ filters, month, year }));
        } catch {
            // Se o navegador negar armazenamento, os filtros seguem valendo apenas nesta sessão.
        }
    }, [storageKey, filters, month, year]);

    // --- Atalho "/" para focar a busca ---
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
            const tag = event.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'select' || tag === 'textarea' || event.target?.isContentEditable) return;
            event.preventDefault();
            searchInputRef.current?.focus();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // --- Opções derivadas dos dados ---
    const carteiraOptions = useMemo(
        () => Array.from(new Set(empresas.map((item) => item.carteira_clientes).filter(Boolean))).sort(),
        [empresas],
    );
    const regimeOptions = useMemo(
        () => Array.from(new Set(empresas.map((item) => item.regime_tributario).filter(Boolean))).sort(),
        [empresas],
    );

    const filteredEmpresas = useMemo(() => {
        const term = debouncedSearch.trim().toLowerCase();
        const digits = term.replace(/\D/g, '');
        return empresas.filter((empresa) => {
            if (!filters.incluirInativas && empresa.ativo === false) return false;
            if (filters.carteira && empresa.carteira_clientes !== filters.carteira) return false;
            if (filters.regime && empresa.regime_tributario !== filters.regime) return false;
            if (filters.tagIds.length > 0) {
                const empresaTagIds = (empresa.tags || []).map((tag) => String(tag.id));
                if (!filters.tagIds.some((tagId) => empresaTagIds.includes(tagId))) return false;
            }
            const failsExtra = extraFilters.some(
                (extra) => filters.extras?.[extra.key] && !extra.predicate(empresa),
            );
            if (failsExtra) return false;
            if (!term) return true;
            const nome = (empresa.nome || '').toLowerCase();
            const cnpj = normalizeCnpj(empresa.cnpj || '').toLowerCase();
            return nome.includes(term) || (Boolean(digits) && cnpj.includes(digits));
        });
    }, [empresas, debouncedSearch, filters, extraFilters]);

    const activeFilterCount = useMemo(() => (
        (debouncedSearch.trim() ? 1 : 0)
        + (filters.carteira ? 1 : 0)
        + (filters.regime ? 1 : 0)
        + filters.tagIds.length
        + (filters.incluirInativas ? 1 : 0)
        + extraFilters.filter((extra) => filters.extras?.[extra.key]).length
    ), [debouncedSearch, filters, extraFilters]);

    // Mantém a seleção coerente com o que está visível na tabela.
    useEffect(() => {
        setSelectedIds((current) => {
            const visibleIds = new Set(filteredEmpresas.map((empresa) => empresa.id));
            const next = current.filter((id) => visibleIds.has(id));
            return next.length === current.length ? current : next;
        });
    }, [filteredEmpresas]);

    const selectableEmpresas = useMemo(
        () => filteredEmpresas.filter((empresa) => isValidCnpj(empresa.cnpj)),
        [filteredEmpresas],
    );
    const allSelected = selectableEmpresas.length > 0 && selectedIds.length === selectableEmpresas.length;

    const updateFilters = (patch) => setFilters((current) => ({ ...current, ...patch }));

    const toggleTag = (tagId) => {
        setFilters((current) => ({
            ...current,
            tagIds: current.tagIds.includes(tagId)
                ? current.tagIds.filter((id) => id !== tagId)
                : [...current.tagIds, tagId],
        }));
    };

    const toggleExtra = (key) => {
        setFilters((current) => ({
            ...current,
            extras: { ...current.extras, [key]: !current.extras?.[key] },
        }));
    };

    const clearFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setFilters({ ...DEFAULT_FILTERS, extras: {} });
    };

    const toggleSelection = (empresaId) => {
        setSelectedIds((current) => (
            current.includes(empresaId)
                ? current.filter((id) => id !== empresaId)
                : [...current, empresaId]
        ));
    };

    const toggleSelectAll = () => {
        setSelectedIds(allSelected ? [] : selectableEmpresas.map((empresa) => empresa.id));
    };

    const applyCompetencia = (monthsBack) => {
        const next = shiftCompetencia(monthsBack);
        setMonth(next.month);
        setYear(next.year);
    };

    // --- Execução dos serviços ---
    const downloadBlobResponse = (response, fallbackFilename) => {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        let filename = fallbackFilename;
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^";]+)"?/i);
            if (match?.[1]) filename = match[1];
        }
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const readBlobError = async (error, fallback) => {
        try {
            if (error.response?.data instanceof Blob) {
                const parsed = JSON.parse(await error.response.data.text());
                return parsed.error || fallback;
            }
            return error.response?.data?.error || fallback;
        } catch {
            return fallback;
        }
    };

    const executeService = useCallback(async (empresa, service) => {
        const cnpjLimpo = normalizeCnpj(empresa.cnpj);
        const pendingKey = `${empresa.id}:${service.key}`;
        setPending((current) => ({ ...current, [pendingKey]: true }));
        try {
            const response = await service.request({ cnpj: cnpjLimpo, periodo });
            downloadBlobResponse(response, service.filename({ cnpjLimpo, periodo }));
            const text = `${service.label} de ${empresa.nome} (${month}/${year}) baixado com sucesso!`;
            setRowStatus((current) => ({
                ...current,
                [empresa.id]: { ok: true, label: service.label, competencia: `${month}/${year}`, message: text },
            }));
            return { ok: true, message: text };
        } catch (error) {
            console.error(`Erro em ${service.key}:`, error);
            const text = await readBlobError(error, service.errorMessage);
            setRowStatus((current) => ({
                ...current,
                [empresa.id]: { ok: false, label: service.label, competencia: `${month}/${year}`, message: text },
            }));
            return { ok: false, message: text };
        } finally {
            setPending((current) => {
                const next = { ...current };
                delete next[pendingKey];
                return next;
            });
        }
    }, [periodo, month, year]);

    const handleSingle = async (empresa, service) => {
        setFeedback(null);
        const result = await executeService(empresa, service);
        setFeedback({ type: result.ok ? 'success' : 'error', text: result.message });
    };

    const handleBatch = async (service) => {
        const targets = filteredEmpresas.filter(
            (empresa) => selectedIds.includes(empresa.id) && isValidCnpj(empresa.cnpj),
        );
        if (targets.length === 0) return;

        setFeedback(null);
        cancelBatchRef.current = false;
        setBatch({ serviceKey: service.key, label: service.label, total: targets.length, done: 0, running: true, results: [] });

        for (const empresa of targets) {
            if (cancelBatchRef.current) break;
            // Sequencial de propósito: evita disparar várias chamadas ao SERPRO ao mesmo tempo.
            const result = await executeService(empresa, service);
            setBatch((current) => (current ? {
                ...current,
                done: current.done + 1,
                results: [...current.results, { id: empresa.id, nome: empresa.nome, ...result }],
            } : current));
        }

        setBatch((current) => (current ? { ...current, running: false, cancelled: cancelBatchRef.current } : current));
    };

    const cancelBatch = () => {
        cancelBatchRef.current = true;
    };

    const isBatchRunning = Boolean(batch?.running);

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">{eyebrow}</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">{titulo}</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{descricao}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {services.map((service) => {
                        const Icon = service.icon;
                        return (
                            <span key={service.key} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${toneStyles[service.tone].badge}`}>
                                <Icon className="h-4 w-4" />
                                {service.label}
                            </span>
                        );
                    })}
                    <button
                        type="button"
                        onClick={() => loadEmpresas({ silent: true })}
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        title="Recarregar empresas"
                    >
                        <ArrowPathIcon className="h-4 w-4" />
                        Atualizar
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {feedback && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'}`}
                        role="status"
                    >
                        {feedback.type === 'success'
                            ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            : <InformationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                        <span className="flex-1">{feedback.text}</span>
                        <button type="button" onClick={() => setFeedback(null)} className="opacity-60 transition hover:opacity-100">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Competência aplicada a todas as gerações da tela */}
            <div className={`${cardClass} p-4`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid w-full max-w-md grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>{periodoLabel}</label>
                            <div className="relative">
                                <select value={month} onChange={(event) => setMonth(event.target.value)} className={`${controlClass} appearance-none pr-9 font-medium`}>
                                    {MONTHS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                                <CalendarDaysIcon className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>
                        <div>
                            <label className={labelClass}>Ano</label>
                            <select value={year} onChange={(event) => setYear(event.target.value)} className={`${controlClass} font-medium`}>
                                {years.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => applyCompetencia(0)} className={`${chipClass} ${chipOff}`}>Mês atual</button>
                        <button type="button" onClick={() => applyCompetencia(1)} className={`${chipClass} ${chipOff}`}>Mês anterior</button>
                        <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold tabular-nums text-white dark:bg-slate-100 dark:text-slate-950">
                            <CalendarDaysIcon className="h-4 w-4" />
                            {month}/{year}
                        </span>
                    </div>
                </div>
                {observacao && (
                    <p className="mt-3 flex items-start gap-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300">
                        <InformationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span>{observacao}</span>
                    </p>
                )}
            </div>

            {/* Filtros */}
            <div className={`${cardClass} p-4`}>
                <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.4fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_auto]">
                    <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por nome ou CNPJ  ( / )"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="opacity-60 transition hover:opacity-100">
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        )}
                    </label>

                    <select
                        value={filters.carteira}
                        onChange={(event) => updateFilters({ carteira: event.target.value })}
                        className={controlClass}
                        aria-label="Filtrar por carteira"
                    >
                        <option value="">Todas as carteiras</option>
                        {carteiraOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>

                    <select
                        value={filters.regime}
                        onChange={(event) => updateFilters({ regime: event.target.value })}
                        className={controlClass}
                        aria-label="Filtrar por regime tributário"
                    >
                        <option value="">Todos os regimes</option>
                        {regimeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowTagPanel((current) => !current)}
                            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${filters.tagIds.length > 0
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}
                        >
                            <TagIcon className="h-4 w-4" />
                            Tags
                            {filters.tagIds.length > 0 && (
                                <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums dark:bg-slate-950/20">{filters.tagIds.length}</span>
                            )}
                        </button>
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                                title="Limpar todos os filtros"
                            >
                                <XMarkIcon className="h-4 w-4" />
                                Limpar
                            </button>
                        )}
                    </div>
                </div>

                <AnimatePresence initial={false}>
                    {showTagPanel && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 rounded-md border border-gray-200 p-3 dark:border-gray-700">
                                {tags.length === 0 ? (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma tag disponível para o seu perfil.</p>
                                ) : (
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updateFilters({ tagIds: [] })}
                                            className={`${chipClass} ${filters.tagIds.length === 0 ? chipOn : chipOff}`}
                                        >
                                            Todas
                                        </button>
                                        {tags.map((tag) => {
                                            const tagId = String(tag.id);
                                            const selected = filters.tagIds.includes(tagId);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => toggleTag(tagId)}
                                                    className={`${chipClass} ${selected ? chipOn : chipOff}`}
                                                >
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                    {tag.nome}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                    {extraFilters.map((extra) => (
                        <button
                            key={extra.key}
                            type="button"
                            onClick={() => toggleExtra(extra.key)}
                            className={`${chipClass} ${filters.extras?.[extra.key] ? chipOn : chipOff}`}
                            title={extra.description}
                        >
                            {extra.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => updateFilters({ incluirInativas: !filters.incluirInativas })}
                        className={`${chipClass} ${filters.incluirInativas ? chipOn : chipOff}`}
                        title="Por padrão a listagem mostra apenas empresas ativas"
                    >
                        Incluir inativas
                    </button>
                    <span className="ml-auto inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <FunnelIcon className="h-4 w-4" />
                        {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) ativo(s) · ` : ''}
                        <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{filteredEmpresas.length}</span>
                        de {empresas.length} empresas
                    </span>
                </div>
            </div>

            {/* Ações em lote */}
            <AnimatePresence initial={false}>
                {selectedIds.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                    >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="text-sm text-gray-700 dark:text-gray-200">
                                <span className="font-semibold tabular-nums">{selectedIds.length}</span> empresa(s) selecionada(s) ·
                                competência <span className="font-semibold tabular-nums">{month}/{year}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {services.map((service) => {
                                    const Icon = service.icon;
                                    return (
                                        <button
                                            key={service.key}
                                            type="button"
                                            onClick={() => handleBatch(service)}
                                            disabled={isBatchRunning}
                                            className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles[service.tone].action}`}
                                        >
                                            <Icon className="h-4 w-4" />
                                            {service.label} em lote
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    onClick={() => setSelectedIds([])}
                                    disabled={isBatchRunning}
                                    className="inline-flex h-9 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                    Limpar seleção
                                </button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            O processamento é sequencial. O navegador pode pedir permissão para baixar vários arquivos.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progresso do lote */}
            <AnimatePresence initial={false}>
                {batch && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`overflow-hidden ${cardClass}`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70">
                            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                                {batch.running ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                                {batch.label} em lote — <span className="tabular-nums">{batch.done}/{batch.total}</span>
                                {batch.cancelled && <span className="text-xs font-normal text-gray-500">(cancelado)</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                {batch.running ? (
                                    <button type="button" onClick={cancelBatch} className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                                        <XMarkIcon className="h-4 w-4" />
                                        Cancelar
                                    </button>
                                ) : (
                                    <button type="button" onClick={() => setBatch(null)} className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-300 bg-white px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                                        <XMarkIcon className="h-4 w-4" />
                                        Fechar
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800">
                            <div
                                className="h-full bg-slate-900 transition-all dark:bg-slate-100"
                                style={{ width: `${batch.total ? Math.round((batch.done / batch.total) * 100) : 0}%` }}
                            />
                        </div>
                        {batch.results.length > 0 && (
                            <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto text-sm dark:divide-gray-800">
                                {batch.results.map((result) => (
                                    <li key={result.id} className="flex items-start gap-2 px-4 py-2">
                                        {result.ok
                                            ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                                            : <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="font-medium text-gray-800 dark:text-gray-100">{result.nome}</span>
                                            {!result.ok && <span className="block text-xs text-rose-600 dark:text-rose-400">{result.message}</span>}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Listagem */}
            {loadingEmpresas ? (
                <div className={`${cardClass} flex items-center justify-center gap-3 p-10 text-sm text-gray-500 dark:text-gray-400`}>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    Carregando empresas...
                </div>
            ) : filteredEmpresas.length === 0 ? (
                <div className={`${cardClass} p-10 text-center`}>
                    <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Nenhuma empresa encontrada</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {activeFilterCount > 0 ? 'Nenhuma empresa atende aos filtros selecionados.' : 'Nenhuma empresa disponível para consulta.'}
                    </p>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                        >
                            Limpar filtros
                        </button>
                    )}
                </div>
            ) : (
                <div className={`overflow-hidden ${cardClass}`}>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-900/70">
                                <tr>
                                    <th scope="col" className="w-10 px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={allSelected}
                                            onChange={toggleSelectAll}
                                            disabled={selectableEmpresas.length === 0 || isBatchRunning}
                                            className="h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-400 dark:border-gray-600"
                                            title="Selecionar todas as empresas filtradas"
                                        />
                                    </th>
                                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Empresa</th>
                                    <th scope="col" className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 lg:table-cell">Classificação</th>
                                    <th scope="col" className="hidden px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400 xl:table-cell">Última ação</th>
                                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Documentos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredEmpresas.map((empresa) => {
                                    const cnpjValido = isValidCnpj(empresa.cnpj);
                                    const status = rowStatus[empresa.id];
                                    const selected = selectedIds.includes(empresa.id);
                                    return (
                                        <tr
                                            key={empresa.id}
                                            className={`transition-colors ${selected ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                                        >
                                            <td className="px-4 py-4 align-top">
                                                <input
                                                    type="checkbox"
                                                    checked={selected}
                                                    onChange={() => toggleSelection(empresa.id)}
                                                    disabled={!cnpjValido || isBatchRunning}
                                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-400 disabled:opacity-40 dark:border-gray-600"
                                                    aria-label={`Selecionar ${empresa.nome}`}
                                                />
                                            </td>
                                            <td className="min-w-64 px-4 py-4 align-top">
                                                <div className="flex items-start gap-3">
                                                    <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                        <BuildingOffice2Icon className="h-5 w-5" />
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <p className="break-words text-sm font-semibold leading-tight text-gray-950 dark:text-gray-100">{empresa.nome}</p>
                                                            {empresa.ativo === false && (
                                                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">Inativa</span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-xs tabular-nums text-gray-500 dark:text-gray-400">{formatCnpj(empresa.cnpj)}</p>
                                                        {!cnpjValido && (
                                                            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                                                                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                                                CNPJ inválido no cadastro
                                                            </p>
                                                        )}
                                                        {(empresa.tags || []).length > 0 && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {(empresa.tags || []).map((tag) => (
                                                                    <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                                        {tag.nome}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="hidden px-4 py-4 align-top lg:table-cell">
                                                <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-300">
                                                    {empresa.carteira_clientes && <span className="font-semibold text-gray-800 dark:text-gray-100">{empresa.carteira_clientes}</span>}
                                                    {empresa.regime_tributario && <span>{empresa.regime_tributario}</span>}
                                                    {empresa.anexo_simples && <span className="text-gray-500 dark:text-gray-400">Anexo {empresa.anexo_simples}</span>}
                                                    {!empresa.carteira_clientes && !empresa.regime_tributario && <span className="text-gray-400">—</span>}
                                                </div>
                                            </td>
                                            <td className="hidden px-4 py-4 align-top xl:table-cell">
                                                {status ? (
                                                    <div className={`flex items-start gap-1.5 text-xs ${status.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                                                        {status.ok
                                                            ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                                                            : <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                                                        <span className="min-w-0">
                                                            <span className="block font-semibold">{status.label} · {status.competencia}</span>
                                                            {!status.ok && <span className="line-clamp-2 block" title={status.message}>{status.message}</span>}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 align-top">
                                                <div className="flex min-w-max flex-wrap justify-end gap-2">
                                                    {services.map((service) => {
                                                        const Icon = service.icon;
                                                        const isPending = Boolean(pending[`${empresa.id}:${service.key}`]);
                                                        return (
                                                            <button
                                                                key={service.key}
                                                                type="button"
                                                                onClick={() => handleSingle(empresa, service)}
                                                                disabled={!cnpjValido || isPending || isBatchRunning}
                                                                className={rowActionClass}
                                                                title={cnpjValido
                                                                    ? `${service.label} · competência ${month}/${year}`
                                                                    : 'Corrija o CNPJ no cadastro da empresa para usar este serviço'}
                                                            >
                                                                {isPending
                                                                    ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                    : <Icon className={`h-4 w-4 ${toneStyles[service.tone].icon}`} />}
                                                                {service.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
                        <span>Exibindo {filteredEmpresas.length} de {empresas.length} empresas</span>
                        <span>Documentos gerados para a competência <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{month}/{year}</span></span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CentralDocumentosPage;
