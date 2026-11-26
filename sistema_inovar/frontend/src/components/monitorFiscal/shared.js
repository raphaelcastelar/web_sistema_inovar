import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, downloadBlobResponse, formatCurrency, thClass } from '../centralShared';

export const API = '/api/monitor-fiscal';

/* ------------------------------------------------------------------ *
 * Utilidades
 * ------------------------------------------------------------------ */
export const erroApi = (error, fallback = 'Não foi possível concluir a operação.') => {
    const dados = error?.response?.data;
    if (!dados) return fallback;
    if (typeof dados.erro === 'string') return dados.erro;
    if (typeof dados.detail === 'string') return dados.detail;
    if (dados.erro && typeof dados.erro === 'object') return Object.values(dados.erro).flat().join(' ');
    return fallback;
};

export const baixar = async (url, params, nomePadrao) => {
    const response = await axiosInstance.get(url, { params, responseType: 'blob' });
    downloadBlobResponse(response, nomePadrao);
};

export const formatarData = (valor, comHora = false) => {
    if (!valor) return '—';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return valor;
    return data.toLocaleString('pt-BR', comHora ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' });
};

export const formatarDocumento = (valor) => {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return valor || '—';
};

export const moeda = (valor) => (valor === null || valor === undefined || valor === '' ? '—' : formatCurrency(valor));

/* Origem do documento (de onde ele veio). */
export const ROTULOS_FONTE = {
    AN_NFE: 'SEFAZ', AN_CTE: 'SEFAZ', ADN_NFSE: 'ADN', AN_MDFE: 'SVRS', IMPORTACAO_MANUAL: 'Importação manual',
};

/* Serviço de captura (o que é consultado). */
export const ROTULOS_SERVICO = {
    AN_NFE: 'NF-e', AN_CTE: 'CT-e', ADN_NFSE: 'NFS-e', AN_MDFE: 'MDF-e', IMPORTACAO_MANUAL: 'Importação',
};

export const nomeTitular = (titular) => String(titular || '').replace(/:\d{11,14}$/, '').trim();

export const origens = (fontes) => [...new Set((fontes || []).map((f) => ROTULOS_FONTE[f] || f))].join(', ');

export const NOME_AMBIENTE = { 1: 'Produção', 2: 'Homologação' };

/* ------------------------------------------------------------------ *
 * Selos de situação (mesmo padrão dos badges das centrais)
 * ------------------------------------------------------------------ */
const TONS = {
    verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    ambar: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    vermelho: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900',
    cinza: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    azul: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
};

const TOM_POR_VALOR = {
    autorizado: 'verde', completo: 'verde', sincronizado: 'verde', registrada: 'verde', confirmada: 'verde',
    conferido: 'verde', resolvido: 'verde', resolvida: 'verde', ativo: 'verde', vigente: 'verde',
    resumo: 'ambar', pendente: 'ambar', aguardando: 'ambar', nao_manifestada: 'ambar', atencao: 'ambar',
    aberta: 'ambar', vencendo: 'ambar', alta: 'ambar',
    ciencia: 'azul', executando: 'azul', em_analise: 'azul', novo: 'azul', lido: 'azul', transmitindo: 'azul',
    cancelado: 'vermelho', erro: 'vermelho', bloqueado: 'vermelho', rejeitada: 'vermelho', denegado: 'vermelho',
    certificado_invalido: 'vermelho', indisponivel: 'vermelho', critica: 'vermelho', inconsistente: 'vermelho',
    vencido: 'vermelho', desconhecida: 'vermelho', nao_realizada: 'vermelho',
};

export const Selo = ({ valor, texto, tom }) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${TONS[tom || TOM_POR_VALOR[valor] || 'cinza']}`}>
        {texto || valor || '—'}
    </span>
);

/* ------------------------------------------------------------------ *
 * Estrutura de página
 * ------------------------------------------------------------------ */
export const CabecalhoSecao = ({ titulo, descricao, children }) => (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
            <h2 className="text-lg font-semibold text-gray-950 dark:text-white">{titulo}</h2>
            {descricao && <p className="mt-0.5 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{descricao}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
);

export const Indicador = ({ titulo, valor, detalhe, icone: Icone, alerta }) => (
    <div className={`${cardClass} p-4`}>
        <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{titulo}</p>
            {Icone && (
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${alerta ? 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                    <Icone className="h-4 w-4" />
                </span>
            )}
        </div>
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${alerta ? 'text-rose-600 dark:text-rose-400' : 'text-gray-950 dark:text-gray-100'}`}>{valor}</p>
        {detalhe && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detalhe}</p>}
    </div>
);

export const Observacao = ({ children, tom = 'neutro' }) => {
    const estilos = {
        neutro: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300',
        ambar: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200',
        vermelho: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300',
    };
    const Icone = tom === 'neutro' ? InformationCircleIcon : ExclamationTriangleIcon;
    return (
        <p className={`flex items-start gap-2 rounded-md border p-3 text-xs ${estilos[tom]}`}>
            <Icone className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-70" />
            <span>{children}</span>
        </p>
    );
};

export const Feedback = ({ feedback, onFechar }) => (
    <AnimatePresence>
        {feedback && (
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                role="status"
                className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${feedback.tipo === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300'
                    : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300'}`}
            >
                {feedback.tipo === 'ok'
                    ? <CheckCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    : <InformationCircleIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                <span className="flex-1">{feedback.texto}</span>
                {onFechar && (
                    <button type="button" onClick={onFechar} className="opacity-60 transition hover:opacity-100" aria-label="Fechar aviso">
                        <XMarkIcon className="h-4 w-4" />
                    </button>
                )}
            </motion.div>
        )}
    </AnimatePresence>
);

export const Carregando = ({ texto = 'Carregando...' }) => (
    <div className={`${cardClass} flex items-center justify-center gap-3 p-10 text-sm text-gray-500 dark:text-gray-400`}>
        <ArrowPathIcon className="h-5 w-5 animate-spin" />
        {texto}
    </div>
);

export const Vazio = ({ icone: Icone = InformationCircleIcon, titulo, texto, children }) => (
    <div className="px-6 py-12 text-center">
        <Icone className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <h3 className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{titulo}</h3>
        {texto && <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-gray-400">{texto}</p>}
        {children && <div className="mt-4">{children}</div>}
    </div>
);

/* Tabela no padrão das centrais: card, cabeçalho cinza e rodapé informativo. */
export const Tabela = ({ colunas, children, rodape, vazio }) => (
    <div className={`overflow-hidden ${cardClass}`}>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-800">
                <thead className="bg-gray-50 dark:bg-gray-900/70">
                    <tr>
                        {colunas.map((coluna, indice) => (
                            <th key={indice} scope="col" className={`${thClass} ${coluna.className || ''}`}>{coluna.titulo}</th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">{children}</tbody>
            </table>
            {vazio}
        </div>
        {rodape && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500 dark:border-gray-800 dark:bg-gray-900/70 dark:text-gray-400">
                {rodape}
            </div>
        )}
    </div>
);

/* Modal centralizado no padrão do sistema (sobretítulo dourado e fechar no canto). */
export const Modal = ({ aberto, onFechar, sobretitulo, titulo, subtitulo, largura = 'max-w-2xl', children, rodape }) => {
    useEffect(() => {
        if (!aberto) return undefined;
        const tecla = (event) => { if (event.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [aberto, onFechar]);

    return (
        <AnimatePresence>
            {aberto && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onMouseDown={onFechar}
                >
                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        className={`flex max-h-[92vh] w-full ${largura} flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-gray-900 shadow-2xl dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100`}
                        initial={{ opacity: 0, scale: 0.97, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
                            <div className="min-w-0">
                                {sobretitulo && <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#c49a61]">{sobretitulo}</p>}
                                <h2 className="mt-1 text-xl font-semibold text-gray-950 dark:text-white">{titulo}</h2>
                                {subtitulo && <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitulo}</div>}
                            </div>
                            <button type="button" onClick={onFechar} className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" aria-label="Fechar">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">{children}</div>
                        {rodape && <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3 dark:border-gray-800 dark:bg-gray-900/70">{rodape}</div>}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export const checkboxClass = 'h-4 w-4 rounded border-gray-300 text-slate-900 focus:ring-slate-400 disabled:opacity-40 dark:border-gray-600';
export const tdClass = 'px-4 py-3 align-top';
