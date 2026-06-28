import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import axiosInstance from '../api/axiosInstance';
import {
    AdjustmentsHorizontalIcon,
    ArrowDownTrayIcon,
    BanknotesIcon,
    BuildingOfficeIcon,
    CalendarDaysIcon,
    CheckCircleIcon,
    ClipboardDocumentCheckIcon,
    ClockIcon,
    DocumentChartBarIcon,
    ExclamationTriangleIcon,
    FolderOpenIcon,
    MagnifyingGlassIcon,
    TableCellsIcon,
    UserGroupIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';

const reportCards = [
    {
        id: 'empresas_cadastro',
        title: 'Cadastro de empresas',
        area: 'Operacao',
        description: 'Dados cadastrais, regime, carteira, honorarios, tags e situacao.',
        icon: BuildingOfficeIcon,
        tone: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950',
        fields: ['Empresas', 'CNPJ', 'Regime', 'Carteira', 'Tags'],
    },
    {
        id: 'carteira_responsaveis',
        title: 'Carteira e responsaveis',
        area: 'Operacao',
        description: 'Empresas por carteira, usuarios vinculados e responsaveis internos.',
        icon: UsersIcon,
        tone: 'bg-cyan-600 text-white',
        fields: ['Carteira', 'Usuarios', 'Responsaveis'],
    },
    {
        id: 'socios_por_empresa',
        title: 'Socios por empresa',
        area: 'Operacao',
        description: 'Relacao societaria por empresa, com CPF, quantidade de socios, regime e carteira.',
        icon: UserGroupIcon,
        tone: 'bg-teal-600 text-white',
        fields: ['Empresa', 'Socio', 'CPF', 'Qtd socios'],
    },
    {
        id: 'obrigacoes_mensais',
        title: 'Obrigacoes mensais',
        area: 'Operacao',
        description: 'INSS, FGTS, folha, honorario, Simples Nacional e pendencias.',
        icon: ClipboardDocumentCheckIcon,
        tone: 'bg-emerald-600 text-white',
        fields: ['INSS', 'FGTS', 'Folha', 'Honorario', 'Simples'],
    },
    {
        id: 'boletos_financeiro',
        title: 'Boletos financeiro',
        area: 'Financeiro',
        description: 'Boletos por vencimento, pagamento, valor, status e telefone.',
        icon: BanknotesIcon,
        tone: 'bg-amber-600 text-white',
        fields: ['Vencimento', 'Pagamento', 'Valor', 'Status'],
    },
    {
        id: 'inadimplencia',
        title: 'Inadimplencia',
        area: 'Financeiro',
        description: 'Boletos registrados vencidos, dias em atraso e total por periodo.',
        icon: ExclamationTriangleIcon,
        tone: 'bg-rose-600 text-white',
        fields: ['Atraso', 'Valor', 'Telefone'],
    },
    {
        id: 'documentos',
        title: 'Documentos por pasta',
        area: 'Documentos',
        description: 'Arquivos das pastas constitutivos, DP, Simples, XML e outros.',
        icon: FolderOpenIcon,
        tone: 'bg-violet-600 text-white',
        fields: ['Pasta', 'Arquivo', 'Mes', 'Ano', 'Entregue'],
    },
    {
        id: 'historico_envios',
        title: 'Historico de envios',
        area: 'Comunicacao',
        description: 'Envios por WhatsApp, destinatario, usuario, status e erros.',
        icon: ClockIcon,
        tone: 'bg-indigo-600 text-white',
        fields: ['Data', 'Empresa', 'Arquivo', 'Status'],
    },
    {
        id: 'socios_honorarios',
        title: 'Socios e honorarios',
        area: 'Financeiro',
        description: 'Socios cadastrados junto do valor e vencimento de honorarios.',
        icon: UserGroupIcon,
        tone: 'bg-teal-600 text-white',
        fields: ['Socios', 'CPF', 'Honorarios'],
    },
    {
        id: 'usuarios',
        title: 'Usuarios do sistema',
        area: 'Administracao',
        description: 'Usuarios, cargos, status e empresas gerenciadas.',
        icon: UsersIcon,
        tone: 'bg-gray-700 text-white',
        fields: ['Cargo', 'Status', 'Empresas'],
    },
];

const areaOptions = ['Todos', 'Operacao', 'Financeiro', 'Documentos', 'Comunicacao', 'Administracao'];
const statusEmpresaOptions = [
    { value: 'ativas', label: 'Somente ativas' },
    { value: 'todas', label: 'Ativas e inativas' },
    { value: 'inativas', label: 'Somente inativas' },
];
const statusBoletoOptions = [
    { value: '', label: 'Todos os boletos' },
    { value: 'registrado', label: 'Registrados' },
    { value: 'pago', label: 'Pagos' },
    { value: 'baixado', label: 'Baixados' },
    { value: 'cancelado', label: 'Cancelados' },
];
const pastaOptions = [
    { value: '', label: 'Todas as pastas' },
    { value: 'documentos_constitutivos', label: 'Documentos constitutivos' },
    { value: 'departamento_pessoal', label: 'Departamento pessoal' },
    { value: 'simples_nacional', label: 'Simples Nacional' },
    { value: 'xml', label: 'XML' },
    { value: 'outros', label: 'Outros' },
];
const statusEnvioOptions = [
    { value: '', label: 'Todos os envios' },
    { value: 'sucesso', label: 'Sucesso' },
    { value: 'falha', label: 'Falha' },
];

const getTodayInput = () => new Date().toISOString().slice(0, 10);

const getYearStartInput = () => {
    const now = new Date();
    return `${now.getFullYear()}-01-01`;
};

const getCurrentMonth = () => String(new Date().getMonth() + 1).padStart(2, '0');
const getCurrentYear = () => String(new Date().getFullYear());

const normalizeRows = (data) => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.results)) return data.results;
    return [];
};

const getFilenameFromDisposition = (contentDisposition, fallback) => {
    const match = String(contentDisposition || '').match(/filename="?([^"]+)"?/i);
    return match?.[1] || fallback;
};

const downloadBlob = (blob, filename) => {
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
};

const compactNumber = (value) => Number(value || 0).toLocaleString('pt-BR');

const RelatoriosPage = () => {
    const [selectedArea, setSelectedArea] = useState('Todos');
    const [selectedReportId, setSelectedReportId] = useState('empresas_cadastro');
    const [search, setSearch] = useState('');
    const [statusEmpresa, setStatusEmpresa] = useState('ativas');
    const [carteira, setCarteira] = useState('');
    const [regimeTributario, setRegimeTributario] = useState('');
    const [dataInicio, setDataInicio] = useState(getYearStartInput());
    const [dataFim, setDataFim] = useState(getTodayInput());
    const [statusBoleto, setStatusBoleto] = useState('');
    const [pastaDocumento, setPastaDocumento] = useState('');
    const [statusEnvio, setStatusEnvio] = useState('');
    const [mes, setMes] = useState(getCurrentMonth());
    const [ano, setAno] = useState(getCurrentYear());
    const [empresas, setEmpresas] = useState([]);
    const [boletos, setBoletos] = useState([]);
    const [loadingBase, setLoadingBase] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        let mounted = true;
        setLoadingBase(true);

        Promise.all([
            axiosInstance.get('/api/empresas/?all=true'),
            axiosInstance.get('/api/boletos-bb/'),
        ])
            .then(([empresasResponse, boletosResponse]) => {
                if (!mounted) return;
                setEmpresas(normalizeRows(empresasResponse.data));
                setBoletos(normalizeRows(boletosResponse.data));
            })
            .catch(() => {
                if (mounted) {
                    setFeedback({
                        type: 'error',
                        text: 'Nao foi possivel carregar os indicadores da central de relatorios.',
                    });
                }
            })
            .finally(() => {
                if (mounted) setLoadingBase(false);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const selectedReport = useMemo(
        () => reportCards.find((report) => report.id === selectedReportId) || reportCards[0],
        [selectedReportId]
    );

    const visibleReports = useMemo(() => (
        selectedArea === 'Todos'
            ? reportCards
            : reportCards.filter((report) => report.area === selectedArea)
    ), [selectedArea]);

    const carteiraOptions = useMemo(() => {
        const options = new Set();
        empresas.forEach((empresa) => {
            if (empresa.carteira_clientes) options.add(empresa.carteira_clientes);
        });
        return Array.from(options).sort((a, b) => a.localeCompare(b));
    }, [empresas]);

    const regimeOptions = useMemo(() => {
        const options = new Set();
        empresas.forEach((empresa) => {
            if (empresa.regime_tributario) options.add(empresa.regime_tributario);
        });
        return Array.from(options).sort((a, b) => a.localeCompare(b));
    }, [empresas]);

    const stats = useMemo(() => {
        const activeCompanies = empresas.filter((empresa) => empresa.ativo).length;
        const openBoletos = boletos.filter((boleto) => boleto.status === 'registrado').length;
        const overdueBoletos = boletos.filter((boleto) => {
            if (boleto.status !== 'registrado' || !boleto.data_vencimento) return false;
            return new Date(`${boleto.data_vencimento}T00:00:00`) < new Date(`${getTodayInput()}T00:00:00`);
        }).length;
        const pendingTasks = empresas.reduce((total, empresa) => {
            const checks = [empresa.inss, empresa.fgts, empresa.folha, empresa.honorario, empresa.simples_nacional];
            return total + checks.filter((checked) => !checked).length;
        }, 0);

        return [
            { label: 'Relatorios', value: reportCards.length, icon: TableCellsIcon },
            { label: 'Empresas ativas', value: activeCompanies, icon: BuildingOfficeIcon },
            { label: 'Boletos abertos', value: openBoletos, icon: BanknotesIcon },
            { label: 'Pendencias', value: pendingTasks + overdueBoletos, icon: ExclamationTriangleIcon },
        ];
    }, [boletos, empresas]);

    const buildFilters = () => ({
        search,
        status_empresa: statusEmpresa,
        carteira,
        regime_tributario: regimeTributario,
        data_inicio: dataInicio,
        data_fim: dataFim,
        status_boleto: selectedReportId === 'inadimplencia' ? 'registrado' : statusBoleto,
        pasta_documento: pastaDocumento,
        status_envio: statusEnvio,
        mes,
        ano,
    });

    const handleExport = async (reportId = selectedReportId) => {
        const report = reportCards.find((item) => item.id === reportId) || selectedReport;
        setExporting(true);
        setFeedback(null);
        setSelectedReportId(report.id);

        try {
            const response = await axiosInstance.post('/api/relatorios/excel/', {
                report_type: report.id,
                filters: buildFilters(),
            }, {
                responseType: 'blob',
            });
            const filename = getFilenameFromDisposition(
                response.headers?.['content-disposition'],
                `relatorio_${report.id}.xlsx`
            );
            downloadBlob(response.data, filename);
            setFeedback({
                type: 'success',
                text: `${report.title} gerado com sucesso.`,
            });
        } catch (err) {
            let errorText = 'Nao foi possivel gerar o Excel. Verifique os filtros e tente novamente.';
            if (err?.response?.data instanceof Blob) {
                try {
                    const parsed = JSON.parse(await err.response.data.text());
                    errorText = parsed.error || errorText;
                } catch {
                    errorText = 'Nao foi possivel gerar o Excel para este relatorio.';
                }
            }
            setFeedback({ type: 'error', text: errorText });
        } finally {
            setExporting(false);
        }
    };

    const showDateFilters = ['boletos_financeiro', 'inadimplencia', 'historico_envios'].includes(selectedReportId);
    const showDocumentFilters = selectedReportId === 'documentos';
    const showBoletoStatus = selectedReportId === 'boletos_financeiro';
    const showEnvioStatus = selectedReportId === 'historico_envios';

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Central</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Relatorios em Excel</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
                        Gere planilhas a partir dos dados do sistema: cadastro, financeiro, documentos, obrigacoes, usuarios e historico de envios.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => handleExport()}
                    disabled={exporting}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                >
                    <ArrowDownTrayIcon className={`h-5 w-5 ${exporting ? 'animate-bounce' : ''}`} />
                    {exporting ? 'Gerando...' : 'Gerar Excel'}
                </button>
            </div>

            {feedback && (
                <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                    feedback.type === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300'
                        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300'
                }`}>
                    {feedback.text}
                </div>
            )}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {stats.map((item) => {
                    const Icon = item.icon;
                    return (
                        <section key={item.label} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{item.label}</p>
                                    <p className="mt-3 text-2xl font-bold tabular-nums text-gray-950 dark:text-white">
                                        {loadingBase ? '...' : compactNumber(item.value)}
                                    </p>
                                </div>
                                <span className="rounded-md bg-slate-900 p-2.5 text-white dark:bg-slate-100 dark:text-slate-950">
                                    <Icon className="h-5 w-5" />
                                </span>
                            </div>
                        </section>
                    );
                })}
            </div>

            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-center gap-2">
                        <AdjustmentsHorizontalIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                        <h2 className="text-lg font-semibold text-gray-950 dark:text-white">Filtros do Excel</h2>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {areaOptions.map((area) => (
                            <button
                                key={area}
                                type="button"
                                onClick={() => setSelectedArea(area)}
                                className={`h-9 rounded-md border px-3 text-sm font-semibold transition-colors ${
                                    selectedArea === area
                                        ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                                }`}
                            >
                                {area}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-4">
                    <label className="lg:col-span-2">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Busca</span>
                        <div className="relative">
                            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                            <input
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Empresa, CNPJ, email ou telefone"
                                className="w-full rounded-md border border-gray-200 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20"
                            />
                        </div>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Situacao</span>
                        <select value={statusEmpresa} onChange={(event) => setStatusEmpresa(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                            {statusEmpresaOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Carteira</span>
                        <select value={carteira} onChange={(event) => setCarteira(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                            <option value="">Todas</option>
                            {carteiraOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>

                    <label>
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Regime</span>
                        <select value={regimeTributario} onChange={(event) => setRegimeTributario(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                            <option value="">Todos</option>
                            {regimeOptions.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                    </label>

                    {showDateFilters && (
                        <>
                            <label>
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data inicial</span>
                                <input type="date" value={dataInicio} onChange={(event) => setDataInicio(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20" />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Data final</span>
                                <input type="date" value={dataFim} onChange={(event) => setDataFim(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20" />
                            </label>
                        </>
                    )}

                    {showBoletoStatus && (
                        <label>
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status boleto</span>
                            <select value={statusBoleto} onChange={(event) => setStatusBoleto(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                                {statusBoletoOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                    )}

                    {showDocumentFilters && (
                        <>
                            <label>
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Pasta</span>
                                <select value={pastaDocumento} onChange={(event) => setPastaDocumento(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                                    {pastaOptions.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Mes</span>
                                <input type="number" min="1" max="12" value={mes} onChange={(event) => setMes(event.target.value.padStart(2, '0'))} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20" />
                            </label>
                            <label>
                                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Ano</span>
                                <input type="number" min="2020" max="2100" value={ano} onChange={(event) => setAno(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20" />
                            </label>
                        </>
                    )}

                    {showEnvioStatus && (
                        <label>
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Status envio</span>
                            <select value={statusEnvio} onChange={(event) => setStatusEnvio(event.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20">
                                {statusEnvioOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {visibleReports.map((report) => {
                        const Icon = report.icon;
                        const active = selectedReportId === report.id;
                        return (
                            <button
                                key={report.id}
                                type="button"
                                onClick={() => setSelectedReportId(report.id)}
                                className={`flex min-h-64 flex-col rounded-lg border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-gray-900 ${
                                    active
                                        ? 'border-slate-900 ring-2 ring-slate-900/10 dark:border-slate-100 dark:ring-slate-100/10'
                                        : 'border-gray-200 dark:border-gray-800'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <span className={`flex h-11 w-11 items-center justify-center rounded-lg ${report.tone}`}>
                                        <Icon className="h-6 w-6" />
                                    </span>
                                    {active && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                                            <CheckCircleIcon className="h-4 w-4" />
                                            Selecionado
                                        </span>
                                    )}
                                </div>

                                <div className="mt-4 flex-1">
                                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c49a61]">{report.area}</p>
                                    <h3 className="mt-2 text-lg font-bold text-gray-950 dark:text-white">{report.title}</h3>
                                    <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">{report.description}</p>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    {report.fields.map((field) => (
                                        <span key={field} className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            </button>
                        );
                    })}
                </section>

                <aside className="h-fit rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-6">
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                            <DocumentChartBarIcon className="h-6 w-6" />
                        </span>
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Excel selecionado</p>
                            <h2 className="text-lg font-bold text-gray-950 dark:text-white">{selectedReport.title}</h2>
                        </div>
                    </div>

                    <div className="mt-5 space-y-3 text-sm">
                        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                            <div className="mb-2 flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
                                <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
                                Escopo aplicado
                            </div>
                            <p className="text-gray-600 dark:text-gray-400">
                                {statusEmpresaOptions.find((item) => item.value === statusEmpresa)?.label}
                                {carteira ? `, carteira ${carteira}` : ', todas as carteiras'}
                                {regimeTributario ? `, regime ${regimeTributario}` : ''}.
                            </p>
                        </div>

                        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                            <div className="mb-2 flex items-center gap-2 font-semibold text-gray-950 dark:text-white">
                                <TableCellsIcon className="h-5 w-5 text-gray-500" />
                                Colunas principais
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {selectedReport.fields.map((field) => (
                                    <span key={field} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                        {field}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => handleExport()}
                        disabled={exporting}
                        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                    >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                        Baixar este Excel
                    </button>
                </aside>
            </div>
        </motion.div>
    );
};

export default RelatoriosPage;
