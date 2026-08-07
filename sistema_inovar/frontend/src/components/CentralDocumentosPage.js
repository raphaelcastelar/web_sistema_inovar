import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    CalendarDaysIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import {
    CentralCarregando,
    CentralVazio,
    EmpresaFiltros,
    EmpresaIdentidade,
    cardClass,
    chipClass,
    chipOff,
    controlClass,
    downloadBlobResponse,
    labelClass,
    readBlobError,
    rowActionClass,
    secondaryButtonClass,
    somenteDigitosCnpj,
    temCnpjNumerico,
    thClass,
    toneStyles,
    useEmpresaFiltros,
} from './centralShared';

const MONTHS = [
    ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
    ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
    ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
];

const shiftCompetencia = (monthsBack) => {
    const reference = new Date();
    reference.setDate(1);
    reference.setMonth(reference.getMonth() - monthsBack);
    return {
        month: String(reference.getMonth() + 1).padStart(2, '0'),
        year: String(reference.getFullYear()),
    };
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
    const cancelBatchRef = useRef(false);
    const inicial = useMemo(() => shiftCompetencia(0), []);

    const [month, setMonth] = useState(inicial.month);
    const [year, setYear] = useState(inicial.year);
    const extraPersist = useMemo(() => ({ month, year }), [month, year]);

    const filtros = useEmpresaFiltros({ storageKey, extraFilters, extraPersist });
    const { filteredEmpresas, empresas, loading, reload, loadError, activeFilterCount, clearFilters } = filtros;

    const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', text }
    const [selectedIds, setSelectedIds] = useState([]);
    const [pending, setPending] = useState({});
    const [rowStatus, setRowStatus] = useState({});
    const [batch, setBatch] = useState(null);

    // Restaura a competência salva na última visita.
    useEffect(() => {
        if (filtros.stored?.month) setMonth(filtros.stored.month);
        if (filtros.stored?.year) setYear(filtros.stored.year);
    }, [filtros.stored]);

    useEffect(() => {
        if (loadError) setFeedback({ type: 'error', text: loadError });
    }, [loadError]);

    const periodo = `${year}${month}`;

    const years = useMemo(() => {
        const current = new Date().getFullYear();
        return Array.from({ length: 8 }, (_, index) => String(current + 1 - index));
    }, []);

    // Mantém a seleção coerente com o que está visível na tabela.
    useEffect(() => {
        setSelectedIds((current) => {
            const visibleIds = new Set(filteredEmpresas.map((empresa) => empresa.id));
            const next = current.filter((id) => visibleIds.has(id));
            return next.length === current.length ? current : next;
        });
    }, [filteredEmpresas]);

    const selectableEmpresas = useMemo(
        () => filteredEmpresas.filter((empresa) => temCnpjNumerico(empresa.cnpj)),
        [filteredEmpresas],
    );
    const allSelected = selectableEmpresas.length > 0 && selectedIds.length === selectableEmpresas.length;

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

    const executeService = useCallback(async (empresa, service) => {
        const cnpjLimpo = somenteDigitosCnpj(empresa.cnpj);
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
            (empresa) => selectedIds.includes(empresa.id) && temCnpjNumerico(empresa.cnpj),
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
                        onClick={() => reload({ silent: true })}
                        className={secondaryButtonClass}
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

            <EmpresaFiltros filtros={filtros} />

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
                                    className={secondaryButtonClass}
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
                            {batch.running ? (
                                <button type="button" onClick={() => { cancelBatchRef.current = true; }} className={secondaryButtonClass}>
                                    <XMarkIcon className="h-4 w-4" />
                                    Cancelar
                                </button>
                            ) : (
                                <button type="button" onClick={() => setBatch(null)} className={secondaryButtonClass}>
                                    <XMarkIcon className="h-4 w-4" />
                                    Fechar
                                </button>
                            )}
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
            {loading ? (
                <CentralCarregando />
            ) : filteredEmpresas.length === 0 ? (
                <CentralVazio temFiltros={activeFilterCount > 0} onLimpar={clearFilters} />
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
                                    <th scope="col" className={thClass}>Empresa</th>
                                    <th scope="col" className={`hidden lg:table-cell ${thClass}`}>Classificação</th>
                                    <th scope="col" className={`hidden xl:table-cell ${thClass}`}>Última ação</th>
                                    <th scope="col" className={`text-right ${thClass}`}>Documentos</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredEmpresas.map((empresa) => {
                                    const cnpjValido = temCnpjNumerico(empresa.cnpj);
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
                                                <EmpresaIdentidade
                                                    empresa={empresa}
                                                    alerta={!cnpjValido && (
                                                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400">
                                                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                                            CNPJ inválido no cadastro
                                                        </p>
                                                    )}
                                                />
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
