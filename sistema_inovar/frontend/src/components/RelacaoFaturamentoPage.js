import React, { useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import {
    ArrowPathIcon,
    BuildingOffice2Icon,
    DocumentArrowDownIcon,
    PlusIcon,
    PrinterIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade2.png';

const monthNames = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro'
];

const taxRegimes = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Arbitrado', 'Isenta / Imune'];

const createMonthLabel = (date) => {
    const month = monthNames[date.getMonth()];
    const year = String(date.getFullYear()).slice(-2);
    return `${month}-${year}`;
};

const createRows = (baseMonth, mode) => {
    const baseDate = new Date(`${baseMonth}-01T00:00:00`);
    const firstOffset = mode === 'Realizado' ? -12 : 0;

    return Array.from({ length: 12 }, (_, index) => {
        const date = new Date(baseDate);
        date.setMonth(baseDate.getMonth() + firstOffset + index);

        return {
            id: `${date.getFullYear()}-${date.getMonth()}-${index}`,
            mesAno: createMonthLabel(date),
            faturamento: '',
        };
    });
};

const formatCurrency = (value) => {
    const number = Number(value || 0);
    return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatNumber = (value) => {
    const number = Number(value || 0);
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrency = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const normalized = String(value)
        .replace(/\s/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');
    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
};

const formatCurrencyInput = (value) => {
    const number = Number(value || 0);
    return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatMoneyTyping = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';

    return formatCurrencyInput(Number(digits) / 100);
};

const formatCpfCnpj = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 14) return value || '';
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const formatCep = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length !== 8) return value || '';
    return digits.replace(/^(\d{5})(\d{3})$/, '$1-$2');
};

const getTodayInput = () => new Date().toISOString().split('T')[0];

const getCurrentMonthInput = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const emptyEmpresaData = {
    nome: '',
    cnpj: '',
    inscricaoEstadual: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
    regime: 'Simples Nacional',
};

const inputClass = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100';
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const sectionClass = 'rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800';

const RelacaoFaturamentoPage = () => {
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [loadingEmpresas, setLoadingEmpresas] = useState(true);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [mode, setMode] = useState('Realizado');
    const [baseMonth, setBaseMonth] = useState(getCurrentMonthInput());
    const [issueDate, setIssueDate] = useState(getTodayInput());
    const [localidade, setLocalidade] = useState('Ibatiba-ES');
    const [percentVista, setPercentVista] = useState('72');
    const [prazoMedio, setPrazoMedio] = useState('30 Dias');
    const [cartoesCredito, setCartoesCredito] = useState('80');
    const [cheques, setCheques] = useState('20');
    const [duplicatas, setDuplicatas] = useState('0');
    const [responsavelEmpresa, setResponsavelEmpresa] = useState('');
    const [contadorResponsavel, setContadorResponsavel] = useState('');
    const [faturamentoMedio, setFaturamentoMedio] = useState('');
    const [empresaData, setEmpresaData] = useState(emptyEmpresaData);
    const [rows, setRows] = useState(() => createRows(getCurrentMonthInput(), 'Realizado'));

    useEffect(() => {
        axiosInstance.get('/api/empresas/')
            .then((res) => setEmpresas(res.data || []))
            .catch(() => setMsg({ type: 'error', text: 'Nao foi possivel carregar empresas.' }))
            .finally(() => setLoadingEmpresas(false));
    }, []);

    useEffect(() => {
        const selected = empresas.find((empresa) => String(empresa.id) === String(selectedEmpresaId));
        if (!selected) return;

        setEmpresaData({
            nome: selected.nome || '',
            cnpj: formatCpfCnpj(selected.cnpj),
            inscricaoEstadual: '',
            endereco: selected.endereco || '',
            numero: selected.numero || '',
            bairro: selected.bairro || '',
            cidade: selected.cidade || '',
            uf: selected.uf || '',
            cep: formatCep(selected.cep),
            regime: selected.simples_nacional ? 'Simples Nacional' : empresaData.regime,
        });
        setMsg({ type: '', text: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmpresaId, empresas]);

    const percentPrazo = useMemo(() => {
        const vista = Math.max(0, Math.min(100, Number(percentVista || 0)));
        return Number((100 - vista).toFixed(2));
    }, [percentVista]);

    const calculatedRows = useMemo(() => {
        const vistaRatio = Number(percentVista || 0) / 100;
        const prazoRatio = percentPrazo / 100;

        return rows.map((row) => {
            const total = parseCurrency(row.faturamento);
            const aVista = total * vistaRatio;
            const aPrazo = total * prazoRatio;
            return { ...row, total, aVista, aPrazo };
        });
    }, [rows, percentVista, percentPrazo]);

    const totals = useMemo(() => {
        return calculatedRows.reduce(
            (acc, row) => ({
                total: acc.total + row.total,
                aVista: acc.aVista + row.aVista,
                aPrazo: acc.aPrazo + row.aPrazo,
            }),
            { total: 0, aVista: 0, aPrazo: 0 }
        );
    }, [calculatedRows]);

    const apuracao = useMemo(() => {
        const filledRows = calculatedRows.filter((row) => row.mesAno);
        if (!filledRows.length) return '';
        return `${filledRows[0].mesAno} a ${filledRows[filledRows.length - 1].mesAno}`;
    }, [calculatedRows]);

    const issueDateText = useMemo(() => {
        const date = new Date(`${issueDate}T00:00:00`);
        if (Number.isNaN(date.getTime())) return '';
        return `${date.getDate()} de ${monthNames[date.getMonth()]} de ${date.getFullYear()}`;
    }, [issueDate]);

    const handleRegenerateRows = () => {
        setRows(createRows(baseMonth, mode));
    };

    const handleModeChange = (nextMode) => {
        setMode(nextMode);
        setRows(createRows(baseMonth, nextMode));
    };

    const handleBaseMonthChange = (nextBaseMonth) => {
        setBaseMonth(nextBaseMonth);
        setRows(createRows(nextBaseMonth, mode));
    };

    const updateRow = (id, field, value) => {
        setRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
    };

    const addRow = () => {
        setRows((prev) => [...prev, { id: `manual-${Date.now()}`, mesAno: '', faturamento: '' }]);
    };

    const removeRow = (id) => {
        setRows((prev) => prev.filter((row) => row.id !== id));
    };

    const handleGenerateAverageRevenue = () => {
        const average = parseCurrency(faturamentoMedio);

        if (average <= 0) {
            setMsg({ type: 'error', text: 'Informe um faturamento medio maior que zero.' });
            return;
        }

        const min = Math.max(0, average - 15000);
        const max = average + 15000;

        setRows((prev) => prev.map((row) => {
            const generatedValue = min + Math.random() * (max - min);
            return {
                ...row,
                faturamento: formatCurrencyInput(generatedValue),
            };
        }));
        setMsg({
            type: 'success',
            text: `Faturamentos gerados entre ${formatCurrency(min)} e ${formatCurrency(max)}.`,
        });
    };

    const handleFaturamentoMedioChange = (value) => {
        setFaturamentoMedio(formatMoneyTyping(value));
    };

    const updateEmpresaData = (field, value) => {
        setEmpresaData((prev) => ({ ...prev, [field]: value }));
    };

    const handleEmpresaSemNumeroChange = (checked) => {
        setEmpresaData((prev) => ({ ...prev, numero: checked ? 'S/N' : '' }));
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadHtml = () => {
        const report = document.getElementById('relacao-faturamento-report');
        if (!report) return;

        const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Relação de Faturamento - ${empresaData.nome || 'Empresa'}</title>
<style>
body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #111827; padding: 6px; font-size: 12px; }
th { background: #e5e7eb; }
.report-title { text-align: center; font-size: 20px; font-weight: 700; margin: 16px 0; }
.report-logo { width: 120px; height: auto; object-fit: contain; }
.report-line { border-bottom: 1px solid #111827; min-height: 22px; }
.report-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.report-label { font-size: 11px; font-weight: 700; text-transform: uppercase; }
.signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 72px; }
.signature-line { border-top: 1px solid #111827; text-align: center; padding-top: 8px; }
</style>
</head>
<body>${report.outerHTML}</body>
</html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relacao-faturamento-${(empresaData.nome || 'empresa').toLowerCase().replace(/\s+/g, '-')}.html`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 md:p-8 text-gray-900 dark:text-gray-100">
            <style>{`
                @media print {
                    body { background: #fff !important; }
                    body * { visibility: hidden; }
                    #relacao-faturamento-report, #relacao-faturamento-report * { visibility: visible; }
                    #relacao-faturamento-report {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        box-shadow: none !important;
                        border: none !important;
                        padding: 0 !important;
                    }
                    .print-hidden { display: none !important; }
                }
            `}</style>

            <div className="print-hidden mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Relação de Faturamento</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Modelo coringa</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={handleDownloadHtml}
                        className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                        <DocumentArrowDownIcon className="h-5 w-5" />
                        HTML
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                    >
                        <PrinterIcon className="h-5 w-5" />
                        Imprimir / PDF
                    </button>
                </div>
            </div>

            {msg.text && (
                <div className={`print-hidden mb-4 rounded-md border px-4 py-3 text-sm ${msg.type === 'error' ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300' : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                    {msg.text}
                </div>
            )}

            <div className="print-hidden grid grid-cols-1 gap-5 xl:grid-cols-3">
                <section className={sectionClass}>
                    <div className="mb-4 flex items-center gap-2">
                        <BuildingOffice2Icon className="h-5 w-5 text-emerald-600" />
                        <h2 className="text-lg font-semibold">Empresa</h2>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className={labelClass}>Cadastro</label>
                            <select
                                value={selectedEmpresaId}
                                onChange={(event) => setSelectedEmpresaId(event.target.value)}
                                className={inputClass}
                                disabled={loadingEmpresas}
                            >
                                <option value="">{loadingEmpresas ? 'Carregando...' : 'Preencher manualmente'}</option>
                                {empresas.map((empresa) => (
                                    <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={labelClass}>Nome</label>
                            <input value={empresaData.nome} onChange={(event) => updateEmpresaData('nome', event.target.value)} className={inputClass} />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>CNPJ</label>
                                <input value={empresaData.cnpj} onChange={(event) => updateEmpresaData('cnpj', event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Inscrição Estadual</label>
                                <input value={empresaData.inscricaoEstadual} onChange={(event) => updateEmpresaData('inscricaoEstadual', event.target.value)} className={inputClass} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                                <label className={labelClass}>Logradouro</label>
                                <input value={empresaData.endereco} onChange={(event) => updateEmpresaData('endereco', event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Número</label>
                                <input value={empresaData.numero} onChange={(event) => updateEmpresaData('numero', event.target.value)} disabled={empresaData.numero === 'S/N'} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-70`} />
                                <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                    <input
                                        type="checkbox"
                                        checked={empresaData.numero === 'S/N'}
                                        onChange={(event) => handleEmpresaSemNumeroChange(event.target.checked)}
                                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    Sem número
                                </label>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                            <div>
                                <label className={labelClass}>Bairro</label>
                                <input value={empresaData.bairro} onChange={(event) => updateEmpresaData('bairro', event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Município</label>
                                <input value={empresaData.cidade} onChange={(event) => updateEmpresaData('cidade', event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>UF</label>
                                <input value={empresaData.uf} onChange={(event) => updateEmpresaData('uf', event.target.value.toUpperCase())} maxLength={2} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>CEP</label>
                                <input value={empresaData.cep} onChange={(event) => updateEmpresaData('cep', event.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>
                </section>

                <section className={sectionClass}>
                    <h2 className="mb-4 text-lg font-semibold">Configuração</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-100 p-1 dark:bg-gray-900">
                            {['Realizado', 'Previsto'].map((item) => (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => handleModeChange(item)}
                                    className={`rounded px-3 py-2 text-sm font-semibold transition ${mode === item ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800'}`}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>Mês base</label>
                                <input type="month" value={baseMonth} onChange={(event) => handleBaseMonthChange(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Data</label>
                                <input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={inputClass} />
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleRegenerateRows}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                            <ArrowPathIcon className="h-5 w-5" />
                            Atualizar meses
                        </button>

                        <div>
                            <label className={labelClass}>Localidade</label>
                            <input value={localidade} onChange={(event) => setLocalidade(event.target.value)} className={inputClass} />
                        </div>

                        <div>
                            <label className={labelClass}>Regime Tributário</label>
                            <select value={empresaData.regime} onChange={(event) => updateEmpresaData('regime', event.target.value)} className={inputClass}>
                                {taxRegimes.map((regime) => (
                                    <option key={regime} value={regime}>{regime}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </section>

                <section className={sectionClass}>
                    <h2 className="mb-4 text-lg font-semibold">Percentuais</h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>À vista (%)</label>
                                <input type="number" min="0" max="100" step="0.01" value={percentVista} onChange={(event) => setPercentVista(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>À prazo (%)</label>
                                <input value={formatNumber(percentPrazo)} readOnly className={`${inputClass} bg-gray-100 dark:bg-gray-950`} />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Prazo médio</label>
                            <select value={prazoMedio} onChange={(event) => setPrazoMedio(event.target.value)} className={inputClass}>
                                {['15 Dias', '30 Dias', '45 Dias', '60 Dias', '90 Dias', '120 Dias'].map((item) => (
                                    <option key={item} value={item}>{item}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <div>
                                <label className={labelClass}>Cartões (%)</label>
                                <input type="number" step="0.01" value={cartoesCredito} onChange={(event) => setCartoesCredito(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Cheques (%)</label>
                                <input type="number" step="0.01" value={cheques} onChange={(event) => setCheques(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Duplicatas (%)</label>
                                <input type="number" step="0.01" value={duplicatas} onChange={(event) => setDuplicatas(event.target.value)} className={inputClass} />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className={labelClass}>Responsável pela empresa</label>
                                <input value={responsavelEmpresa} onChange={(event) => setResponsavelEmpresa(event.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Contador responsável</label>
                                <input value={contadorResponsavel} onChange={(event) => setContadorResponsavel(event.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <section className={`${sectionClass} print-hidden mt-5`}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="text-lg font-semibold">Faturamento mensal</h2>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <label className="sr-only" htmlFor="faturamento-medio">Faturamento médio</label>
                            <input
                                id="faturamento-medio"
                                value={faturamentoMedio}
                                onChange={(event) => handleFaturamentoMedioChange(event.target.value)}
                                className={`${inputClass} sm:w-52`}
                                inputMode="numeric"
                                placeholder="0,00"
                            />
                            <button
                                type="button"
                                onClick={handleGenerateAverageRevenue}
                                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                            >
                                <ArrowPathIcon className="h-5 w-5" />
                                Gerar faturamento
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={addRow}
                            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            <PlusIcon className="h-5 w-5" />
                            Linha
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Mês / Ano</th>
                                <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Faturamento</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">À vista</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold uppercase text-gray-500">À prazo</th>
                                <th className="w-14 px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {calculatedRows.map((row) => (
                                <tr key={row.id}>
                                    <td className="px-3 py-2">
                                        <input value={row.mesAno} onChange={(event) => updateRow(row.id, 'mesAno', event.target.value)} className={inputClass} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <input value={row.faturamento} onChange={(event) => updateRow(row.id, 'faturamento', event.target.value)} className={inputClass} placeholder="0,00" />
                                    </td>
                                    <td className="px-3 py-2 text-right text-sm text-gray-700 dark:text-gray-200">{formatCurrency(row.aVista)}</td>
                                    <td className="px-3 py-2 text-right text-sm text-gray-700 dark:text-gray-200">{formatCurrency(row.aPrazo)}</td>
                                    <td className="px-3 py-2 text-right">
                                        <button
                                            type="button"
                                            onClick={() => removeRow(row.id)}
                                            className="rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                                            aria-label="Remover linha"
                                        >
                                            <TrashIcon className="h-5 w-5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <section id="relacao-faturamento-report" className="mt-6 bg-white p-8 text-gray-950 shadow-lg print:mt-0">
                <div className="flex items-start justify-between gap-4">
                    <img src={LogoContabilidade} alt="Inovar Contabilidade" className="report-logo h-auto w-32 object-contain" />
                    <div className="text-right">
                        <div className="text-sm font-semibold uppercase">{mode}</div>
                        <div className="mt-6 text-sm">{localidade}, {issueDateText}</div>
                    </div>
                </div>

                <h2 className="report-title my-6 text-center text-2xl font-bold">Relação de Faturamento</h2>

                <div className="grid grid-cols-1 gap-3 border border-gray-950 p-4 text-sm md:grid-cols-4">
                    <div className="md:col-span-3">
                        <div className="report-label text-xs font-bold uppercase">Empresa</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.nome}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">CNPJ</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.cnpj}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">Inscrição Estadual</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.inscricaoEstadual}</div>
                    </div>
                    <div className="md:col-span-2">
                        <div className="report-label text-xs font-bold uppercase">Logradouro</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.endereco}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">Número</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.numero}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">Bairro</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.bairro}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">Município</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.cidade}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">Estado</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.uf}</div>
                    </div>
                    <div>
                        <div className="report-label text-xs font-bold uppercase">CEP</div>
                        <div className="min-h-7 border-b border-gray-950 py-1">{empresaData.cep}</div>
                    </div>
                </div>

                <div className="mt-5 border border-gray-950 p-4 text-sm">
                    <div className="report-label mb-2 text-xs font-bold uppercase">Regime Tributário</div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                        {taxRegimes.map((regime) => (
                            <div key={regime} className="flex items-center gap-2">
                                <span className="inline-flex h-5 w-5 items-center justify-center border border-gray-950 text-xs font-bold">
                                    {empresaData.regime === regime ? 'X' : ''}
                                </span>
                                <span>{regime}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
                    <div className="border border-gray-950 p-3">
                        <div className="report-label text-xs font-bold uppercase">Faturamento Total - Últimos 12 Meses</div>
                        <div className="mt-1 text-lg font-bold">{formatCurrency(totals.total)}</div>
                    </div>
                    <div className="border border-gray-950 p-3">
                        <div className="report-label text-xs font-bold uppercase">Período de Apuração</div>
                        <div className="mt-1 font-semibold">{apuracao}</div>
                    </div>
                    <div className="border border-gray-950 p-3">
                        <div className="report-label text-xs font-bold uppercase">Prazo Médio</div>
                        <div className="mt-1 font-semibold">{prazoMedio}</div>
                    </div>
                </div>

                <div className="mt-5 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-gray-950 px-2 py-2 text-left">Mês / Ano</th>
                                <th className="border border-gray-950 px-2 py-2 text-right">À Vista</th>
                                <th className="border border-gray-950 px-2 py-2 text-right">À Prazo</th>
                                <th className="border border-gray-950 px-2 py-2 text-right">Total Mensal</th>
                            </tr>
                        </thead>
                        <tbody>
                            {calculatedRows.map((row) => (
                                <tr key={`report-${row.id}`}>
                                    <td className="border border-gray-950 px-2 py-2">{row.mesAno}</td>
                                    <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(row.aVista)}</td>
                                    <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(row.aPrazo)}</td>
                                    <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(row.total)}</td>
                                </tr>
                            ))}
                            <tr className="font-bold">
                                <td className="border border-gray-950 px-2 py-2">Total</td>
                                <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(totals.aVista)}</td>
                                <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(totals.aPrazo)}</td>
                                <td className="border border-gray-950 px-2 py-2 text-right">{formatCurrency(totals.total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-5 border border-gray-950 p-4 text-sm">
                    <div className="mb-3 font-semibold">Percentuais do total do faturamento a prazo, anual, no mercado interno em:</div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                            <div className="report-label text-xs font-bold uppercase">Cartões de Crédito</div>
                            <div className="border-b border-gray-950 py-1">{formatNumber(cartoesCredito)}%</div>
                        </div>
                        <div>
                            <div className="report-label text-xs font-bold uppercase">Cheques</div>
                            <div className="border-b border-gray-950 py-1">{formatNumber(cheques)}%</div>
                        </div>
                        <div>
                            <div className="report-label text-xs font-bold uppercase">Duplicatas</div>
                            <div className="border-b border-gray-950 py-1">{formatNumber(duplicatas)}%</div>
                        </div>
                    </div>
                </div>

                <div className="mt-20 grid grid-cols-1 gap-12 text-center text-sm sm:grid-cols-2">
                    <div>
                        <div className="border-t border-gray-950 pt-2">{responsavelEmpresa || 'Responsável pela empresa'}</div>
                    </div>
                    <div>
                        <div className="border-t border-gray-950 pt-2">{contadorResponsavel || 'Contador responsável'}</div>
                    </div>
                </div>
            </section>
        </motion.div>
    );
};

export default RelacaoFaturamentoPage;
