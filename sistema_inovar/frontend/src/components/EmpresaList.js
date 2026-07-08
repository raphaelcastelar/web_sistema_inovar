import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon, PlusIcon, FolderIcon, MagnifyingGlassIcon, BuildingOffice2Icon, TagIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';


const EMPRESA_LIST_STATE_KEY = 'empresaListState';
const DEFAULT_CARTEIRA_OPTIONS = ['INOVAR ES', 'INOVAR MG', 'NOVVA'];
const PAGE_SIZE = 24;
const PAGE_CACHE_LIMIT = 30;

const getSavedListState = () => {
    try {
        return JSON.parse(sessionStorage.getItem(EMPRESA_LIST_STATE_KEY) || 'null');
    } catch {
        return null;
    }
};

function SummaryCard({ label, value, tone }) {
    const toneClass = {
        neutral: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-800',
        success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
        muted: 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-gray-900/70 dark:text-gray-200 dark:ring-gray-800',
    }[tone || 'neutral'];

    return (
        <div className={`min-w-0 rounded-lg px-4 py-3 ring-1 ${toneClass}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
            <p className="mt-2 break-words text-2xl font-bold tabular-nums">{value}</p>
        </div>
    );
}

const EmpresaList = () => {
    const savedListStateRef = React.useRef(getSavedListState());
    const skipInitialVisibleResetRef = React.useRef(Boolean(savedListStateRef.current));
    const hasLoadedOnceRef = React.useRef(false);
    const pageCacheRef = React.useRef(new Map());
    const savedListState = savedListStateRef.current;
    const [empresas, setEmpresas] = useState([]);
    const [search, setSearch] = useState(savedListState?.search || '');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [tags, setTags] = useState([]);
    const [selectedTagIds, setSelectedTagIds] = useState(Array.isArray(savedListState?.selectedTagIds) ? savedListState.selectedTagIds : []);
    const [selectedCarteira, setSelectedCarteira] = useState(savedListState?.selectedCarteira || '');
    const [activeTab, setActiveTab] = useState(savedListState?.activeTab || 'ativadas'); // 'ativadas' ou 'nao-ativadas'
    const [reactivatingId, setReactivatingId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);
    const [page, setPage] = useState(Math.max(Number(savedListState?.page) || 1, 1));
    const [totalCount, setTotalCount] = useState(0);
    const [nextPageUrl, setNextPageUrl] = useState(null);
    const [previousPageUrl, setPreviousPageUrl] = useState(null);
    const [summary, setSummary] = useState({ total: 0, ativadas: 0, naoAtivadas: 0 });
    const [debouncedSearch, setDebouncedSearch] = useState(savedListState?.search || '');

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
                setError('Erro ao verificar permissões');
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

    useEffect(() => {
        if (skipInitialVisibleResetRef.current) {
            skipInitialVisibleResetRef.current = false;
            return;
        }
        setPage(1);
    }, [debouncedSearch, activeTab, selectedTagIds, selectedCarteira]);

    const buildRequestParams = useCallback((pageNumber) => {
        const params = {
            paginated: 'true',
            page: pageNumber,
            page_size: PAGE_SIZE,
            ativo: activeTab === 'ativadas' ? 'true' : 'false',
        };

        const trimmedSearch = debouncedSearch.trim();
        if (trimmedSearch) params.search = trimmedSearch;
        if (selectedCarteira) params.carteira_clientes = selectedCarteira;
        if (selectedTagIds.length > 0) params.tags = [...selectedTagIds].sort().join(',');

        return params;
    }, [activeTab, debouncedSearch, selectedCarteira, selectedTagIds]);

    const getCacheKey = useCallback((pageNumber) => {
        const params = buildRequestParams(pageNumber);
        return JSON.stringify(params);
    }, [buildRequestParams]);

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
    }, []);

    const prefetchPage = useCallback(async (pageNumber) => {
        const cacheKey = getCacheKey(pageNumber);
        if (pageCacheRef.current.has(cacheKey)) return;

        try {
            const response = await axiosInstance.get('/api/empresas/', {
                params: buildRequestParams(pageNumber),
            });
            rememberPageData(cacheKey, response.data || {});
        } catch {
            // Prefetch é uma melhoria oportunista; falhas aqui não devem incomodar o usuário.
        }
    }, [buildRequestParams, getCacheKey, rememberPageData]);

    const fetchEmpresas = useCallback(async ({ force = false } = {}) => {
        const cacheKey = getCacheKey(page);
        const cachedData = pageCacheRef.current.get(cacheKey);
        if (!force && cachedData) {
            applyPageData(cachedData);
            hasLoadedOnceRef.current = true;
            setLoading(false);
            setRefreshing(false);
            if (cachedData.next) {
                prefetchPage(page + 1);
            }
            return;
        }

        const hasLoadedOnce = hasLoadedOnceRef.current;
        if (hasLoadedOnce) {
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
            if (data.next) {
                prefetchPage(page + 1);
            }
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
    }, [applyPageData, buildRequestParams, getCacheKey, page, prefetchPage, rememberPageData]);

    useEffect(() => {
        fetchEmpresas();
    }, [fetchEmpresas]);

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta empresa? Esta ação apaga também a pasta da empresa no servidor.')) {
            axiosInstance.delete(`/api/empresas/${id}/`)
                .then(() => {
                    pageCacheRef.current.clear();
                    fetchEmpresas({ force: true });
                })
                .catch(error => {
                    console.error('Erro ao excluir empresa:', error.response?.data || error.message);
                    alert(`Falha ao excluir a empresa: ${error.response?.data?.error || error.message}`);
                });
        }
    };

    const handleReactivate = async (empresa) => {
        if (reactivatingId) return;

        setReactivatingId(empresa.id);
        setStatusMessage(null);

        try {
            await axiosInstance.patch(`/api/empresas/${empresa.id}/`, { ativo: true });
            setStatusMessage({ type: 'success', text: `${empresa.nome} foi reativada com sucesso.` });
            pageCacheRef.current.clear();
            fetchEmpresas({ force: true });
        } catch (err) {
            console.error('Erro ao reativar empresa:', err.response?.data || err.message);
            setStatusMessage({
                type: 'error',
                text: err.response?.status === 403
                    ? 'Voce nao tem permissao para reativar esta empresa.'
                    : `Falha ao reativar a empresa: ${err.response?.data?.error || err.message}`,
            });
        } finally {
            setReactivatingId(null);
        }
    };

    const saveListPosition = () => {
        sessionStorage.setItem(EMPRESA_LIST_STATE_KEY, JSON.stringify({
            scrollY: window.scrollY,
            search,
            activeTab,
            selectedTagIds,
            selectedCarteira,
            page,
        }));
    };

    const toggleTagFilter = (tagId) => {
        setSelectedTagIds((prev) => (
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId]
        ));
    };

    const visibleEmpresas = empresas;
    const totalPages = Math.max(Math.ceil(totalCount / PAGE_SIZE), 1);

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

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center text-gray-900 dark:text-gray-100">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="mb-4 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800"></div>
                    <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-800"></div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                {error}
            </div>
        );
    }

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
                {isAdmin && (
                    <Link
                        to="/empresas/cadastrar"
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white sm:w-auto"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Nova Empresa
                    </Link>
                )}
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-3">
                <SummaryCard label="Total" value={summary.total} />
                <SummaryCard label="Ativadas" value={summary.ativadas} tone="success" />
                <SummaryCard label="Não ativadas" value={summary.naoAtivadas} tone="muted" />
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(13rem,18rem)_minmax(16rem,22rem)] xl:items-start">
                    <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <MagnifyingGlassIcon className="h-4 w-4" />
                        <input
                            type="text"
                            placeholder="Buscar por nome, CNPJ ou e-mail"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                        />
                    </label>
                    <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <BuildingOffice2Icon className="h-4 w-4" />
                        <select
                            value={selectedCarteira}
                            onChange={(e) => setSelectedCarteira(e.target.value)}
                            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
                        >
                            <option value="">Todas as carteiras</option>
                            {carteiraOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>
                    <div className="rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                        <div className="flex items-center gap-2 mb-2">
                            <TagIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                            <button
                                type="button"
                                onClick={() => setSelectedTagIds([])}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${selectedTagIds.length === 0 ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                            >
                                Todas
                            </button>
                        </div>
                        <div className="flex max-h-24 flex-wrap gap-2 overflow-y-auto pr-1">
                            {tags.map((tag) => {
                                const selected = selectedTagIds.includes(String(tag.id));
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => toggleTagFilter(String(tag.id))}
                                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${selected ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                                    >
                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                        {tag.nome}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <nav className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        <button
                            onClick={() => setActiveTab('ativadas')}
                            className={`h-9 rounded-md px-3 text-sm font-semibold transition-colors ${activeTab === 'ativadas' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                        >
                            Empresas Ativadas
                        </button>
                        <button
                            onClick={() => setActiveTab('nao-ativadas')}
                            className={`h-9 rounded-md px-3 text-sm font-semibold transition-colors ${activeTab === 'nao-ativadas' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                        >
                            Empresas Não Ativadas
                        </button>
                </nav>
            </div>

            {statusMessage && (
                <div
                    className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${
                        statusMessage.type === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                            : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'
                    }`}
                    role="status"
                >
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>{statusMessage.text}</span>
                </div>
            )}

            {refreshing && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    Atualizando lista...
                </div>
            )}

            {visibleEmpresas.length === 0 ? (
                <div className="rounded-lg border border-gray-200 bg-white p-10 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                        {activeTab === 'ativadas' ? 'Nenhuma empresa ativada' : 'Nenhuma empresa não ativada'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {search ? 'Tente refinar sua busca ou ' : activeTab === 'ativadas' ? 'Nenhuma empresa ativada no momento.' : 'Nenhuma empresa desativada no momento.'}
                        {isAdmin && !search && activeTab === 'ativadas' && <Link to="/empresas/cadastrar" className="font-medium text-slate-900 underline underline-offset-2 dark:text-slate-100">cadastre a primeira</Link>}
                    </p>
                </div>
            ) : (
                <>
                    <motion.div
                        className={`grid gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${refreshing ? 'opacity-60' : 'opacity-100'}`}
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {visibleEmpresas.map(empresa => {
                            const isInactive = !empresa.ativo;
                            const isReactivating = reactivatingId === empresa.id;
                            return (
                                <motion.div
                                    key={empresa.id}
                                    variants={itemVariants}
                                    className={`flex min-w-0 flex-col rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-gray-900 ${
                                        isInactive
                                            ? 'border-amber-200 ring-1 ring-amber-100 dark:border-amber-900/70 dark:ring-amber-900/40'
                                            : 'border-gray-200 dark:border-gray-800'
                                    }`}
                                >
                                    <div className="flex-grow p-4 sm:p-5">
                                        <div className="mb-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="break-words text-base font-semibold leading-tight text-gray-950 dark:text-gray-100">{empresa.nome}</h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{empresa.cnpj}</p>
                                                </div>
                                                {isInactive && (
                                                    <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                                                        Inativa
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 break-all">{empresa.email}</p>
                                        {isInactive && (
                                            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                                                Reative para que a empresa volte aos fluxos operacionais e relatorios ativos.
                                            </p>
                                        )}
                                        {(empresa.tags || []).length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {(empresa.tags || []).map((tag) => (
                                                    <span
                                                        key={tag.id}
                                                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                                    >
                                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                        {tag.nome}
                                                    </span>
                                                ))}
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
                                        <Link to={`/empresas/editar/${empresa.id}`} onClick={saveListPosition} className="flex-1 rounded-md px-3 py-2 text-center text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800" title="Editar">
                                            <PencilIcon className="h-5 w-5 mx-auto" />
                                        </Link>
                                        {isAdmin && (
                                            <button onClick={() => handleDelete(empresa.id)} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors" title="Excluir">
                                                <TrashIcon className="h-5 w-5 mx-auto" />
                                            </button>
                                        )}
                                        <Link to={`/empresas/${empresa.id}/pastas`} className="flex-1 rounded-md px-3 py-2 text-center text-sm text-gray-600 transition-colors hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800" title="Acessar Pastas">
                                            <FolderIcon className="h-5 w-5 mx-auto" />
                                        </Link>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>

                    <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 sm:flex-row">
                        <div>
                            Mostrando página <span className="font-semibold">{page}</span> de <span className="font-semibold">{totalPages}</span>
                            {' '}({totalCount} empresa{totalCount === 1 ? '' : 's'})
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPage((current) => Math.max(current - 1, 1))}
                                disabled={!previousPageUrl || loading}
                                className="rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => setPage((current) => current + 1)}
                                disabled={!nextPageUrl || loading}
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
