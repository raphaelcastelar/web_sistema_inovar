import React from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowPathIcon,
    CheckCircleIcon,
    EnvelopeIcon,
    FolderIcon,
    PencilIcon,
    PhoneIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';
import { formatCnpj } from '../utils/cnpj';

const HEADERS = ['Empresa', 'CNPJ', 'Regime / porte', 'Carteira', 'Contato', 'Situação', 'Ações'];

const REGIME_LABELS = {
    'SIMPLES NACIONAL': 'Simples Nacional',
    'LUCRO REAL': 'Lucro Real',
    'LUCRO PRESUMIDO': 'Lucro Presumido',
    OUTROS: 'Outros',
};

const initials = (name = '') => {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '—';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

const regimeLabel = (value) => REGIME_LABELS[value] || value || 'Não informado';

const actionClass = 'inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:cursor-wait disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:bg-gray-800 dark:hover:text-white';

function TableHeader() {
    return (
        <thead className="bg-gray-50 dark:bg-gray-950/50">
            <tr>
                {HEADERS.map((header, index) => (
                    <th
                        key={header}
                        className={`border-b border-gray-200 px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:border-gray-800 dark:text-gray-400 ${index === HEADERS.length - 1 ? 'text-right' : ''}`}
                    >
                        {header}
                    </th>
                ))}
            </tr>
        </thead>
    );
}

function TableSkeleton() {
    return (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse">
                    <TableHeader />
                    <tbody className="animate-pulse">
                        {Array.from({ length: 7 }).map((_, row) => (
                            <tr key={row} className="border-b border-gray-100 last:border-b-0 dark:border-gray-800">
                                {HEADERS.map((header, column) => (
                                    <td key={header} className="px-4 py-4">
                                        <span className={`block h-3 rounded bg-gray-200 dark:bg-gray-800 ${column === 0 ? 'w-52' : column === 6 ? 'ml-auto w-28' : 'w-24'}`} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function EmpresaTable({
    empresas,
    loading = false,
    refreshing,
    isAdmin,
    reactivatingId,
    deletingId,
    selectedTagIds,
    onTag,
    onReactivate,
    onDelete,
    onNavigate,
}) {
    if (loading) return <TableSkeleton />;

    return (
        <div className={`overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm transition-opacity dark:border-gray-800 dark:bg-gray-900 ${refreshing ? 'opacity-60' : ''}`}>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[1120px] border-collapse">
                    <TableHeader />
                    <tbody>
                        {empresas.map((empresa) => {
                            const inactive = !empresa.ativo;
                            const reactivating = reactivatingId === empresa.id;
                            const deleting = deletingId === empresa.id;
                            const companyTags = empresa.tags || [];

                            return (
                                <tr
                                    key={empresa.id}
                                    className={`group border-b border-gray-100 transition-colors last:border-b-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${inactive ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
                                >
                                    <td className="w-[290px] px-4 py-3.5 align-middle">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                                                {initials(empresa.nome)}
                                            </span>
                                            <div className="min-w-0">
                                                <Link
                                                    to={`/empresas/${empresa.id}/pastas`}
                                                    onClick={onNavigate}
                                                    className="block truncate text-sm font-semibold text-gray-950 hover:underline dark:text-gray-100"
                                                    title={empresa.nome}
                                                >
                                                    {empresa.nome}
                                                </Link>
                                                {companyTags.length > 0 && (
                                                    <div className="mt-1.5 flex max-w-[220px] items-center gap-1 overflow-hidden">
                                                        {companyTags.slice(0, 2).map((tag) => {
                                                            const selected = selectedTagIds.includes(String(tag.id));
                                                            return (
                                                                <button
                                                                    key={tag.id}
                                                                    type="button"
                                                                    onClick={() => onTag(String(tag.id))}
                                                                    className={`inline-flex max-w-[92px] items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                                                                    title={`Filtrar por ${tag.nome}`}
                                                                >
                                                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                                    <span className="truncate">{tag.nome}</span>
                                                                </button>
                                                            );
                                                        })}
                                                        {companyTags.length > 2 && <span className="text-[10px] font-semibold text-gray-400">+{companyTags.length - 2}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-3.5 font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300">
                                        {formatCnpj(empresa.cnpj) || '—'}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-200">{regimeLabel(empresa.regime_tributario)}</span>
                                        <span className="mt-0.5 block text-xs text-gray-400">{empresa.porte_empresa || 'Porte não informado'}</span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        {empresa.carteira_clientes ? (
                                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {empresa.carteira_clientes}
                                            </span>
                                        ) : <span className="text-sm text-gray-400">—</span>}
                                    </td>
                                    <td className="max-w-[220px] px-4 py-3.5">
                                        <div className="grid gap-1 text-xs text-gray-600 dark:text-gray-300">
                                            {empresa.email && (
                                                <a href={`mailto:${empresa.email}`} className="flex min-w-0 items-center gap-1.5 hover:text-gray-950 dark:hover:text-white" title={empresa.email}>
                                                    <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                    <span className="truncate">{empresa.email}</span>
                                                </a>
                                            )}
                                            {empresa.telefone && (
                                                <a href={`tel:${empresa.telefone}`} className="flex items-center gap-1.5 hover:text-gray-950 dark:hover:text-white">
                                                    <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                                    <span>{empresa.telefone}</span>
                                                </a>
                                            )}
                                            {!empresa.email && !empresa.telefone && <span className="text-gray-400">Sem contato</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${inactive ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900'}`}>
                                            <span className={`h-1.5 w-1.5 rounded-full ${inactive ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                            {inactive ? 'Inativa' : 'Ativa'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center justify-end gap-1.5">
                                            {inactive && (
                                                <button type="button" onClick={() => onReactivate(empresa)} disabled={reactivating} className={`${actionClass} text-emerald-600 hover:text-emerald-700 dark:text-emerald-400`} title="Reativar empresa" aria-label={`Reativar ${empresa.nome}`}>
                                                    {reactivating ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                                                </button>
                                            )}
                                            <Link to={`/empresas/${empresa.id}/pastas`} onClick={onNavigate} className={actionClass} title="Acessar pastas" aria-label={`Acessar pastas de ${empresa.nome}`}>
                                                <FolderIcon className="h-4 w-4" />
                                            </Link>
                                            <Link to={`/empresas/editar/${empresa.id}`} onClick={onNavigate} className={actionClass} title="Editar empresa" aria-label={`Editar ${empresa.nome}`}>
                                                <PencilIcon className="h-4 w-4" />
                                            </Link>
                                            {isAdmin && (
                                                <button type="button" onClick={() => onDelete(empresa)} disabled={deleting} className={`${actionClass} hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:hover:border-rose-900 dark:hover:bg-rose-950/30 dark:hover:text-rose-400`} title="Excluir empresa" aria-label={`Excluir ${empresa.nome}`}>
                                                    {deleting ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TrashIcon className="h-4 w-4" />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
