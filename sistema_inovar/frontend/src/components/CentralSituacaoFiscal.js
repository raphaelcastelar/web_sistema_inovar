import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowDownTrayIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ClockIcon,
    DocumentMagnifyingGlassIcon,
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
    readBlobError,
    rowActionClass,
    secondaryButtonClass,
    somenteDigitosCnpj,
    temCnpjNumerico,
    thClass,
    toneStyles,
    useEmpresaFiltros,
} from './centralShared';

const STORAGE_KEY = 'centralSituacaoFiscalFiltros';
// A Receita gera o relatório de forma assíncrona; o backend espera até ~40 s por chamada
// e devolve 202 com o tempo de espera. Aqui repetimos algumas vezes antes de desistir.
const MAX_TENTATIVAS = 6;

const SITUACOES = [
    { key: 'todas', label: 'Todas' },
    { key: 'hoje', label: 'Emitidas hoje' },
    { key: 'antigas', label: 'Relatório antigo' },
    { key: 'nunca', label: 'Nunca emitidas' },
];

const ehHoje = (iso) => {
    if (!iso) return false;
    const data = new Date(iso);
    const hoje = new Date();
    return data.toDateString() === hoje.toDateString();
};

const formatarData = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
};

const esperar = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const lerJsonDoBlob = async (data) => {
    try {
        return JSON.parse(await data.text());
    } catch {
        return null;
    }
};

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

const CentralSituacaoFiscal = () => {
    const cancelBatchRef = useRef(false);
    const filtros = useEmpresaFiltros({ storageKey: STORAGE_KEY });
    const { filteredEmpresas, empresas, loading, reload, loadError, activeFilterCount, clearFilters } = filtros;

    const [ultimos, setUltimos] = useState({});
    // { [empresaId]: { estado: 'emitindo'|'aguardando'|'ok'|'erro', mensagem } }
    const [execucoes, setExecucoes] = useState({});
    const [selectedIds, setSelectedIds] = useState([]);
    const [situacao, setSituacao] = useState('todas');
    const [feedback, setFeedback] = useState(null);
    const [batch, setBatch] = useState(null);

    const carregarUltimos = useCallback(async () => {
        try {
            const response = await axiosInstance.get('/api/serpro/sitfis/ultimos/');
            setUltimos(response.data?.ultimos || {});
        } catch (error) {
            console.error('Erro ao carregar relatórios de situação fiscal:', error);
        }
    }, []);

    useEffect(() => { carregarUltimos(); }, [carregarUltimos]);
    useEffect(() => {
        if (loadError) setFeedback({ type: 'error', text: loadError });
    }, [loadError]);

    const visibleEmpresas = useMemo(() => {
        if (situacao === 'todas') return filteredEmpresas;
        return filteredEmpresas.filter((empresa) => {
            const ultimo = ultimos[empresa.id];
            if (situacao === 'hoje') return ultimo && ehHoje(ultimo.gerado_em);
            if (situacao === 'antigas') return ultimo && !ehHoje(ultimo.gerado_em);
            if (situacao === 'nunca') return !ultimo;
            return true;
        });
    }, [filteredEmpresas, ultimos, situacao]);

    const resumo = useMemo(() => {
        let hoje = 0;
        let antigas = 0;
        visibleEmpresas.forEach((empresa) => {
            const ultimo = ultimos[empresa.id];
            if (!ultimo) return;
            if (ehHoje(ultimo.gerado_em)) hoje += 1; else antigas += 1;
        });
        return { hoje, antigas, nunca: visibleEmpresas.length - hoje - antigas };
    }, [visibleEmpresas, ultimos]);

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
            current.includes(empresaId) ? current.filter((id) => id !== empresaId) : [...current, empresaId]
        ));
    };
    const toggleSelectAll = () => setSelectedIds(allSelected ? [] : selectableEmpresas.map((empresa) => empresa.id));

    const marcar = (empresaId, valor) => setExecucoes((current) => ({ ...current, [empresaId]: valor }));

    /**
     * Emite (ou reaproveita o relatório do dia) e baixa o PDF.
     * `forcar` pede um relatório novo mesmo que já exista um de hoje.
     */
    const emitir = useCallback(async (empresa, { forcar = false, baixar = true } = {}) => {
        const cnpj = somenteDigitosCnpj(empresa.cnpj);
        marcar(empresa.id, { estado: 'emitindo' });
        try {
            for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa += 1) {
                // eslint-disable-next-line no-await-in-loop
                const response = await axiosInstance.post('/api/serpro/sitfis/emitir/', { cnpj, forcar }, { responseType: 'blob' });
                const tipo = String(response.headers['content-type'] || '');
                if (response.status === 202 || tipo.includes('application/json')) {
                    // eslint-disable-next-line no-await-in-loop
                    const dados = await lerJsonDoBlob(response.data);
                    const espera = Math.min(Math.max(Number(dados?.espera_ms) || 4000, 2000), 30000);
                    marcar(empresa.id, {
                        estado: 'aguardando',
                        mensagem: `A Receita está gerando o relatório. Nova tentativa em ${Math.round(espera / 1000)} s (${tentativa}/${MAX_TENTATIVAS}).`,
                    });
                    // eslint-disable-next-line no-await-in-loop
                    await esperar(espera);
                    continue; // eslint-disable-line no-continue
                }
                const origem = response.headers['x-sitfis-origem'];
                if (baixar) downloadBlobResponse(response, `SITUACAO_FISCAL_${cnpj}.pdf`);
                marcar(empresa.id, {
                    estado: 'ok',
                    mensagem: origem === 'reaproveitado' ? 'Relatório de hoje reaproveitado (sem nova consulta).' : 'Relatório emitido agora.',
                });
                await carregarUltimos();
                return { ok: true, reaproveitado: origem === 'reaproveitado' };
            }
            const mensagem = 'A Receita ainda não liberou o relatório. Tente novamente em alguns minutos — o protocolo fica guardado até o fim do dia.';
            marcar(empresa.id, { estado: 'erro', mensagem });
            return { ok: false, message: mensagem };
        } catch (error) {
            const mensagem = await readBlobError(error, 'Erro ao emitir o relatório de situação fiscal.');
            marcar(empresa.id, { estado: 'erro', mensagem });
            return { ok: false, message: mensagem };
        }
    }, [carregarUltimos]);

    const handleEmitir = async (empresa, opcoes) => {
        setFeedback(null);
        const resultado = await emitir(empresa, opcoes);
        if (resultado.ok) {
            setFeedback({ type: 'success', text: `${empresa.nome}: ${resultado.reaproveitado ? 'relatório de hoje baixado.' : 'relatório de situação fiscal emitido e salvo na pasta FISCAL/EXTRATOS.'}` });
        } else {
            setFeedback({ type: 'error', text: `${empresa.nome}: ${resultado.message}` });
        }
    };

    const baixarUltimo = async (empresa) => {
        const ultimo = ultimos[empresa.id];
        if (!ultimo) return;
        setFeedback(null);
        try {
            const response = await axiosInstance.get(`/api/serpro/sitfis/documento/${ultimo.id}/`, { responseType: 'blob' });
            downloadBlobResponse(response, ultimo.nome_arquivo);
        } catch (error) {
            setFeedback({ type: 'error', text: await readBlobError(error, 'Erro ao baixar o relatório.') });
        }
    };

    const handleEmitirLote = async () => {
        const targets = visibleEmpresas.filter((empresa) => selectedIds.includes(empresa.id) && temCnpjNumerico(empresa.cnpj));
        if (targets.length === 0) return;
        setFeedback(null);
        cancelBatchRef.current = false;
        setBatch({ total: targets.length, done: 0, running: true, results: [] });
        for (const empresa of targets) {
            if (cancelBatchRef.current) break;
            // Sequencial: cada relatório é uma consulta cobrada no SERPRO e a Receita limita
            // solicitações simultâneas. No lote os PDFs ficam salvos na pasta, sem download.
            // eslint-disable-next-line no-await-in-loop
            const resultado = await emitir(empresa, { baixar: false });
            setBatch((current) => (current ? {
                ...current,
                done: current.done + 1,
                results: [...current.results, { id: empresa.id, nome: empresa.nome, ...resultado }],
            } : current));
        }
        setBatch((current) => (current ? { ...current, running: false, cancelled: cancelBatchRef.current } : current));
    };

    const renderUltimo = (empresa) => {
        const execucao = execucoes[empresa.id];
        if (execucao?.estado === 'emitindo') {
            return (
                <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> Solicitando à Receita…
                </span>
            );
        }
        if (execucao?.estado === 'aguardando') {
            return (
                <span className="inline-flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <ClockIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 animate-pulse" />
                    <span>{execucao.mensagem}</span>
                </span>
            );
        }
        const ultimo = ultimos[empresa.id];
        return (
            <div className="space-y-1">
                {ultimo ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${ehHoje(ultimo.gerado_em) ? toneStyles.emerald.badge : toneStyles.slate.badge}`}>
                        <DocumentMagnifyingGlassIcon className="h-3.5 w-3.5" />
                        {ehHoje(ultimo.gerado_em) ? 'Hoje' : 'Emitido'} · {formatarData(ultimo.gerado_em)}
                    </span>
                ) : (
                    <span className="text-xs text-gray-400">Nunca emitido</span>
                )}
                {execucao?.estado === 'erro' && (
                    <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400" title={execucao.mensagem}>
                        <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                        <span className="line-clamp-2">{execucao.mensagem}</span>
                    </p>
                )}
                {execucao?.estado === 'ok' && <p className="text-[11px] text-gray-400">{execucao.mensagem}</p>}
            </div>
        );
    };

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Situação Fiscal</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                        Emita o Relatório de Situação Fiscal do e-CAC de cada empresa pelo Integra Contador (SITFIS).
                        O PDF fica salvo na pasta da empresa em FISCAL/EXTRATOS.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => { reload({ silent: true }); carregarUltimos(); }} className={secondaryButtonClass} title="Recarregar empresas e relatórios">
                        <ArrowPathIcon className="h-4 w-4" /> Atualizar
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

            <div className="grid w-full gap-3 sm:grid-cols-3">
                <ResumoCard label="Emitidas hoje" value={resumo.hoje} tone="success" hint={`de ${visibleEmpresas.length} na lista`} />
                <ResumoCard label="Relatório antigo" value={resumo.antigas} tone="amber" hint="Último relatório de outro dia" />
                <ResumoCard label="Nunca emitidas" value={resumo.nunca} />
            </div>

            <EmpresaFiltros filtros={filtros} resultado={visibleEmpresas.length}>
                <span className="mx-1 hidden h-4 w-px bg-gray-200 dark:bg-gray-700 sm:inline-block" />
                {SITUACOES.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => setSituacao(item.key)}
                        className={`${chipClass} ${situacao === item.key ? chipOn : chipOff}`}
                    >
                        {item.label}
                    </button>
                ))}
            </EmpresaFiltros>

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
                                    onClick={handleEmitirLote}
                                    disabled={isBatchRunning}
                                    className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.slate.action}`}
                                >
                                    <DocumentMagnifyingGlassIcon className="h-4 w-4" /> Emitir em lote
                                </button>
                                <button type="button" onClick={() => setSelectedIds([])} disabled={isBatchRunning} className={secondaryButtonClass}>
                                    Limpar seleção
                                </button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Uma empresa por vez. Quem já tem relatório de hoje é reaproveitado, sem nova consulta ao SERPRO. Os PDFs ficam salvos nas pastas.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

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
                                Emissão em lote — <span className="tabular-nums">{batch.done}/{batch.total}</span>
                                {batch.cancelled && <span className="text-xs font-normal text-gray-500">(cancelado)</span>}
                            </div>
                            {batch.running ? (
                                <button type="button" onClick={() => { cancelBatchRef.current = true; }} className={secondaryButtonClass}>
                                    <XMarkIcon className="h-4 w-4" /> Cancelar
                                </button>
                            ) : (
                                <button type="button" onClick={() => setBatch(null)} className={secondaryButtonClass}>
                                    <XMarkIcon className="h-4 w-4" /> Fechar
                                </button>
                            )}
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-800">
                            <div className="h-full bg-slate-900 transition-all dark:bg-slate-100" style={{ width: `${batch.total ? Math.round((batch.done / batch.total) * 100) : 0}%` }} />
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
                                            <span className="block text-xs text-gray-500 dark:text-gray-400">
                                                {result.ok ? (result.reaproveitado ? 'Relatório de hoje reaproveitado' : 'Emitido e salvo') : result.message}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

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
                                    <th scope="col" className={thClass}>Último relatório</th>
                                    <th scope="col" className={`text-right ${thClass}`}>Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                {visibleEmpresas.map((empresa) => {
                                    const cnpjValido = temCnpjNumerico(empresa.cnpj);
                                    const selected = selectedIds.includes(empresa.id);
                                    const execucao = execucoes[empresa.id];
                                    const ocupado = execucao?.estado === 'emitindo' || execucao?.estado === 'aguardando';
                                    const ultimo = ultimos[empresa.id];
                                    const temDeHoje = ultimo && ehHoje(ultimo.gerado_em);
                                    return (
                                        <tr key={empresa.id} className={`transition-colors ${selected ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
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
                                                            <ExclamationTriangleIcon className="h-3.5 w-3.5" /> CNPJ inválido no cadastro
                                                        </p>
                                                    )}
                                                />
                                            </td>
                                            <td className="max-w-sm px-4 py-4 align-top">{renderUltimo(empresa)}</td>
                                            <td className="px-4 py-4 align-top">
                                                <div className="flex min-w-max flex-wrap justify-end gap-2">
                                                    {ultimo && (
                                                        <button type="button" onClick={() => baixarUltimo(empresa)} disabled={ocupado} className={rowActionClass} title={ultimo.nome_arquivo}>
                                                            <ArrowDownTrayIcon className="h-4 w-4" /> Baixar último
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleEmitir(empresa, { forcar: Boolean(temDeHoje) })}
                                                        disabled={!cnpjValido || ocupado || isBatchRunning}
                                                        className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${toneStyles.emerald.action}`}
                                                        title={temDeHoje
                                                            ? 'Já existe um relatório de hoje: emite um novo (nova consulta cobrada no SERPRO)'
                                                            : 'Solicita o relatório à Receita Federal e salva o PDF na pasta da empresa'}
                                                    >
                                                        {ocupado ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DocumentMagnifyingGlassIcon className="h-4 w-4" />}
                                                        {temDeHoje ? 'Emitir novamente' : 'Emitir relatório'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
                        <span>Exibindo {visibleEmpresas.length} de {empresas.length} empresas</span>
                        <span>Integra Contador · SITFIS (SOLICITARPROTOCOLO91 + RELATORIOSITFIS92)</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CentralSituacaoFiscal;
