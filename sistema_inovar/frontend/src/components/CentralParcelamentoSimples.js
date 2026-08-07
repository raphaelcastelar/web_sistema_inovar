import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BanknotesIcon,
    CheckCircleIcon,
    DocumentArrowDownIcon,
    InformationCircleIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { normalizeCnpj } from '../utils/cnpj';

const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
}).format(Number(value) || 0);

const formatParcela = (value) => {
    const parcela = String(value || '');
    return parcela.length === 6 ? `${parcela.slice(4)}/${parcela.slice(0, 4)}` : parcela;
};

const readBlobError = async (error, fallback) => {
    try {
        if (error.response?.data instanceof Blob) {
            const response = JSON.parse(await error.response.data.text());
            return response.error || fallback;
        }
    } catch (_) {
        // Mantém a mensagem padrão se a resposta não for JSON.
    }
    return error.response?.data?.error || fallback;
};

const CentralParcelamentoSimples = () => {
    const [empresas, setEmpresas] = useState([]);
    const [empresa, setEmpresa] = useState(null);
    const [parcelas, setParcelas] = useState([]);
    const [loadingParcelas, setLoadingParcelas] = useState(false);
    const [parcelaGerando, setParcelaGerando] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then((response) => setEmpresas(response.data))
            .catch(() => setError('Não foi possível carregar as empresas.'));
    }, []);

    const consultarParcelas = async (selectedEmpresa) => {
        setEmpresa(selectedEmpresa);
        setParcelas([]);
        setError('');
        setSuccess('');
        setLoadingParcelas(true);
        try {
            const response = await axiosInstance.post('/api/serpro/parcsn/parcelas/', {
                cnpj: normalizeCnpj(selectedEmpresa.cnpj),
            });
            setParcelas(response.data.parcelas || []);
        } catch (requestError) {
            setError(requestError.response?.data?.error || 'Erro ao consultar as parcelas disponíveis.');
        } finally {
            setLoadingParcelas(false);
        }
    };

    const gerarDas = async (parcela) => {
        setError('');
        setSuccess('');
        setParcelaGerando(parcela.parcela);
        try {
            const response = await axiosInstance.post('/api/serpro/parcsn/gerar-das/', {
                cnpj: normalizeCnpj(empresa.cnpj),
                parcela: parcela.parcela,
            }, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            const disposition = response.headers['content-disposition'];
            const match = disposition?.match(/filename="?([^";]+)"?/i);
            link.href = url;
            link.download = match?.[1] || `DAS_Parcelamento_${parcela.parcela}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setSuccess(`DAS da parcela ${formatParcela(parcela.parcela)} baixado com sucesso!`);
        } catch (requestError) {
            setError(await readBlobError(requestError, 'Erro ao gerar o DAS da parcela.'));
        } finally {
            setParcelaGerando(null);
        }
    };

    const voltar = () => {
        setEmpresa(null);
        setParcelas([]);
        setError('');
        setSuccess('');
    };

    return (
        <div className="w-full space-y-6 py-4 text-gray-900 dark:text-gray-100">
            <header className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                <h1 className="font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Parcelamento do Simples</h1>
                <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    {empresa ? 'Parcelas disponíveis para emissão do DAS.' : 'Selecione uma empresa para consultar o parcelamento ordinário ativo.'}
                </p>
            </header>

            <AnimatePresence mode="wait">
                {!empresa ? (
                    <motion.div key="empresas" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Empresa</th><th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Ação</th></tr></thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                    {empresas.map((item) => (
                                        <tr key={item.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                            <td className="px-5 py-4"><p className="font-semibold text-gray-950 dark:text-gray-100">{item.nome}</p><p className="mt-1 text-xs text-gray-500">{item.cnpj}</p></td>
                                            <td className="px-5 py-4 text-right"><button onClick={() => consultarParcelas(item)} className="inline-flex items-center gap-2 rounded-md bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"><BanknotesIcon className="h-4 w-4" />Consultar parcelas</button></td>
                                        </tr>
                                    ))}
                                    {empresas.length === 0 && <tr><td colSpan="2" className="px-5 py-10 text-center text-sm text-gray-500">Nenhuma empresa encontrada.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div key="parcelas" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
                            <div><button onClick={voltar} className="mb-3 text-sm font-semibold text-gray-500 hover:text-gray-900 dark:hover:text-white">&larr; Voltar</button><p className="font-semibold text-gray-950 dark:text-white">{empresa.nome}</p><p className="mt-1 text-xs text-gray-500">{empresa.cnpj}</p></div>
                            <button onClick={() => consultarParcelas(empresa)} disabled={loadingParcelas} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"><ArrowPathIcon className={`h-4 w-4 ${loadingParcelas ? 'animate-spin' : ''}`} />Atualizar parcelas</button>
                        </div>

                        {loadingParcelas ? (
                            <div className="flex justify-center rounded-lg border border-gray-200 bg-white p-12 dark:border-gray-800 dark:bg-gray-900"><ArrowPathIcon className="h-8 w-8 animate-spin text-slate-500" /></div>
                        ) : (
                            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                                    <thead className="bg-slate-50 dark:bg-slate-900"><tr><th className="px-5 py-3 text-left text-xs font-semibold uppercase text-gray-500">Parcela</th><th className="px-5 py-3 text-right text-xs font-semibold uppercase text-gray-500">Valor</th><th className="px-5 py-3 text-right text-xs font-semibold uppercase text-gray-500">Documento</th></tr></thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                        {parcelas.map((parcela) => (
                                            <tr key={parcela.parcela}>
                                                <td className="px-5 py-4 font-semibold">{formatParcela(parcela.parcela)}</td>
                                                <td className="px-5 py-4 text-right font-mono">{formatCurrency(parcela.valor)}</td>
                                                <td className="px-5 py-4 text-right"><button onClick={() => gerarDas(parcela)} disabled={parcelaGerando !== null} className="inline-flex items-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{parcelaGerando === parcela.parcela ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DocumentArrowDownIcon className="h-4 w-4" />}Gerar DAS</button></td>
                                            </tr>
                                        ))}
                                        {parcelas.length === 0 && !error && <tr><td colSpan="3" className="px-5 py-10 text-center text-sm text-gray-500">Nenhuma parcela disponível para emissão.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {error && <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><InformationCircleIcon className="h-5 w-5 shrink-0" />{error}</div>}
                        {success && <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircleIcon className="h-5 w-5 shrink-0" />{success}</div>}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CentralParcelamentoSimples;
