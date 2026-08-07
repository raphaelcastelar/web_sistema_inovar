import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    CheckCircleIcon,
    EnvelopeIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    FunnelIcon,
    MagnifyingGlassIcon,
    PencilIcon,
    PhoneIcon,
    PlusIcon,
    TagIcon,
    TrashIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { formatCnpj } from '../utils/cnpj';

const EMPRESA_LIST_STATE_KEY = 'empresaListState';
const EMPRESA_FILTERS_KEY = 'empresaListFilters';
const EMPRESA_PAGE_CACHE_KEY = 'empresaListPageCache';
const DEFAULT_CARTEIRA_OPTIONS = ['INOVAR ES', 'INOVAR MG', 'NOVVA'];
const PAGE_SIZE_OPTIONS = [24, 48, 96];
const DEFAULT_PAGE_SIZE = 24;
const PAGE_CACHE_LIMIT = 30;

const cardClass = 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900';
const controlClass = 'h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-slate-500/20';
const chipClass = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors';
const chipOff = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const chipOn = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950';

const readJson = (storage, key, fallback = null) => {
    try {
        const raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
};

const getSavedListState = () => readJson(sessionStorage, EMPRESA_LIST_STATE_KEY);

const getSavedFilters = () => {
    const saved = readJson(localStorage, EMPRESA_FILTERS_KEY);
    if (!saved || typeof saved !== 'object') return null;
    return {
        ...saved,
        selectedTagIds: Array.isArray(saved.selectedTagIds) ? saved.selectedTagIds.map(String) : [],
    };
};

const getSavedPageCache = () => {
    const entries = readJson(sessionStorage, EMPRESA_PAGE_CACHE_KEY, []);
    return new Map(Array.isArray(entries) ? entries : []);
};

const savePageCache = (cache) => {
    try {
        sessionStorage.setItem(EMPRESA_PAGE_CACHE_KEY, JSON.stringify(Array.from(cache.entries())));
    } catch {
        // Se o navegador negar armazenamento, o cache em memória ainda funciona.
    }
};

function SummaryCard({ label, value, tone, active, onClick, hint }) {
    const toneClass = {
        neutral: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-800',
        success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
        muted: 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-gray-900/70 dark:text-gray-200 dark:ring-gray-800',
    }[tone || 'neutral'];

    const content = (
        <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
            <p className="mt-2 break-words text-2xl font-bold tabular-nums">{value}</p>
            {hint && <p className="mt-1 text-[11px] opacity-70">{hint}</p>}
        </>
    );

    if (!onClick) {
        return <div className={`min-w-0 rounded-lg px-4 py-3 ring-1 ${toneClass}`}>{content}</div>;
    }

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`min-w-0 rounded-lg px-4 py-3 text-left ring-1 transition-all hover:brightness-[0.98] ${toneClass} ${active ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-slate-100 dark:ring-offset-gray-950' : ''}`}
        >
            {content}
        </button>
    );
}

const EmpresaList = () => {
    const savedListStateRef = useRef(getSavedListState());
    const skipInitialVisibleResetRef = useRef(Boolean(savedListStateRef.current));
    const hasLoadedOnceRef = useRef(false);
    const pageCacheRef = useRef(getSavedPageCache());
    const searchInputRef = useRef(null);
    // Estado da sessão (volta da edição) tem prioridade sobre os últimos filtros usados.
    const initialState = useRef({ ...(getSavedFilters() || {}), ...(savedListStateRef.current || {}) }).current;

    const [empresas, setEmpresas] = useState([]);
    const [search, setSearch] = useState(initialState.search || '');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [tags, setTags] = useState([]);
    const [selectedTagIds, setSelectedTagIds] = useState(Array.isArray(initialState.selectedTagIds) ? initialState.selectedTagIds : []);
    const [showTagPanel, setShowTagPanel] = useState((initialState.selectedTagIds || []).length > 0);
    const [selectedCarteira, setSelectedCarteira] = useState(initialState.selectedCarteira || '');
    const [activeTab, setActiveTab] = useState(initialState.activeTab || 'ativadas'); // 'ativadas' ou 'nao-ativadas'
    const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS.includes(initialState.pageSize) ? initialState.pageSize : DEFAULT_PAGE_SIZE);
    const [reactivatingId, setReactivatingId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [page, setPage] = useState(Math.max(Number(initialState.page) || 1, 1));
    const [totalCount, setTotalCount] = useState(0);
    const [nextPageUrl, setNextPageUrl] = useState(null);
    const [previousPageUrl, setPreviousPageUrl] = useState(null);
    const [summary, setSummary] = useState({ total: 0, ativadas: 0, naoAtivadas: 0 });
    const [debouncedSearch, setDebouncedSearch] = useState(initialState.search || '');

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setDebouncedSearch(search);
        }, 300);
        return () => window.clearTimeout(timeoutId);
    }, [search]);

    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axiosInstance.get('/api/current-user/');
                setIsAdmin(response.data.is_staff || response.data.is_superuser);
            } catch (err) {
                console.error('Erro ao verificar permissões:', err.response?.data || err.message);
                setIsAdmin(false);
            }
        };

        const fetchTags = async () => {
            try {
                const response = await axiosInstance.get('/api/tags/');
                setTags(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                console.error('Erro ao carregar tags:', err.response?.data || err.message);
            }
        };

        fetchUser();
        fetchTags();
    }, []);

    // Guarda os filtros para a próxima visita à tela.
    useEffect(() => {
        try {
            localStorage.setItem(EMPRESA_FILTERS_KEY, JSON.stringify({
                search, activeTab, selectedTagIds, selectedCarteira, pageSize,
            }));
        } catch {
            // Sem armazenamento disponível os filtros valem apenas nesta sessão.
        }
    }, [search, activeTab, selectedTagIds, selectedCarteira, pageSize]);

    // Atalho "/" para focar a busca.
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

    useEffect(() => {
        if (skipInitialVisibleResetRef.current) {
            skipInitialVisibleResetRef.current = false;
            return;
        }
        setPage(1);
    }, [debouncedSearch, activeTab, selectedTagIds, selectedCarteira, pageSize]);

    const buildRequestParams = useCallback((pageNumber) => {
        const params = {
            paginated: 'true',
            page: pageNumber,
            page_size: pageSize,
            ativo: activeTab === 'ativadas' ? 'true' : 'false',
        };

        const trimmedSearch = debouncedSearch.trim();
        if (trimmedSearch) params.search = trimmedSearch;
        if (selectedCarteira) params.carteira_clientes = selectedCarteira;
        if (selectedTagIds.length > 0) params.tags = [...selectedTagIds].sort().join(',');

        return params;
    }, [activeTab, debouncedSearch, selectedCarteira, selectedTagIds, pageSize]);

    const getCacheKey = useCallback((pageNumber) => JSON.stringify(buildRequestParams(pageNumber)), [buildRequestParams]);

    const applyPageData = useCallback((data) => {
        const results = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);

        setEmpresas(results);
        setTotalCount(Number(data.count) || results.length);
        setNextPageUrl(data.next || null);
        setPreviousPageUrl(data.previous || null);
        setSummary({
            total: Number(data.summary?.total) || 0,
            ativadas: Number(data.summary?.ativadas) || 0,
            naoAtivadas: Number(data.summary?.nao_ativadas) || 0,
        });
    }, []);

    const rememberPageData = useCallback((cacheKey, data) => {
        const cache = pageCacheRef.current;
        if (cache.has(cacheKey)) cache.delete(cacheKey);
        cache.set(cacheKey, data);

        while (cache.size > PAGE_CACHE_LIMIT) {
            const oldestKey = cache.keys().next().value;
            cache.delete(oldestKey);
        }
        savePageCache(cache);
    }, []);

    const fetchEmpresas = useCallback(async ({ force = false } = {}) => {
        const cacheKey = getCacheKey(page);
        const cachedData = pageCacheRef.current.get(cacheKey);
        if (!force && cachedData) {
            applyPageData(cachedData);
            hasLoadedOnceRef.current = true;
            setLoading(false);
            setRefreshing(false);
            return;
        }

        if (hasLoadedOnceRef.current) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError('');
        try {
            const response = await axiosInstance.get('/api/empresas/', {
                params: buildRequestParams(page),
            });
            const data = response.data || {};
            rememberPageData(cacheKey, data);
            applyPageData(data);
        } catch (err) {
            console.error('Erro ao carregar empresas:', err.response?.data || err.message);
            if (err.response?.status === 404 && page > 1) {
                setPage(1);
                return;
            }
            setError(err.response?.status === 403
                ? 'Você não tem permissão para visualizar empresas.'
                : `Erro ao carregar empresas: ${err.response?.data?.detail || err.message}`);
        } finally {
            hasLoadedOnceRef.current = true;
            setLoading(false);
            setRefreshing(false);
        }
    }, [applyPageData, buildRequestParams, getCacheKey, page, rememberPageData]);

    useEffect(() => {
        fetchEmpresas();
    }, [fetchEmpresas]);

    const invalidateCache = () => {
        pageCacheRef.current.clear();
        savePageCache(pageCacheRef.current);
    };

    const handleDelete = async (empresa) => {
        const confirmed = window.confirm(
            `Tem certeza que deseja excluir "${empresa.nome}"? Esta ação apaga também a pasta da empresa no servidor.`,
        );
        if (!confirmed) return;

        setDeletingId(empresa.id);
        setStatusMessage(null);
        try {
            await axiosInstance.delete(`/api/empresas/${empresa.id}/`);
            setStatusMessage({ type: 'success', text: `${empresa.nome} foi excluída.` });
            invalidateCache();
            fetchEmpresas({ force: true });
        } catch (err) {
            console.error('Erro ao excluir empresa:', err.response?.data || err.message);
            setStatusMessage({
                type: 'error',
                text: `Falha ao excluir a empresa: ${err.response?.data?.error || err.message}`,
            });
        } finally {
            setDeletingId(null);
        }
    };

    const handleReactivate = async (empresa) => {
        if (reactivatingId) return;

        setReactivatingId(empresa.id);
        setStatusMessage(null);

        try {
            await axiosInstance.patch(`/api/empresas/${empresa.id}/`, { ativo: true });
            setStatusMessage({ type: 'success', text: `${empresa.nome} foi reativada com sucesso.` });
            invalidateCache();
            fetchEmpresas({ force: true });
        } catch (err) {
            console.error('Erro ao reativar empresa:', err.response?.data || err.message);
            setStatusMessage({
                type: 'error',
                text: err.response?.status === 403
                    ? 'Você não tem permissão para reativar esta empresa.'
                    : `Falha ao reativar a empresa: ${err.response?.data?.error || err.message}`,
            });
        } finally {
            setReactivatingId(null);
        }
    };

    const saveListPosition = () => {
        try {
            sessionStorage.setItem(EMPRESA_LIST_STATE_KEY, JSON.stringify({
                scrollY: window.scrollY,
                search,
                activeTab,
                selectedTagIds,
                selectedCarteira,
                pageSize,
                page,
            }));
        } catch {
            // Sem armazenamento a posição simplesmente não é restaurada.
        }
    };

    const toggleTagFilter = (tagId) => {
        setSelectedTagIds((prev) => (
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId]
        ));
    };

    const activeFilterCount = (debouncedSearch.trim() ? 1 : 0)
        + (selectedCarteira ? 1 : 0)
        + selectedTagIds.length;

    const clearFilters = () => {
        setSearch('');
        setDebouncedSearch('');
        setSelectedCarteira('');
        setSelectedTagIds([]);
    };

    const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
    const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
    const lastItem = Math.min(page * pageSize, totalCount);

    const carteiraOptions = useMemo(() => {
        const options = new Set(DEFAULT_CARTEIRA_OPTIONS);
        if (selectedCarteira) options.add(selectedCarteira);
        return Array.from(options);
    }, [selectedCarteira]);

    useEffect(() => {
        const stateToRestore = savedListStateRef.current;
        if (loading || !stateToRestore) return;

        const scrollY = Number(stateToRestore.scrollY) || 0;
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
            sessionStorage.removeItem(EMPRESA_LIST_STATE_KEY);
            savedListStateRef.current = null;
        });
    }, [loading, empresas.length]);

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Cadastro</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Empresas</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                        Consulte empresas, filtre por tags e acesse cadastro, edição e pastas.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => { invalidateCache(); fetchEmpresas({ force: true }); }}
                        disabled={loading || refreshing}
                        className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                        title="Recarregar a lista"
                    >
                        <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Atualizar
                    </button>
                    {isAdmin && (
                        <Link
                            to="/empresas/cadastrar"
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Nova Empresa
                        </Link>
                    )}
                </div>
            </div>

            <AnimatePresence>
                {statusMessage && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${statusMessage.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'}`}
                        role="status"
                    >
                        {statusMessage.type === 'success'
                            ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            : <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                        <span className="flex-1">{statusMessage.text}</span>
                        <button type="button" onClick={() => setStatusMessage(null)} className="opacity-60 transition hover:opacity-100">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Resumo — os dois últimos cartões também filtram por situação */}
            <div className="grid w-full gap-3 sm:grid-cols-3">
                <SummaryCard label="Total" value={summary.total} hint="Dentro dos filtros atuais" />
                <SummaryCard
                    label="Ativadas"
                    value={summary.ativadas}
                    tone="success"
                    active={activeTab === 'ativadas'}
                    onClick={() => setActiveTab('ativadas')}
                    hint="Clique para listar"
                />
                <SummaryCard
                    label="Não ativadas"
                    value={summary.naoAtivadas}
                    tone="muted"
                    active={activeTab === 'nao-ativadas'}
                    onClick={() => setActiveTab('nao-ativadas')}
                    hint="Clique para listar"
                />
            </div>

            {/* Filtros */}
            <div className={`${cardClass} p-4`}>
                <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.6fr)_minmax(11rem,1fr)_auto]">
                    <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <MagnifyingGlassIcon className="h-4 w-4 flex-shrink-0" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder="Buscar por nome, CNPJ, e-mail ou telefone  ( / )"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="opacity-60 transition hover:opacity-100" title="Limpar busca">
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        )}
                    </label>

                    <select
                        value={selectedCarteira}
                        onChange={(e) => setSelectedCarteira(e.target.value)}
                        className={controlClass}
                        aria-label="Filtrar por carteira"
                    >
                        <option value="">Todas as carteiras</option>
                        {carteiraOptions.map((option) => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowTagPanel((current) => !current)}
                            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${selectedTagIds.length > 0
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}
                        >
                            <TagIcon className="h-4 w-4" />
                            Tags
                            {selectedTagIds.length > 0 && (
                                <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums dark:bg-slate-950/20">{selectedTagIds.length}</span>
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
                                            onClick={() => setSelectedTagIds([])}
                                            className={`${chipClass} ${selectedTagIds.length === 0 ? chipOn : chipOff}`}
                                        >
                                            Todas
                                        </button>
                                        {tags.map((tag) => {
                                            const tagId = String(tag.id);
                                            const selected = selectedTagIds.includes(tagId);
                                            return (
                                                <button
                                                    key={tag.id}
                                                    type="button"
                                                    onClick={() => toggleTagFilter(tagId)}
                                                    className={`${chipClass} ${selected ? chipOn : chipOff}`}
                                                >
                                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                    {tag.nome}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {selectedTagIds.length > 1 && (
                                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                        Com várias tags marcadas, aparecem empresas que tenham <span className="font-semibold">qualquer uma</span> delas.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 pt-3 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                    <span className="inline-flex items-center gap-2">
                        <FunnelIcon className="h-4 w-4" />
                        {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) ativo(s) · ` : 'Sem filtros · '}
                        <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{totalCount}</span>
                        {totalCount === 1 ? ' empresa' : ' empresas'}
                    </span>
                    {refreshing && (
                        <span className="inline-flex items-center gap-1.5">
                            <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                            Atualizando…
                        </span>
                    )}
                    <label className="ml-auto inline-flex items-center gap-2">
                        Por página
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                        >
                            {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                    </label>
                </div>
            </div>

            {error && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                    <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button
                        type="button"
                        onClick={() => fetchEmpresas({ force: true })}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-rose-300 bg-white px-3 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-200"
                    >
                        Tentar novamente
                    </button>
                </div>
            )}

            {loading ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                        <div key={index} className={`${cardClass} animate-pulse p-5`}>
                            <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-800" />
                            <div className="mt-3 h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-800" />
                            <div className="mt-6 h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
                            <div className="mt-6 h-8 w-full rounded bg-gray-200 dark:bg-gray-800" />
                        </div>
                    ))}
                </div>
            ) : empresas.length === 0 ? (
                <div className={`${cardClass} p-10 text-center`}>
                    <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                        {activeFilterCount > 0
                            ? 'Nenhuma empresa para os filtros atuais'
                            : activeTab === 'ativadas' ? 'Nenhuma empresa ativada' : 'Nenhuma empresa não ativada'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {activeFilterCount > 0
                            ? 'Ajuste a busca, a carteira ou as tags selecionadas.'
                            : activeTab === 'ativadas' ? 'Nenhuma empresa ativada no momento.' : 'Nenhuma empresa desativada no momento.'}
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                                Limpar filtros
                            </button>
                        )}
                        {isAdmin && activeFilterCount === 0 && activeTab === 'ativadas' && (
                            <Link
                                to="/empresas/cadastrar"
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Cadastrar a primeira
                            </Link>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    <div className={`grid gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${refreshing ? 'opacity-60' : ''}`}>
                        {empresas.map(empresa => {
                            const isInactive = !empresa.ativo;
                            const isReactivating = reactivatingId === empresa.id;
                            const isDeleting = deletingId === empresa.id;
                            return (
                                <div
                                    key={empresa.id}
                                    className={`flex min-w-0 flex-col rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-900 ${isInactive
                                        ? 'border-amber-200 ring-1 ring-amber-100 dark:border-amber-900/70 dark:ring-amber-900/40'
                                        : 'border-gray-200 dark:border-gray-800'}`}
                                >
                                    <div className="flex-grow p-4 sm:p-5">
                                        <div className="flex items-start gap-3">
                                            <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                <BuildingOffice2Icon className="h-5 w-5" />
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-start justify-between gap-2">
                                                    <h3 className="break-words text-base font-semibold leading-tight text-gray-950 dark:text-gray-100">{empresa.nome}</h3>
                                                    {isInactive && (
                                                        <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                                                            Inativa
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-sm tabular-nums text-gray-500 dark:text-gray-400">{formatCnpj(empresa.cnpj)}</p>
                                                {empresa.carteira_clientes && (
                                                    <span className="mt-2 inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                        {empresa.carteira_clientes}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-4 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                                            {empresa.email && (
                                                <a href={`mailto:${empresa.email}`} className="flex items-start gap-2 break-all transition-colors hover:text-gray-900 dark:hover:text-gray-100">
                                                    <EnvelopeIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                                                    {empresa.email}
                                                </a>
                                            )}
                                            {empresa.telefone && (
                                                <p className="flex items-center gap-2">
                                                    <PhoneIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
                                                    {empresa.telefone}
                                                </p>
                                            )}
                                        </div>

                                        {isInactive && (
                                            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                Reative para que a empresa volte aos fluxos operacionais e relatórios ativos.
                                            </p>
                                        )}

                                        {(empresa.tags || []).length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {(empresa.tags || []).map((tag) => {
                                                    const tagId = String(tag.id);
                                                    const selected = selectedTagIds.includes(tagId);
                                                    return (
                                                        <button
                                                            key={tag.id}
                                                            type="button"
                                                            onClick={() => { toggleTagFilter(tagId); setShowTagPanel(true); }}
                                                            title={selected ? `Remover filtro da tag ${tag.nome}` : `Filtrar por ${tag.nome}`}
                                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${selected
                                                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                                                        >
                                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                            {tag.nome}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-2 border-t border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/70">
                                        {isInactive && (
                                            <button
                                                type="button"
                                                onClick={() => handleReactivate(empresa)}
                                                disabled={isReactivating}
                                                className="flex-[1.4] rounded-md bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                                                title="Reativar empresa"
                                            >
                                                {isReactivating ? (
                                                    <ArrowPathIcon className="mx-auto h-5 w-5 animate-spin" />
                                                ) : (
                                                    <span className="inline-flex items-center justify-center gap-2">
                                                        <CheckCircleIcon className="h-5 w-5" />
                                                        Reativar
                                                    </span>
                                                )}
                                            </button>
                                        )}
                                        <Link
                                            to={`/empresas/editar/${empresa.id}`}
                                            onClick={saveListPosition}
                                            className="flex-1 rounded-md px-3 py-2 text-center text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
                                            title="Editar"
                                            aria-label={`Editar ${empresa.nome}`}
                                        >
                                            <PencilIcon className="mx-auto h-5 w-5" />
                                        </Link>
                                        <Link
                                            to={`/empresas/${empresa.id}/pastas`}
                                            onClick={saveListPosition}
                                            className="flex-1 rounded-md px-3 py-2 text-center text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
                                            title="Acessar pastas"
                                            aria-label={`Acessar pastas de ${empresa.nome}`}
                                        >
                                            <FolderIcon className="mx-auto h-5 w-5" />
                                        </Link>
                                        {isAdmin && (
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(empresa)}
                                                disabled={isDeleting}
                                                className="flex-1 rounded-md px-3 py-2 text-center text-sm text-gray-600 transition-colors hover:bg-red-100 hover:text-red-600 disabled:opacity-60 dark:text-gray-300 dark:hover:bg-red-900/50 dark:hover:text-red-400"
                                                title="Excluir"
                                                aria-label={`Excluir ${empresa.nome}`}
                                            >
                                                {isDeleting
                                                    ? <ArrowPathIcon className="mx-auto h-5 w-5 animate-spin" />
                                                    : <TrashIcon className="mx-auto h-5 w-5" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 sm:flex-row">
                        <div>
                            Mostrando <span className="font-semibold tabular-nums">{firstItem}–{lastItem}</span> de{' '}
                            <span className="font-semibold tabular-nums">{totalCount}</span>
                            {' · '}página <span className="font-semibold tabular-nums">{page}</span> de <span className="font-semibold tabular-nums">{totalPages}</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                                disabled={!previousPageUrl || loading || refreshing}
                                className="rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((current) => current + 1)}
                                disabled={!nextPageUrl || loading || refreshing}
                                className="rounded-md bg-slate-900 px-3 py-2 font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                            >
                                Próxima
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default EmpresaList;
