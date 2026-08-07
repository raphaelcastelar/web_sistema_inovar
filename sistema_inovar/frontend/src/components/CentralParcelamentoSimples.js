import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BanknotesIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    DocumentArrowDownIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import {
    CentralCarregando,
    CentralVazio,
    EmpresaFiltros,
    EmpresaIdentidade,
    cardClass,
    chipClass,
    chipOff,
    chipOn,
    downloadBlobResponse,
    formatCurrency,
    readBlobError,
    rowActionClass,
    secondaryButtonClass,
    somenteDigitosCnpj,
    temCnpjNumerico,
    thClass,
    toneStyles,
    useEmpresaFiltros,
} from './centralShared';

const STORAGE_KEY = 'centralParcelamentoFiltros';

const extraFilters = [
    {
        key: 'somenteSimples',
        label: 'Somente Simples Nacional',
        description: 'O parcelamento ordinário PARCSN existe apenas para optantes do Simples Nacional.',
        predicate: (empresa) => empresa.simples_nacional === true || empresa.regime_tributario === 'SIMPLES NACIONAL',
    },
];

const SITUACOES = [
    { key: 'todas', label: 'Todas' },
    { key: 'com', label: 'Com parcelamento' },
    { key: 'sem', label: 'Sem parcelamento' },
    { key: 'pendentes', label: 'Não consultadas' },
];

/** AAAAMM -> MM/AAAA */
const formatParcela = (value) => {
    const parcela = String(value || '');
    return parcela.length === 6 ? `${parcela.slice(4)}/${parcela.slice(0, 4)}` : parcela;
};

/**
 * O backend responde 400 com "Nenhuma parcela disponível para emissão." quando a
 * empresa simplesmente não tem parcelamento ativo — isso não é falha, é resultado.
 */
const ehSemParcelamento = (mensagem) => /nenhuma parcela/i.test(String(mensagem || ''));

const somaParcelas = (parcelas) => parcelas.reduce((total, item) => total + (Number(item.valor) || 0), 0);

function ResumoCard({ label, value, tone = 'neutral', hint }) {
    const toneClass = {
        neutral: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-800',
        success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
        amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900',
    }[tone];

    return (
        <div className={`min-w-0 rounded-lg px-4 py-3 ring-1 ${toneClass}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{label}</p>
            <p className="mt-2 break-words text-2xl font-bold tabular-nums">{value}</p>
            {hint && <p className="mt-1 text-[11px] opacity-70">{hint}</p>}
        </div>
    );
}

const CentralParcelamentoSimples = () => {
    const cancelBatchRef = useRef(false);
    const filtros = useEmpresaFiltros({ storageKey: STORAGE_KEY, extraFilters });
    const { filteredEmpresas, empresas, loading, reload, loadError, activeFilterCount, clearFilters } = filtros;

    // { [empresaId]: { estado: 'carregando'|'ok'|'sem'|'erro', parcelas, mensagem, consultadoEm } }
    const [consultas, setConsultas] = useState({});
    const [expandidos, setExpandidos] = useState([]);
    const [gerando, setGerando] = useState({});
    const [selectedIds, setSelectedIds] = useState([]);
    const [situacao, setSituacao] = useState('todas');
    const [feedback, setFeedback] = useState(null);
    const [batch, setBatch] = useState(null);

    useEffect(() => {
        if (loadError) setFeedback({ type: 'error', text: loadError });
    }, [loadError]);

    const visibleEmpresas = useMemo(() => {
        if (situacao === 'todas') return filteredEmpresas;
        return filteredEmpresas.filter((empresa) => {
            const consulta = consultas[empresa.id];
            if (situacao === 'pendentes') return !consulta || consulta.estado === 'carregando';
            if (situacao === 'com') return consulta?.estado === 'ok' && consulta.parcelas.length > 0;
            if (situacao === 'sem') return consulta?.estado === 'sem';
            return true;
        });
    }, [filteredEmpresas, consultas, situacao]);

    const resumo = useMemo(() => {
        let consultadas = 0;
        let comParcelamento = 0;
        let parcelasDisponiveis = 0;
        let valorTotal = 0;

        visibleEmpresas.forEach((empresa) => {
            const consulta = consultas[empresa.id];
            if (!consulta || consulta.estado === 'carregando') return;
            consultadas += 1;
            if (consulta.estado === 'ok' && consulta.parcelas.length > 0) {
                comParcelamento += 1;
                parcelasDisponiveis += consulta.parcelas.length;
                valorTotal += somaParcelas(consulta.parcelas);
            }
        });

        return { consultadas, comParcelamento, parcelasDisponiveis, valorTotal };
    }, [visibleEmpresas, consultas]);

    // Mantém a seleção coerente com o que está visível.
    useEffect(() => {
        setSelectedIds((current) => {
            const visibleIds = new Set(visibleEmpresas.map((empresa) => empresa.id));
            const next = current.filter((id) => visibleIds.has(id));
            return next.length === current.length ? current : next;
        });
    }, [visibleEmpresas]);

    const selectableEmpresas = useMemo(
        () => visibleEmpresas.filter((empresa) => temCnpjNumerico(empresa.cnpj)),
        [visibleEmpresas],
    );
    const allSelected = selectableEmpresas.length > 0 && selectedIds.length === selectableEmpresas.length;
    const isBatchRunning = Boolean(batch?.running);

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

    const toggleExpandido = (empresaId) => {
        setExpandidos((current) => (
            current.includes(empresaId)
                ? current.filter((id) => id !== empresaId)
                : [...current, empresaId]
        ));
    };

    const consultarParcelas = useCallback(async (empresa, { expandir = true } = {}) => {
        setConsultas((current) => ({
            ...current,
            [empresa.id]: { ...(current[empresa.id] || {}), estado: 'carregando', parcelas: current[empresa.id]?.parcelas || [] },
        }));
        try {
            const response = await axiosInstance.post('/api/serpro/parcsn/parcelas/', {
                cnpj: somenteDigitosCnpj(empresa.cnpj),
            });
            const parcelas = Array.isArray(response.data?.parcelas) ? response.data.parcelas : [];
            parcelas.sort((a, b) => Number(a.parcela) - Number(b.parcela));
            setConsultas((current) => ({
                ...current,
                [empresa.id]: {
                    estado: parcelas.length > 0 ? 'ok' : 'sem',
                    parcelas,
                    mensagem: '',
                    consultadoEm: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                },
            }));
            if (expandir && parcelas.length > 0) {
                setExpandidos((current) => (current.includes(empresa.id) ? current : [...current, empresa.id]));
            }
            return { ok: true, comParcelas: parcelas.length > 0, total: parcelas.length };
        } catch (error) {
            const mensagem = error.response?.data?.error || 'Erro ao consultar as parcelas disponíveis.';
            const semParcelamento = ehSemParcelamento(mensagem);
            setConsultas((current) => ({
                ...current,
                [empresa.id]: {
                    estado: semParcelamento ? 'sem' : 'erro',
                    parcelas: [],
                    mensagem: semParcelamento ? '' : mensagem,
                    consultadoEm: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                },
            }));
            return { ok: semParcelamento, comParcelas: false, total: 0, message: mensagem };
        }
    }, []);

    const handleConsultarUma = async (empresa) => {
        setFeedback(null);
        const resultado = await consultarParcelas(empresa);
        if (!resultado.ok) {
            setFeedback({ type: 'error', text: `${empresa.nome}: ${resultado.message}` });
        }
    };

    const handleConsultarLote = async () => {
        const targets = visibleEmpresas.filter(
            (empresa) => selectedIds.includes(empresa.id) && temCnpjNumerico(empresa.cnpj),
        );
        if (targets.length === 0) return;

        setFeedback(null);
        cancelBatchRef.current = false;
        setBatch({ total: targets.length, done: 0, running: true, results: [] });

        for (const empresa of targets) {
            if (cancelBatchRef.current) break;
            // Sequencial de propósito: evita disparar várias chamadas ao SERPRO ao mesmo tempo.
            const resultado = await consultarParcelas(empresa, { expandir: false });
            setBatch((current) => (current ? {
                ...current,
                done: current.done + 1,
                results: [...current.results, { id: empresa.id, nome: empresa.nome, ...resultado }],
            } : current));
        }

        setBatch((current) => (current ? { ...current, running: false, cancelled: cancelBatchRef.current } : current));
    };

    const gerarDas = async (empresa, parcela) => {
        const chave = `${empresa.id}:${parcela.parcela}`;
        setFeedback(null);
        setGerando((current) => ({ ...current, [chave]: true }));
        try {
            const response = await axiosInstance.post('/api/serpro/parcsn/gerar-das/', {
                cnpj: somenteDigitosCnpj(empresa.cnpj),
                parcela: parcela.parcela,
            }, { responseType: 'blob' });
            downloadBlobResponse(response, `DAS_Parcelamento_${somenteDigitosCnpj(empresa.cnpj)}_${parcela.parcela}.pdf`);
            setFeedback({
                type: 'success',
                text: `DAS da parcela ${formatParcela(parcela.parcela)} de ${empresa.nome} baixado com sucesso!`,
            });
        } catch (error) {
            console.error('Erro ao gerar DAS da parcela:', error);
            setFeedback({
                type: 'error',
                text: await readBlobError(error, 'Erro ao gerar o DAS da parcela.'),
            });
        } finally {
            setGerando((current) => {
                const next = { ...current };
                delete next[chave];
                return next;
            });
        }
    };

    const renderSituacao = (empresa) => {
        const consulta = consultas[empresa.id];
        if (!consulta) return <span className="text-xs text-gray-400">Não consultado</span>;
        if (consulta.estado === 'carregando') {
            return (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />
                    Consultando…
                </span>
            );
        }
        if (consulta.estado === 'ok') {
            return (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${toneStyles.emerald.badge}`}>
                    <BanknotesIcon className="h-3.5 w-3.5" />
                    {consulta.parcelas.length} parcela(s)
                </span>
            );
        }
        if (consulta.estado === 'sem') {
            return <span className="text-xs text-gray-500 dark:text-gray-400">Sem parcelamento ativo</span>;
        }
        return (
            <span className="inline-flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400" title={consulta.mensagem}>
                <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="line-clamp-2">{consulta.mensagem}</span>
            </span>
        );
    };

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Parcelamento do Simples</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                        Consulte o parcelamento ordinário ativo por empresa e emita o DAS de cada parcela.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${toneStyles.slate.badge}`}>
                        <BanknotesIcon className="h-4 w-4" />
                        Consultar parcelas
                    </span>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${toneStyles.emerald.badge}`}>
                        <DocumentArrowDownIcon className="h-4 w-4" />
                        Gerar DAS da parcela
                    </span>
                    <button type="button" onClick={() => reload({ silent: true })} className={secondaryButtonClass} title="Recarregar empresas">
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

            {/* Resumo das consultas já realizadas */}
            <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ResumoCard label="Empresas consultadas" value={resumo.consultadas} hint={`de ${visibleEmpresas.length} na lista`} />
                <ResumoCard label="Com parcelamento" value={resumo.comParcelamento} tone="success" />
                <ResumoCard label="Parcelas disponíveis" value={resumo.parcelasDisponiveis} tone="amber" />
                <ResumoCard label="Valor em aberto" value={formatCurrency(resumo.valorTotal)} tone="amber" hint="Soma das parcelas listadas" />
            </div>

            <EmpresaFiltros filtros={filtros} resultado={visibleEmpresas.length}>
                <span className="mx-1 hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:inline-block" />
                {SITUACOES.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setSituacao(item.key)}
                        className={`${chipClass} ${situacao === item.key ? chipOn : chipOff}`}
                        title="Filtra pelo resultado das consultas já feitas nesta tela"
                    >
                        {item.label}
                    </button>
                ))}
            </EmpresaFiltros>

            {/* Consulta em lote */}
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
                                <span className="font-semibold tabular-nums">{selectedIds.length}</span> empresa(s) selecionada(s)
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={handleConsultarLote}
                                    disabled={isBatchRunning}
                                    className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.slate.action}`}
                                >
                                    <BanknotesIcon className="h-4 w-4" />
                                    Consultar parcelas em lote
                                </button>
                                <button type="button" onClick={() => setSelectedIds([])} disabled={isBatchRunning} className={secondaryButtonClass}>
                                    Limpar seleção
                                </button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            O lote apenas consulta — a emissão do DAS continua parcela a parcela, para não gerar guias indevidas.
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
                                Consulta em lote — <span className="tabular-nums">{batch.done}/{batch.total}</span>
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
                                        {!result.ok
                                            ? <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600 dark:text-rose-400" />
                                            : result.comParcelas
                                                ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                : <InformationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />}
                                        <span className="min-w-0 flex-1">
                                            <span className="font-medium text-gray-800 dark:text-gray-100">{result.nome}</span>
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                {!result.ok
                                                    ? result.message
                                                    : result.comParcelas
                                                        ? `${result.total} parcela(s) disponível(is)`
                                                        : 'Sem parcelamento ativo'}
                                            </span>
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
            ) : visibleEmpresas.length === 0 ? (
                <CentralVazio
                    temFiltros={activeFilterCount > 0 || situacao !== 'todas'}
                    onLimpar={() => { clearFilters(); setSituacao('todas'); }}
                />
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
                                    <th scope="col" className={thClass}>Parcelamento</th>
                                    <th scope="col" className={`hidden text-right lg:table-cell ${thClass}`}>Valor em aberto</th>
                                    <th scope="col" className={`text-right ${thClass}`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {visibleEmpresas.map((empresa) => {
                                    const cnpjValido = temCnpjNumerico(empresa.cnpj);
                                    const consulta = consultas[empresa.id];
                                    const parcelas = consulta?.parcelas || [];
                                    const expandido = expandidos.includes(empresa.id);
                                    const selected = selectedIds.includes(empresa.id);
                                    const consultando = consulta?.estado === 'carregando';

                                    return (
                                        <React.Fragment key={empresa.id}>
                                            <tr className={`transition-colors ${selected ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
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
                                                <td className="px-4 py-4 align-top">
                                                    {renderSituacao(empresa)}
                                                    {consulta?.consultadoEm && !consultando && (
                                                        <p className="mt-1 text-[11px] text-gray-400">Consultado às {consulta.consultadoEm}</p>
                                                    )}
                                                </td>
                                                <td className="hidden px-4 py-4 text-right align-top lg:table-cell">
                                                    {parcelas.length > 0 ? (
                                                        <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                                            {formatCurrency(somaParcelas(parcelas))}
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 align-top">
                                                    <div className="flex min-w-max flex-wrap justify-end gap-2">
                                                        {parcelas.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleExpandido(empresa.id)}
                                                                className={rowActionClass}
                                                            >
                                                                {expandido ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                                                                {expandido ? 'Ocultar parcelas' : 'Ver parcelas'}
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleConsultarUma(empresa)}
                                                            disabled={!cnpjValido || consultando || isBatchRunning}
                                                            className={rowActionClass}
                                                            title={cnpjValido
                                                                ? 'Consultar as parcelas disponíveis para emissão'
                                                                : 'Corrija o CNPJ no cadastro da empresa para usar este serviço'}
                                                        >
                                                            {consultando
                                                                ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                : <BanknotesIcon className={`h-4 w-4 ${toneStyles.slate.icon}`} />}
                                                            {consulta ? 'Reconsultar' : 'Consultar parcelas'}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>

                                            {expandido && parcelas.length > 0 && (
                                                <tr className="bg-gray-50/70 dark:bg-gray-900/40">
                                                    <td />
                                                    <td colSpan="4" className="px-4 pb-5 pt-1">
                                                        <div className="overflow-hidden rounded-md border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
                                                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                                                <thead className="bg-gray-50 dark:bg-gray-900/70">
                                                                    <tr>
                                                                        <th scope="col" className={thClass}>Parcela</th>
                                                                        <th scope="col" className={`text-right ${thClass}`}>Valor</th>
                                                                        <th scope="col" className={`text-right ${thClass}`}>Documento</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                                                    {parcelas.map((parcela, index) => {
                                                                        const chave = `${empresa.id}:${parcela.parcela}`;
                                                                        const emitindo = Boolean(gerando[chave]);
                                                                        return (
                                                                            <tr key={parcela.parcela} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                                                                <td className="px-4 py-3">
                                                                                    <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                                                                        {formatParcela(parcela.parcela)}
                                                                                    </span>
                                                                                    {index === 0 && (
                                                                                        <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${toneStyles.amber.badge}`}>
                                                                                            Mais antiga
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                                                                                    {formatCurrency(parcela.valor)}
                                                                                </td>
                                                                                <td className="px-4 py-3 text-right">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => gerarDas(empresa, parcela)}
                                                                                        disabled={emitindo || isBatchRunning}
                                                                                        className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.emerald.action}`}
                                                                                    >
                                                                                        {emitindo
                                                                                            ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                                            : <DocumentArrowDownIcon className="h-4 w-4" />}
                                                                                        Gerar DAS
                                                                                    </button>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                                <tfoot className="bg-gray-50 dark:bg-gray-900/70">
                                                                    <tr>
                                                                        <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total</td>
                                                                        <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                                                                            {formatCurrency(somaParcelas(parcelas))}
                                                                        </td>
                                                                        <td />
                                                                    </tr>
                                                                </tfoot>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
                        <span>Exibindo {visibleEmpresas.length} de {empresas.length} empresas</span>
                        <span>Parcelamento ordinário do Simples Nacional (PARCSN)</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CentralParcelamentoSimples;
