import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon, PlusIcon, FolderIcon, MagnifyingGlassIcon, BuildingOffice2Icon, TagIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';


const EMPRESA_LIST_STATE_KEY = 'empresaListState';

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
    const savedListState = savedListStateRef.current;
    const [empresas, setEmpresas] = useState([]);
    const [search, setSearch] = useState(savedListState?.search || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [tags, setTags] = useState([]);
    const [selectedTagIds, setSelectedTagIds] = useState(Array.isArray(savedListState?.selectedTagIds) ? savedListState.selectedTagIds : []);
    const [activeTab, setActiveTab] = useState(savedListState?.activeTab || 'ativadas'); // 'ativadas' ou 'nao-ativadas'
    const [reactivatingId, setReactivatingId] = useState(null);
    const [statusMessage, setStatusMessage] = useState(null);

    // Estado para controle do Infinite Scroll
    const [visibleCount, setVisibleCount] = useState(Math.max(Number(savedListState?.visibleCount) || 24, 24)); // Começa mostrando 24
    const observerTarget = React.useRef(null);

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

        const fetchEmpresas = async () => {
            setLoading(true);
            try {
                const response = await axiosInstance.get('/api/empresas/?all=true');
                setEmpresas(response.data);
            } catch (err) {
                console.error('Erro ao carregar empresas:', err.response?.data || err.message);
                setError(err.response?.status === 403
                    ? 'Você não tem permissão para visualizar empresas.'
                    : `Erro ao carregar empresas: ${err.response?.data?.detail || err.message}`);
            } finally {
                setLoading(false);
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
        fetchEmpresas();
    }, []);

    // Resetar a contagem visível quando mudar a busca ou a aba
    useEffect(() => {
        if (skipInitialVisibleResetRef.current) {
            skipInitialVisibleResetRef.current = false;
            return;
        }
        setVisibleCount(24);
    }, [search, activeTab, selectedTagIds]);

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta empresa? Esta ação apaga também a pasta da empresa no servidor.')) {
            axiosInstance.delete(`/api/empresas/${id}/`)
                .then(() => {
                    setEmpresas(empresas.filter(empresa => empresa.id !== id));
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
            setEmpresas((prev) => prev.map((item) => (
                item.id === empresa.id ? { ...item, ativo: true } : item
            )));
            setStatusMessage({ type: 'success', text: `${empresa.nome} foi reativada com sucesso.` });
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
            visibleCount,
        }));
    };

    const toggleTagFilter = (tagId) => {
        setSelectedTagIds((prev) => (
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId]
        ));
    };

    const filteredEmpresas = useMemo(() => {
        const lowercasedSearch = search.toLowerCase().trim();
        const selectedTagNameById = tags.reduce((acc, tag) => {
            acc[String(tag.id)] = tag.nome?.toLowerCase().trim();
            return acc;
        }, {});

        const matchesSelectedTags = (empresa) => {
            if (selectedTagIds.length === 0) return true;

            const empresaTagNames = new Set(
                (empresa.tags || [])
                    .map((tag) => tag.nome?.toLowerCase().trim())
                    .filter(Boolean)
            );
            const empresaTagIds = new Set((empresa.tags || []).map((tag) => String(tag.id)));

            return selectedTagIds.every((tagId) => {
                const tagName = selectedTagNameById[tagId];
                return tagName ? empresaTagNames.has(tagName) : empresaTagIds.has(tagId);
            });
        };

        if (!lowercasedSearch) {
            return empresas.filter((empresa) => {
                const isInTab = activeTab === 'ativadas' ? empresa.ativo : !empresa.ativo;
                const matchTag = matchesSelectedTags(empresa);
                return isInTab && matchTag;
            });
        }
        const searchDigits = search.replace(/\D/g, '');
        return empresas.filter(empresa => {
            const matchNome = empresa.nome?.toLowerCase().includes(lowercasedSearch);
            const matchEmail = empresa.email?.toLowerCase().includes(lowercasedSearch);
            let matchCnpj = false;
            if (searchDigits.length > 0) {
                const cleanedEmpresaCnpj = empresa.cnpj?.replace(/\D/g, '');
                matchCnpj = cleanedEmpresaCnpj?.includes(searchDigits);
            }
            const matchTag = matchesSelectedTags(empresa);
            const isInTab = activeTab === 'ativadas' ? empresa.ativo : !empresa.ativo;
            return (matchNome || matchEmail || matchCnpj) && isInTab && matchTag;
        });
    }, [empresas, search, activeTab, selectedTagIds, tags]);

    // Intersection Observer para carregar mais itens
    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return;

        // Usa threshold mais baixo e rootMargin para acionar antes do fim da lista
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 24);
                }
            },
            { threshold: 0.25, rootMargin: '200px' }
        );

        observer.observe(target);

        return () => {
            observer.disconnect();
        };
    }, [filteredEmpresas.length, visibleCount]);

    const visibleEmpresas = filteredEmpresas.slice(0, visibleCount);

    const summary = useMemo(() => {
        const ativadas = empresas.filter((empresa) => empresa.ativo).length;
        const naoAtivadas = empresas.length - ativadas;
        return { total: empresas.length, ativadas, naoAtivadas };
    }, [empresas]);

    useEffect(() => {
        const stateToRestore = savedListStateRef.current;
        if (loading || !stateToRestore) return;

        const scrollY = Number(stateToRestore.scrollY) || 0;
        window.requestAnimationFrame(() => {
            window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
            sessionStorage.removeItem(EMPRESA_LIST_STATE_KEY);
            savedListStateRef.current = null;
        });
    }, [loading, filteredEmpresas.length, visibleCount]);

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
                <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1fr)_minmax(16rem,22rem)] xl:items-start">
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

            {filteredEmpresas.length === 0 ? (
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
                        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
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

                    {/* Elemento sentinela para o Infinite Scroll */}
                    {visibleCount < filteredEmpresas.length && (
                        <div ref={observerTarget} className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                            Carregando mais empresas...
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default EmpresaList;
