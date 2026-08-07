import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BanknotesIcon,
    CalendarDaysIcon,
    CheckCircleIcon,
    DocumentArrowDownIcon,
    DocumentTextIcon,
    InformationCircleIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { normalizeCnpj } from '../utils/cnpj';

const services = {
    GERARGUIA31: {
        title: 'Gerar Guia da Declaração',
        description: 'Gere o documento de arrecadação vinculado à declaração DCTFWeb.',
        button: 'Gerar e baixar guia',
        icon: BanknotesIcon,
        color: 'emerald',
    },
    CONSRECIBO32: {
        title: 'Consultar Recibo',
        description: 'Consulte e baixe o recibo de transmissão da declaração.',
        button: 'Baixar recibo',
        icon: DocumentArrowDownIcon,
        color: 'slate',
    },
    CONSDECCOMPLETA33: {
        title: 'Declaração Completa',
        description: 'Consulte e baixe o relatório completo da declaração DCTFWeb.',
        button: 'Baixar declaração completa',
        icon: DocumentTextIcon,
        color: 'amber',
    },
};

const iconClasses = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

const buttonClasses = {
    emerald: 'bg-emerald-700 hover:bg-emerald-800 dark:bg-emerald-400 dark:text-emerald-950',
    slate: 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950',
    amber: 'bg-amber-700 hover:bg-amber-800 dark:bg-amber-400 dark:text-amber-950',
};

const months = [
    ['01', 'Janeiro'], ['02', 'Fevereiro'], ['03', 'Março'], ['04', 'Abril'],
    ['05', 'Maio'], ['06', 'Junho'], ['07', 'Julho'], ['08', 'Agosto'],
    ['09', 'Setembro'], ['10', 'Outubro'], ['11', 'Novembro'], ['12', 'Dezembro'],
];

const CentralDctfWeb = () => {
    const now = new Date();
    const [empresas, setEmpresas] = useState([]);
    const [empresaId, setEmpresaId] = useState('');
    const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
    const [year, setYear] = useState(String(now.getFullYear()));
    const [numeroRecibo, setNumeroRecibo] = useState('');
    const [selectedService, setSelectedService] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const years = useMemo(() => {
        const current = new Date().getFullYear();
        return Array.from({ length: 7 }, (_, index) => current + 2 - index);
    }, []);

    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then((response) => setEmpresas(response.data))
            .catch(() => setError('Não foi possível carregar as empresas.'));
    }, []);

    const resetMessages = () => {
        setError('');
        setSuccess('');
    };

    const selectService = (id) => {
        setSelectedService(id);
        resetMessages();
    };

    const downloadResponse = (response, fallbackName) => {
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        const disposition = response.headers['content-disposition'];
        const match = disposition?.match(/filename="?([^";]+)"?/i);
        link.href = url;
        link.download = match?.[1] || fallbackName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const execute = async () => {
        resetMessages();
        if (!empresaId) return setError('Selecione uma empresa.');
        if (!numeroRecibo) return setError('Informe o número do recibo de entrega.');

        const empresa = empresas.find((item) => item.id === Number(empresaId));
        if (!empresa) return setError('Empresa selecionada não encontrada.');
        const periodo = `${year}${month}`;
        setLoading(true);
        try {
            const response = await axiosInstance.post(`/api/serpro/dctfweb/${selectedService}/`, {
                cnpj: normalizeCnpj(empresa.cnpj),
                periodo,
                numero_recibo: numeroRecibo,
            }, { responseType: 'blob' });
            downloadResponse(response, `DCTFWeb_${selectedService}_${periodo}.pdf`);
            setSuccess(`${services[selectedService].title} baixado com sucesso!`);
        } catch (requestError) {
            let message = 'Erro ao consultar o serviço DCTFWeb.';
            try {
                if (requestError.response?.data instanceof Blob) {
                    const responseError = JSON.parse(await requestError.response.data.text());
                    message = responseError.error || message;
                }
            } catch (_) {
                // Conserva a mensagem padrão quando o backend não devolver JSON.
            }
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const currentService = selectedService ? services[selectedService] : null;
    const CurrentIcon = currentService?.icon;

    return (
        <div className="w-full space-y-6 py-4 text-gray-900 dark:text-gray-100">
            <header className="flex flex-col gap-2">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Fiscal</p>
                <h1 className="font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Central DCTFWeb</h1>
                <p className="max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                    {currentService ? currentService.title : 'Escolha o documento que deseja consultar ou emitir.'}
                </p>
            </header>

            <AnimatePresence mode="wait">
                {!currentService ? (
                    <motion.div key="services" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {Object.entries(services).map(([id, service]) => {
                            const Icon = service.icon;
                            return (
                                <button key={id} onClick={() => selectService(id)} className="rounded-lg border border-gray-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
                                    <div className="flex items-start gap-4">
                                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${iconClasses[service.color]}`}><Icon className="h-6 w-6" /></div>
                                        <div>
                                            <h2 className="font-semibold text-gray-950 dark:text-gray-100">{service.title}</h2>
                                            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{service.description}</p>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </motion.div>
                ) : (
                    <motion.div key="form" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-7 flex items-center justify-between">
                            <button onClick={() => { setSelectedService(null); resetMessages(); }} className="text-sm font-semibold text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">&larr; Voltar</button>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{selectedService}</span>
                        </div>
                        <div className="space-y-6">
                            <div>
                                <label className="mb-2 block text-sm font-semibold">Empresa</label>
                                <div className="relative">
                                    <select value={empresaId} onChange={(event) => setEmpresaId(event.target.value)} className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 py-3 pl-4 pr-10 dark:border-gray-700 dark:bg-gray-800">
                                        <option value="">Selecione...</option>
                                        {empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>)}
                                    </select>
                                    <UsersIcon className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-gray-500" />
                                </div>
                            </div>
                            <div>
                                <label className="mb-2 block text-sm font-semibold">Competência</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="relative">
                                        <select value={month} onChange={(event) => setMonth(event.target.value)} className="w-full appearance-none rounded-md border border-gray-200 bg-gray-50 py-3 pl-4 pr-9 dark:border-gray-700 dark:bg-gray-800">
                                            {months.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                        </select>
                                        <CalendarDaysIcon className="pointer-events-none absolute right-3 top-3.5 h-5 w-5 text-gray-500" />
                                    </div>
                                    <select value={year} onChange={(event) => setYear(event.target.value)} className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
                                        {years.map((item) => <option key={item} value={item}>{item}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="numero-recibo-dctfweb" className="mb-2 block text-sm font-semibold">Número do recibo de entrega</label>
                                <input id="numero-recibo-dctfweb" value={numeroRecibo} onChange={(event) => setNumeroRecibo(event.target.value.replace(/\D/g, ''))} inputMode="numeric" autoComplete="off" placeholder="Informe o número do recibo" className="w-full rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800" />
                            </div>
                            <button onClick={execute} disabled={loading} className={`flex w-full items-center justify-center gap-3 rounded-md px-6 py-4 font-bold text-white disabled:opacity-60 ${buttonClasses[currentService.color]}`}>
                                {loading ? <ArrowPathIcon className="h-6 w-6 animate-spin" /> : <CurrentIcon className="h-6 w-6" />}
                                {loading ? 'Processando...' : currentService.button}
                            </button>
                            {error && <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"><InformationCircleIcon className="h-5 w-5 shrink-0" />{error}</div>}
                            {success && <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"><CheckCircleIcon className="h-5 w-5 shrink-0" />{success}</div>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CentralDctfWeb;
