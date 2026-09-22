import React, { useMemo, useState } from 'react';
import {
    CheckCircleIcon,
    ExclamationCircleIcon,
    EyeIcon,
    EyeSlashIcon,
    LockClosedIcon,
    MagnifyingGlassIcon,
    ShieldCheckIcon,
    UserGroupIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { CentralCarregando } from './centralShared';
import { usePageAccess } from '../context/PageAccessContext';

const roles = [
    { field: 'permite_admin', label: 'Administrador', short: 'Admin' },
    { field: 'permite_fiscal', label: 'Departamento Fiscal', short: 'Fiscal' },
    { field: 'permite_pessoal', label: 'Departamento Pessoal', short: 'Pessoal' },
];
const navbarCategories = ['Principal', 'Cadastros', 'Arquivo', 'Fiscal', 'Pessoal', 'Financeiro', 'Documentos', 'Controle'];

const GerenciarPaginasPage = () => {
    const { pages, loading, refreshPages } = usePageAccess();
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todas');
    const [savingKeys, setSavingKeys] = useState([]);
    const [feedback, setFeedback] = useState(null);

    const filteredPages = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('pt-BR');
        return pages.filter((page) => {
            const matchesText = !term || [page.nome, page.descricao, page.rota, page.secao]
                .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
            const matchesStatus = statusFilter === 'todas'
                || (statusFilter === 'ativas' && page.ativa)
                || (statusFilter === 'inativas' && !page.ativa);
            return matchesText && matchesStatus;
        });
    }, [pages, search, statusFilter]);

    const groupedPages = useMemo(() => navbarCategories
        .map((category) => [category, filteredPages.filter((page) => page.secao === category)])
        .filter(([, categoryPages]) => categoryPages.length > 0), [filteredPages]);

    const stats = useMemo(() => ({
        total: pages.length,
        active: pages.filter((page) => page.ativa).length,
        inactive: pages.filter((page) => page.gerenciavel && !page.ativa).length,
    }), [pages]);

    const updatePage = async (page, changes) => {
        const changesOnlyCategory = Object.keys(changes).every((field) => field === 'secao');
        if ((!page.gerenciavel && !changesOnlyCategory) || savingKeys.includes(page.chave)) return;
        setSavingKeys((current) => [...current, page.chave]);
        setFeedback(null);
        try {
            await axiosInstance.patch(`/api/paginas-acesso/${page.chave}/`, changes);
            await refreshPages({ silent: true });
            setFeedback({ type: 'success', text: `${page.nome} atualizada com sucesso.` });
        } catch (error) {
            setFeedback({
                type: 'error',
                text: error.response?.data?.detail || `Não foi possível atualizar ${page.nome}.`,
            });
        } finally {
            setSavingKeys((current) => current.filter((key) => key !== page.chave));
        }
    };

    if (loading) return <CentralCarregando texto="Carregando páginas..." />;

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <header>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Administração</p>
                <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Gerenciar páginas</h1>
                <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    Controle o navbar, a disponibilidade das áreas e quais equipes podem acessá-las.
                </p>
            </header>

            <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard label="Páginas cadastradas" value={stats.total} icon={EyeIcon} />
                <SummaryCard label="Disponíveis" value={stats.active} icon={CheckCircleIcon} tone="emerald" />
                <SummaryCard label="Desativadas" value={stats.inactive} icon={EyeSlashIcon} tone="amber" />
            </div>

            {feedback && (
                <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${feedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'}`}>
                    {feedback.type === 'success' ? <CheckCircleIcon className="mt-0.5 h-4 w-4" /> : <ExclamationCircleIcon className="mt-0.5 h-4 w-4" />}
                    {feedback.text}
                </div>
            )}

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex h-10 w-full max-w-xl items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <MagnifyingGlassIcon className="h-4 w-4" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar página, seção ou endereço..."
                            className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
                        />
                    </label>
                    <div className="flex rounded-md bg-slate-100 p-1 dark:bg-slate-800">
                        {[
                            ['todas', 'Todas'],
                            ['ativas', 'Ativas'],
                            ['inativas', 'Desativadas'],
                        ].map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setStatusFilter(value)}
                                className={`rounded px-3 py-1.5 text-xs font-semibold transition ${statusFilter === value
                                    ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            </section>

            {groupedPages.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
                    Nenhuma página encontrada com esses filtros.
                </div>
            ) : groupedPages.map(([section, sectionPages]) => (
                <section key={section} className="space-y-3">
                    <div className="flex items-center gap-3">
                        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{section}</h2>
                        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                    </div>
                    <div className="grid gap-3 xl:grid-cols-2">
                        {sectionPages.map((page) => {
                            const saving = savingKeys.includes(page.chave);
                            return (
                                <article key={page.chave} className={`rounded-lg border bg-white p-4 shadow-sm transition dark:bg-gray-900 ${page.ativa ? 'border-gray-200 dark:border-gray-800' : 'border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/10'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-gray-950 dark:text-white">{page.nome}</h3>
                                                {!page.gerenciavel && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                        <LockClosedIcon className="h-3 w-3" /> Permanente
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{page.descricao}</p>
                                            <code className="mt-2 block truncate text-xs text-gray-400" title={page.rota}>{page.rota}</code>
                                            {page.atualizado_por_nome && (
                                                <p className="mt-1 text-[11px] text-gray-400">
                                                    Alterada por {page.atualizado_por_nome} em {new Date(page.atualizado_em).toLocaleString('pt-BR')}
                                                </p>
                                            )}
                                            <label className="mt-3 block max-w-xs">
                                                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                                    Categoria no navbar
                                                </span>
                                                <select
                                                    value={page.secao}
                                                    onChange={(event) => updatePage(page, { secao: event.target.value })}
                                                    disabled={saving}
                                                    className="h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20"
                                                >
                                                    {navbarCategories.map((category) => (
                                                        <option key={category} value={category}>{category}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={page.ativa}
                                            aria-label={`${page.ativa ? 'Desativar' : 'Ativar'} ${page.nome}`}
                                            onClick={() => updatePage(page, { ativa: !page.ativa })}
                                            disabled={!page.gerenciavel || saving}
                                            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60 ${page.ativa ? 'bg-emerald-600' : 'bg-gray-300 dark:bg-gray-700'}`}
                                        >
                                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${page.ativa ? 'translate-x-0 left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                            <UserGroupIcon className="h-4 w-4" /> Permissões
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {roles.map((role) => {
                                                const allowed = page[role.field];
                                                return (
                                                    <button
                                                        key={role.field}
                                                        type="button"
                                                        onClick={() => updatePage(page, { [role.field]: !allowed })}
                                                        disabled={!page.gerenciavel || saving}
                                                        title={role.label}
                                                        className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${allowed
                                                            ? 'border-slate-300 bg-slate-100 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
                                                            : 'border-gray-200 bg-white text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500'}`}
                                                    >
                                                        <ShieldCheckIcon className="h-4 w-4 shrink-0" />
                                                        <span className="truncate">{role.short}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
};

const SummaryCard = ({ label, value, icon: Icon, tone = 'slate' }) => {
    const tones = {
        slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
    };
    return (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{label}</p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-gray-950 dark:text-white">{value}</p>
            </div>
            <div className={`rounded-md p-2.5 ${tones[tone]}`}><Icon className="h-5 w-5" /></div>
        </div>
    );
};

export default GerenciarPaginasPage;
