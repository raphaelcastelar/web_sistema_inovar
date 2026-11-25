import React from 'react';
import axiosInstance from '../../api/axiosInstance';
import { downloadBlobResponse, formatCurrency } from '../centralShared';

export const API = '/api/monitor-fiscal';

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
    if (!valor) return '-';
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return valor;
    return comHora ? data.toLocaleString('pt-BR') : data.toLocaleDateString('pt-BR');
};

export const formatarDocumento = (valor) => {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return valor || '-';
};

export const moeda = (valor) => (valor === null || valor === undefined || valor === '' ? '-' : formatCurrency(valor));

const tons = {
    verde: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900',
    amarelo: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
    vermelho: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900',
    cinza: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    azul: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900',
};

const TOM_POR_VALOR = {
    autorizado: 'verde', completo: 'verde', sincronizado: 'verde', registrada: 'verde', confirmada: 'verde',
    conferido: 'verde', resolvido: 'verde', resolvida: 'verde',
    resumo: 'amarelo', pendente: 'amarelo', aguardando: 'amarelo', nao_manifestada: 'amarelo', ciencia: 'azul',
    executando: 'azul', em_analise: 'azul', atencao: 'amarelo', novo: 'azul', aberta: 'amarelo',
    cancelado: 'vermelho', erro: 'vermelho', bloqueado: 'vermelho', rejeitada: 'vermelho', denegado: 'vermelho',
    certificado_invalido: 'vermelho', indisponivel: 'vermelho', critica: 'vermelho', inconsistente: 'vermelho',
    substituido: 'cinza', desativado: 'cinza', nao_aplicavel: 'cinza', informativa: 'cinza',
};

export const Selo = ({ valor, texto }) => (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tons[TOM_POR_VALOR[valor] || 'cinza']}`}>
        {texto || valor || '-'}
    </span>
);

export const Indicador = ({ titulo, valor, detalhe, tom }) => (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{titulo}</p>
        <p className={`mt-2 text-2xl font-semibold ${tom === 'alerta' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>{valor}</p>
        {detalhe && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detalhe}</p>}
    </div>
);

export const Aviso = ({ children, tom = 'amarelo' }) => (
    <div className={`rounded-md px-4 py-3 text-xs ring-1 ring-inset ${tons[tom]}`}>{children}</div>
);

export const Mensagem = ({ mensagem, onFechar }) => {
    if (!mensagem) return null;
    const erro = mensagem.tipo === 'erro';
    return (
        <div className={`flex items-start justify-between gap-3 rounded-md px-4 py-3 text-sm ring-1 ring-inset ${erro ? tons.vermelho : tons.verde}`}>
            <span>{mensagem.texto}</span>
            {onFechar && <button type="button" onClick={onFechar} className="text-xs font-semibold">Fechar</button>}
        </div>
    );
};

export const ROTULOS_FONTE = {
    AN_NFE: 'NF-e', AN_CTE: 'CT-e', ADN_NFSE: 'NFS-e', AN_MDFE: 'MDF-e', IMPORTACAO_MANUAL: 'Importação',
};
