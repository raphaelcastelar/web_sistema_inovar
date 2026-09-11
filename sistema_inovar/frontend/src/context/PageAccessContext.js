import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ExclamationTriangleIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { CentralCarregando } from '../components/centralShared';

const PageAccessContext = createContext(null);

export const PageAccessProvider = ({ children }) => {
    const location = useLocation();
    const [pages, setPages] = useState([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const hasRequestedPages = useRef(false);

    const refreshPages = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setLoading(true);
        try {
            const response = await axiosInstance.get('/api/paginas-acesso/');
            setPages(response.data?.paginas || []);
            setIsAdmin(Boolean(response.data?.is_admin));
            setError('');
        } catch (requestError) {
            console.error('Erro ao carregar as permissões das páginas.', requestError);
            setError('Não foi possível verificar a disponibilidade das páginas.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const silent = hasRequestedPages.current;
        hasRequestedPages.current = true;
        refreshPages({ silent });
    }, [location.pathname, refreshPages]);

    useEffect(() => {
        const refreshSilently = () => refreshPages({ silent: true });
        const intervalId = window.setInterval(refreshSilently, 60000);
        window.addEventListener('focus', refreshSilently);
        return () => {
            window.clearInterval(intervalId);
            window.removeEventListener('focus', refreshSilently);
        };
    }, [refreshPages]);

    const pagesByKey = useMemo(
        () => Object.fromEntries(pages.map((page) => [page.chave, page])),
        [pages],
    );

    const canAccess = useCallback((pageKey) => {
        const page = pagesByKey[pageKey];
        if (page) return Boolean(page.acessivel);
        if (pageKey === 'gerenciar_paginas') return false;
        return Boolean(error);
    }, [error, pagesByKey]);

    const value = useMemo(() => ({
        pages,
        pagesByKey,
        isAdmin,
        loading,
        error,
        canAccess,
        refreshPages,
    }), [pages, pagesByKey, isAdmin, loading, error, canAccess, refreshPages]);

    return <PageAccessContext.Provider value={value}>{children}</PageAccessContext.Provider>;
};

export const usePageAccess = () => {
    const context = useContext(PageAccessContext);
    if (!context) throw new Error('usePageAccess deve ser usado dentro de PageAccessProvider.');
    return context;
};

export const PageGate = ({ pageKey, children }) => {
    const { canAccess, error, loading, pagesByKey } = usePageAccess();

    if (loading) {
        return <CentralCarregando texto="Verificando acesso..." />;
    }

    if (canAccess(pageKey)) {
        return children;
    }

    const page = pagesByKey[pageKey];
    const disabled = page && !page.ativa && page.gerenciavel;
    const fallbackPage = Object.values(pagesByKey).find((item) => item.acessivel && item.chave !== pageKey);

    return (
        <div className="flex min-h-[65vh] items-center justify-center text-gray-900 dark:text-gray-100">
            <div className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${disabled ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    {disabled ? <ExclamationTriangleIcon className="h-7 w-7" /> : <LockClosedIcon className="h-7 w-7" />}
                </div>
                <h1 className="mt-4 text-xl font-bold text-gray-950 dark:text-white">
                    {disabled ? 'Página temporariamente indisponível' : 'Acesso não autorizado'}
                </h1>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {error || (disabled
                        ? 'Esta página foi desativada pela administração.'
                        : 'Seu perfil não possui permissão para acessar esta página.')}
                </p>
                <Link to={fallbackPage?.rota || '/login'} className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                    {fallbackPage ? `Abrir ${fallbackPage.nome}` : 'Voltar ao login'}
                </Link>
            </div>
        </div>
    );
};
