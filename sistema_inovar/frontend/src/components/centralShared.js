import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    FunnelIcon,
    MagnifyingGlassIcon,
    TagIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { formatCnpj, isValidCnpj, normalizeCnpj } from '../utils/cnpj';

/* ------------------------------------------------------------------ *
 * Tokens visuais compartilhados por todas as centrais.
 * ------------------------------------------------------------------ */
export const cardClass = 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900';
export const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400';
export const controlClass = 'h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-slate-500/20';
export const chipClass = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors';
export const chipOff = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
export const chipOn = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950';
export const rowActionClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:border-[#c49a61] hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-[#c49a61] dark:hover:bg-gray-800 dark:disabled:hover:border-gray-700';
export const primaryButtonClass = 'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white';
export const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800';
export const thClass = 'px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400';

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

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
export const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
}).format(Number(value) || 0);

/**
 * Os serviços Serpro exigem CNPJ com 14 dígitos numéricos (o backend descarta
 * qualquer caractere não numérico antes de validar), então o formato
 * alfanumérico novo não serve aqui. Exigimos também os dígitos verificadores
 * para não gastar uma chamada com um cadastro digitado errado.
 */
export const somenteDigitosCnpj = (value) => normalizeCnpj(value).replace(/\D/g, '');
export const temCnpjNumerico = (value) => {
    const digitos = somenteDigitosCnpj(value);
    return digitos.length === 14 && isValidCnpj(digitos);
};

export const downloadBlobResponse = (response, fallbackFilename) => {
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

export const readBlobError = async (error, fallback) => {
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

/* ------------------------------------------------------------------ *
 * Hook de filtros de empresas usado por todas as centrais.
 * ------------------------------------------------------------------ */
const DEFAULT_FILTERS = {
    carteira: '',
    regime: '',
    tagIds: [],
    incluirInativas: false,
    extras: {},
};

const readStoredFilters = (storageKey) => {
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

export const useEmpresaFiltros = ({ storageKey, extraFilters = [], extraPersist = null }) => {
    const [stored] = useState(() => readStoredFilters(storageKey));
    const searchInputRef = useRef(null);

    const [empresas, setEmpresas] = useState([]);
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');

    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, ...(stored?.filters || {}) });
    const [showTagPanel, setShowTagPanel] = useState((stored?.filters?.tagIds || []).length > 0);

    const reload = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const response = await axiosInstance.get('/api/empresas/?all=true');
            setEmpresas(Array.isArray(response.data) ? response.data : []);
            setLoadError('');
        } catch (error) {
            console.error('Erro ao carregar empresas:', error);
            setLoadError('Não foi possível carregar as empresas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reload();
        axiosInstance.get('/api/tags/')
            .then((response) => setTags(Array.isArray(response.data) ? response.data : []))
            .catch((error) => console.error('Erro ao carregar tags:', error));
    }, [reload]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ filters, ...(extraPersist || {}) }));
        } catch {
            // Sem armazenamento os filtros valem apenas nesta sessão.
        }
    }, [storageKey, filters, extraPersist]);

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

    const updateFilters = useCallback((patch) => setFilters((current) => ({ ...current, ...patch })), []);

    const toggleTag = useCallback((tagId) => {
        setFilters((current) => ({
            ...current,
            tagIds: current.tagIds.includes(tagId)
                ? current.tagIds.filter((id) => id !== tagId)
                : [...current.tagIds, tagId],
        }));
    }, []);

    const toggleExtra = useCallback((key) => {
        setFilters((current) => ({
            ...current,
            extras: { ...current.extras, [key]: !current.extras?.[key] },
        }));
    }, []);

    const clearFilters = useCallback(() => {
        setSearch('');
        setDebouncedSearch('');
        setFilters({ ...DEFAULT_FILTERS, extras: {} });
    }, []);

    return {
        stored,
        empresas, tags, loading, loadError, reload,
        search, setSearch, debouncedSearch, searchInputRef,
        filters, updateFilters, toggleTag, toggleExtra, clearFilters,
        showTagPanel, setShowTagPanel,
        carteiraOptions, regimeOptions,
        filteredEmpresas, activeFilterCount,
        extraFilters,
    };
};

/* ------------------------------------------------------------------ *
 * Barra de filtros compartilhada.
 * `resultado` permite que a página informe a contagem já com os seus
 * próprios filtros aplicados; `children` recebe chips extras da página.
 * ------------------------------------------------------------------ */
export const EmpresaFiltros = ({ filtros, resultado, children }) => {
    const {
        tags, search, setSearch, searchInputRef,
        filters, updateFilters, toggleTag, toggleExtra, clearFilters,
        showTagPanel, setShowTagPanel,
        carteiraOptions, regimeOptions,
        empresas, filteredEmpresas, activeFilterCount, extraFilters,
    } = filtros;

    const total = resultado ?? filteredEmpresas.length;

    return (
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
                        <button type="button" onClick={() => setSearch('')} className="opacity-60 transition hover:opacity-100" title="Limpar busca">
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
                            {filters.tagIds.length > 1 && (
                                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                    Com várias tags marcadas, aparecem empresas que tenham <span className="font-semibold">qualquer uma</span> delas.
                                </p>
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
                {children}
                <span className="ml-auto inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <FunnelIcon className="h-4 w-4" />
                    {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) ativo(s) · ` : ''}
                    <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{total}</span>
                    de {empresas.length} empresas
                </span>
            </div>
        </div>
    );
};

/* ------------------------------------------------------------------ *
 * Identidade da empresa usada nas linhas das tabelas.
 * ------------------------------------------------------------------ */
export const EmpresaIdentidade = ({ empresa, alerta }) => (
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
            {alerta}
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
);

/* ------------------------------------------------------------------ *
 * Estados de lista compartilhados.
 * ------------------------------------------------------------------ */
export const CentralCarregando = ({ texto = 'Carregando empresas...' }) => (
    <div className={`${cardClass} flex items-center justify-center gap-3 p-10 text-sm text-gray-500 dark:text-gray-400`}>
        <ArrowPathIcon className="h-5 w-5 animate-spin" />
        {texto}
    </div>
);

export const CentralVazio = ({ temFiltros, onLimpar }) => (
    <div className={`${cardClass} p-10 text-center`}>
        <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Nenhuma empresa encontrada</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {temFiltros ? 'Nenhuma empresa atende aos filtros selecionados.' : 'Nenhuma empresa disponível para consulta.'}
        </p>
        {temFiltros && (
            <button type="button" onClick={onLimpar} className={`mt-4 ${primaryButtonClass}`}>
                Limpar filtros
            </button>
        )}
    </div>
);
