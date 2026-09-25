import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import axiosInstance from '../api/axiosInstance';
import {
  AdjustmentsHorizontalIcon, ArrowDownTrayIcon, BanknotesIcon, BuildingOfficeIcon,
  CheckCircleIcon, ChevronRightIcon, ClipboardDocumentCheckIcon, ClockIcon,
  DocumentChartBarIcon, ExclamationTriangleIcon, FolderOpenIcon, MagnifyingGlassIcon,
  TableCellsIcon, UserGroupIcon, UsersIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

const REPORTS = [
  { id: 'empresas_cadastro', title: 'Cadastro de empresas', area: 'Operação', description: 'Visão cadastral completa das empresas.', icon: BuildingOfficeIcon, preview: 'companies', fields: ['Empresa', 'CNPJ', 'Cidade/UF', 'Regime', 'Carteira', 'Situação'] },
  { id: 'carteira_responsaveis', title: 'Carteira e responsáveis', area: 'Operação', description: 'Distribuição das empresas por carteira e equipe.', icon: UsersIcon, preview: 'portfolio', fields: ['Empresa', 'Carteira', 'Responsáveis', 'Regime', 'Tags'] },
  { id: 'socios_por_empresa', title: 'Sócios por empresa', area: 'Operação', description: 'Relação societária e quantidade de sócios.', icon: UserGroupIcon, preview: 'partners', fields: ['Empresa', 'Sócio', 'CPF', 'Regime', 'Carteira'] },
  { id: 'obrigacoes_mensais', title: 'Obrigações mensais', area: 'Operação', description: 'Matriz configurável de obrigações por empresa.', icon: ClipboardDocumentCheckIcon, preview: 'obligations', fields: ['INSS', 'FGTS', 'Folha', 'Honorário', 'Simples'] },
  { id: 'boletos_financeiro', title: 'Boletos financeiros', area: 'Financeiro', description: 'Títulos, vencimentos, pagamentos e valores.', icon: BanknotesIcon, preview: 'billing', fields: ['Título', 'Vencimento', 'Pagamento', 'Valor', 'Status'] },
  { id: 'inadimplencia', title: 'Inadimplência', area: 'Financeiro', description: 'Boletos vencidos com dias de atraso.', icon: ExclamationTriangleIcon, preview: 'overdue', fields: ['Empresa', 'Vencimento', 'Atraso', 'Valor', 'Telefone'] },
  { id: 'documentos', title: 'Documentos por pasta', area: 'Documentos', description: 'Arquivos organizados por pasta, mês e ano.', icon: FolderOpenIcon, preview: null, fields: ['Pasta', 'Arquivo', 'Mês', 'Ano', 'Entregue'] },
  { id: 'historico_envios', title: 'Histórico de envios', area: 'Comunicação', description: 'Envios, destinatários, usuários e falhas.', icon: ClockIcon, preview: null, fields: ['Data', 'Empresa', 'Arquivo', 'Status'] },
  { id: 'socios_honorarios', title: 'Sócios e honorários', area: 'Financeiro', description: 'Sócios vinculados aos honorários contratados.', icon: UserGroupIcon, preview: 'fees', fields: ['Empresa', 'Sócio', 'Honorário', 'Vencimento', 'Carteira'] },
  { id: 'usuarios', title: 'Usuários do sistema', area: 'Administração', description: 'Usuários, cargos e empresas gerenciadas.', icon: UsersIcon, preview: null, fields: ['Usuário', 'Cargo', 'Status', 'Empresas'] },
];

const AREAS = ['Todos', ...new Set(REPORTS.map((report) => report.area))];
const OBLIGATIONS = [
  { key: 'inss', label: 'INSS' }, { key: 'fgts', label: 'FGTS' },
  { key: 'folha', label: 'Folha' }, { key: 'honorario', label: 'Honorário' },
  { key: 'simples_nacional', label: 'Simples Nacional' },
];
const EXTRA_COLUMNS = [
  { key: 'location', label: 'Cidade/UF' }, { key: 'regime', label: 'Regime' },
  { key: 'portfolio', label: 'Carteira' }, { key: 'size', label: 'Porte' },
];
const COMPANY_STATUS = [
  { value: 'ativas', label: 'Somente ativas' },
  { value: 'todas', label: 'Ativas e inativas' },
  { value: 'inativas', label: 'Somente inativas' },
];
const BILLING_STATUS = [
  { value: '', label: 'Todos os boletos' }, { value: 'registrado', label: 'Registrados' },
  { value: 'pago', label: 'Pagos' }, { value: 'baixado', label: 'Baixados' },
  { value: 'cancelado', label: 'Cancelados' },
];
const FOLDER_OPTIONS = [
  { value: '', label: 'Todas as pastas' },
  { value: 'documentos_constitutivos', label: 'Documentos constitutivos' },
  { value: 'departamento_pessoal', label: 'Departamento pessoal' },
  { value: 'simples_nacional', label: 'Simples Nacional' },
  { value: 'xml', label: 'XML' }, { value: 'outros', label: 'Outros' },
];

const today = () => new Date().toISOString().slice(0, 10);
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const currentMonth = () => String(new Date().getMonth() + 1).padStart(2, '0');
const currentYear = () => String(new Date().getFullYear());
const normalizeRows = (data) => Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const formatNumber = (value) => Number(value || 0).toLocaleString('pt-BR');
const formatMoney = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const formatCnpj = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value || '—';
};
const getFilename = (header, fallback) => String(header || '').match(/filename="?([^";]+)"?/i)?.[1] || fallback;
const toggleItem = (items, item) => items.includes(item) ? items.filter((current) => current !== item) : [...items, item];

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function FilterLabel({ children }) {
  return <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{children}</span>;
}

const controlClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-700';

function StatusMark({ done }) {
  return <span className={`inline-flex min-w-[82px] items-center justify-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold ${done ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${done ? 'bg-emerald-500' : 'bg-amber-500'}`} />{done ? 'Concluída' : 'Pendente'}</span>;
}

export default function RelatoriosPage() {
  const [selectedArea, setSelectedArea] = useState('Todos');
  const [selectedReportId, setSelectedReportId] = useState('obrigacoes_mensais');
  const [search, setSearch] = useState('');
  const [companyStatus, setCompanyStatus] = useState('ativas');
  const [portfolio, setPortfolio] = useState('');
  const [taxRegime, setTaxRegime] = useState('');
  const [startDate, setStartDate] = useState(yearStart());
  const [endDate, setEndDate] = useState(today());
  const [billingStatus, setBillingStatus] = useState('');
  const [documentFolder, setDocumentFolder] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(currentYear());
  const [selectedObligations, setSelectedObligations] = useState(OBLIGATIONS.map(({ key }) => key));
  const [extraColumns, setExtraColumns] = useState(['location', 'regime', 'portfolio']);
  const [companies, setCompanies] = useState([]);
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      axiosInstance.get('/api/empresas/?full=true'),
      axiosInstance.get('/api/boletos-bb/'),
    ]).then(([companyResult, billingResult]) => {
      if (!mounted) return;
      if (companyResult.status === 'fulfilled') setCompanies(normalizeRows(companyResult.value.data));
      if (billingResult.status === 'fulfilled') setBillings(normalizeRows(billingResult.value.data));
      if (companyResult.status === 'rejected' || billingResult.status === 'rejected') setFeedback({ type: 'error', text: 'Parte dos dados da prévia não pôde ser carregada. As exportações continuam disponíveis.' });
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const selectedReport = useMemo(() => REPORTS.find(({ id }) => id === selectedReportId) || REPORTS[0], [selectedReportId]);
  const SelectedReportIcon = selectedReport.icon;
  const reportsByArea = useMemo(() => selectedArea === 'Todos' ? REPORTS : REPORTS.filter(({ area }) => area === selectedArea), [selectedArea]);
  const portfolioOptions = useMemo(() => [...new Set(companies.map(({ carteira_clientes }) => carteira_clientes).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [companies]);
  const regimeOptions = useMemo(() => [...new Set(companies.map(({ regime_tributario }) => regime_tributario).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [companies]);

  const filteredCompanies = useMemo(() => {
    const term = normalizeText(search);
    const digits = search.replace(/\D/g, '');
    return companies.filter((company) => {
      if (companyStatus === 'ativas' && !company.ativo) return false;
      if (companyStatus === 'inativas' && company.ativo) return false;
      if (portfolio && company.carteira_clientes !== portfolio) return false;
      if (taxRegime && company.regime_tributario !== taxRegime) return false;
      if (!term) return true;
      const searchable = normalizeText(`${company.nome} ${company.cnpj} ${company.email} ${company.telefone} ${company.cidade} ${company.uf}`);
      return searchable.includes(term) || (digits && `${company.cnpj || ''}${company.telefone || ''}`.replace(/\D/g, '').includes(digits));
    });
  }, [companies, companyStatus, portfolio, search, taxRegime]);

  const companyIds = useMemo(() => new Set(filteredCompanies.map(({ id }) => Number(id))), [filteredCompanies]);
  const filteredBillings = useMemo(() => billings.filter((billing) => {
    if (!companyIds.has(Number(billing.empresa))) return false;
    if (billing.data_vencimento && startDate && billing.data_vencimento < startDate) return false;
    if (billing.data_vencimento && endDate && billing.data_vencimento > endDate) return false;
    if (selectedReportId === 'inadimplencia') return billing.status === 'registrado' && billing.data_vencimento && billing.data_vencimento < today();
    return !billingStatus || billing.status === billingStatus;
  }), [billingStatus, billings, companyIds, endDate, selectedReportId, startDate]);

  const preview = useMemo(() => {
    if (selectedReport.preview === 'companies') return { columns: selectedReport.fields, rows: filteredCompanies.map((company) => ({ id: company.id, Empresa: company.nome, CNPJ: formatCnpj(company.cnpj), 'Cidade/UF': [company.cidade, company.uf].filter(Boolean).join('/') || '—', Regime: company.regime_tributario || '—', Carteira: company.carteira_clientes || '—', Situação: company.ativo ? 'Ativa' : 'Inativa' })) };
    if (selectedReport.preview === 'portfolio') return { columns: ['Empresa', 'CNPJ', 'Carteira', 'Responsáveis', 'Regime', 'Tags'], rows: filteredCompanies.map((company) => ({ id: company.id, Empresa: company.nome, CNPJ: formatCnpj(company.cnpj), Carteira: company.carteira_clientes || 'Sem carteira', Responsáveis: `${company.usuarios?.length || 0} vinculado(s)`, Regime: company.regime_tributario || '—', Tags: company.tags?.map(({ nome }) => nome).join(', ') || '—' })) };
    if (selectedReport.preview === 'partners' || selectedReport.preview === 'fees') {
      const rows = filteredCompanies.flatMap((company) => (company.socios?.length ? company.socios : [{ id: 'empty', nome: 'Sem sócio cadastrado', cpf: '' }]).map((partner) => selectedReport.preview === 'fees'
        ? { id: `${company.id}-${partner.id}`, Empresa: company.nome, Sócio: partner.nome, Honorário: formatMoney(company.valor_honorario), Vencimento: company.dia_vencimento_honorario ? `Dia ${company.dia_vencimento_honorario}` : '—', Carteira: company.carteira_clientes || '—' }
        : { id: `${company.id}-${partner.id}`, Empresa: company.nome, Sócio: partner.nome, CPF: partner.cpf || '—', Regime: company.regime_tributario || '—', Carteira: company.carteira_clientes || '—' }));
      return { columns: selectedReport.preview === 'fees' ? ['Empresa', 'Sócio', 'Honorário', 'Vencimento', 'Carteira'] : ['Empresa', 'Sócio', 'CPF', 'Regime', 'Carteira'], rows };
    }
    if (selectedReport.preview === 'obligations') {
      const extras = EXTRA_COLUMNS.filter(({ key }) => extraColumns.includes(key));
      const obligations = OBLIGATIONS.filter(({ key }) => selectedObligations.includes(key));
      const columns = ['Empresa', ...extras.map(({ label }) => label), ...obligations.map(({ label }) => label)];
      const rows = filteredCompanies.map((company) => {
        const row = { id: company.id, Empresa: company.nome };
        extras.forEach(({ key, label }) => { row[label] = key === 'location' ? [company.cidade, company.uf].filter(Boolean).join('/') || '—' : key === 'regime' ? company.regime_tributario || '—' : key === 'portfolio' ? company.carteira_clientes || '—' : company.porte_empresa || '—'; });
        obligations.forEach(({ key, label }) => { row[label] = Boolean(company[key]); });
        return row;
      });
      return { columns, rows, obligationLabels: new Set(obligations.map(({ label }) => label)) };
    }
    if (selectedReport.preview === 'billing' || selectedReport.preview === 'overdue') {
      const overdue = selectedReport.preview === 'overdue';
      return { columns: overdue ? ['Empresa', 'Título', 'Vencimento', 'Dias em atraso', 'Valor', 'Status'] : ['Empresa', 'Título', 'Vencimento', 'Pagamento', 'Valor', 'Status'], rows: filteredBillings.map((billing) => ({ id: billing.id, Empresa: billing.empresa_nome || '—', Título: billing.numero_titulo_cliente || '—', Vencimento: formatDate(billing.data_vencimento), ...(overdue ? { 'Dias em atraso': Math.max(0, Math.floor((new Date(`${today()}T12:00:00`) - new Date(`${billing.data_vencimento}T12:00:00`)) / 86400000)) } : { Pagamento: formatDate(billing.data_pagamento) }), Valor: formatMoney(billing.valor_original), Status: billing.status || '—' })) };
    }
    return { columns: [], rows: [] };
  }, [extraColumns, filteredBillings, filteredCompanies, selectedObligations, selectedReport]);

  const pendingObligations = useMemo(() => filteredCompanies.reduce((total, company) => total + selectedObligations.filter((key) => !company[key]).length, 0), [filteredCompanies, selectedObligations]);
  const previewTotal = ['billing', 'overdue'].includes(selectedReport.preview) ? filteredBillings.reduce((sum, billing) => sum + Number(billing.valor_original || 0), 0) : filteredCompanies.reduce((sum, company) => sum + Number(company.valor_honorario || 0), 0);
  const stats = [
    { label: 'Empresas no escopo', value: filteredCompanies.length, icon: BuildingOfficeIcon },
    { label: 'Registros na prévia', value: preview.rows.length, icon: TableCellsIcon },
    { label: selectedReport.preview === 'obligations' ? 'Pendências' : 'Boletos em aberto', value: selectedReport.preview === 'obligations' ? pendingObligations : filteredBillings.filter(({ status }) => status === 'registrado').length, icon: ExclamationTriangleIcon },
    { label: ['billing', 'overdue'].includes(selectedReport.preview) ? 'Valor no período' : 'Honorários do escopo', value: formatMoney(previewTotal), icon: BanknotesIcon, money: true },
  ];

  const buildFilters = () => ({ search, status_empresa: companyStatus, carteira: portfolio, regime_tributario: taxRegime, data_inicio: startDate, data_fim: endDate, status_boleto: selectedReportId === 'inadimplencia' ? 'registrado' : billingStatus, pasta_documento: documentFolder, status_envio: sendStatus, mes: month, ano: year });
  const selectArea = (area) => {
    setSelectedArea(area);
    if (area !== 'Todos' && selectedReport.area !== area) {
      setSelectedReportId(REPORTS.find((report) => report.area === area)?.id || selectedReportId);
    }
  };
  const handleExport = async () => {
    setExporting(true); setFeedback(null);
    try {
      const response = await axiosInstance.post('/api/relatorios/excel/', { report_type: selectedReport.id, filters: buildFilters() }, { responseType: 'blob' });
      downloadBlob(response.data, getFilename(response.headers?.['content-disposition'], `relatorio_${selectedReport.id}.xlsx`));
      setFeedback({ type: 'success', text: `${selectedReport.title} gerado com sucesso.` });
    } catch (error) {
      let text = 'Não foi possível gerar o Excel. Verifique os filtros e tente novamente.';
      if (error?.response?.data instanceof Blob) { try { text = JSON.parse(await error.response.data.text()).error || text; } catch { /* resposta sem JSON */ } }
      setFeedback({ type: 'error', text });
    } finally { setExporting(false); }
  };
  const resetFilters = () => { setSearch(''); setCompanyStatus('ativas'); setPortfolio(''); setTaxRegime(''); setStartDate(yearStart()); setEndDate(today()); setBillingStatus(''); };
  const showDates = ['boletos_financeiro', 'inadimplencia', 'historico_envios'].includes(selectedReportId);
  const hasFilters = Boolean(search || portfolio || taxRegime || companyStatus !== 'ativas' || billingStatus);

  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-none space-y-4 px-0 py-2 text-slate-900 dark:text-slate-100">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Análise e exportação</p><h1 className="mt-1 font-serif text-3xl font-semibold text-slate-950 dark:text-white sm:text-4xl">Relatórios</h1></div>
        <button type="button" onClick={handleExport} disabled={exporting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"><ArrowDownTrayIcon className={`h-5 w-5 ${exporting ? 'animate-bounce' : ''}`} />{exporting ? 'Gerando Excel...' : 'Exportar relatório'}</button>
      </header>

      {feedback && <div role="status" className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300'}`}><span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Fechar aviso"><XMarkIcon className="h-4 w-4" /></button></div>}

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, money }) => <section key={label} className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p><strong className={`${money ? 'text-base' : 'text-xl'} tabular-nums text-slate-950 dark:text-white`}>{loading ? '—' : money ? value : formatNumber(value)}</strong></div></section>)}
      </div>

      <div className="grid min-h-[620px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/40 xl:border-b-0 xl:border-r" aria-label="Configuração do relatório">
          <section>
            <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Tipo de relatório</h2><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{REPORTS.length}</span></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{AREAS.map((area) => <button key={area} type="button" onClick={() => selectArea(area)} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${selectedArea === area ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{area}</button>)}</div>
            <div className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto pr-1">{reportsByArea.map((report) => { const Icon = report.icon; const active = selectedReportId === report.id; return <button key={report.id} type="button" onClick={() => setSelectedReportId(report.id)} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${active ? 'border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800' : 'border-transparent text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-800/70'}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${active ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950' : 'bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate text-xs font-semibold">{report.title}</span><ChevronRightIcon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`} /></button>; })}</div>
          </section>

          <section className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Escopo</h2>{hasFilters && <button type="button" onClick={resetFilters} className="text-[10px] font-bold text-slate-600 underline underline-offset-2 dark:text-slate-300">Limpar</button>}</div>
            <div className="mt-3 grid gap-3">
              <label><FilterLabel>Buscar empresa</FilterLabel><div className="relative"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, CNPJ ou cidade" className={`${controlClass} pl-9`} /></div></label>
              <label><FilterLabel>Situação</FilterLabel><select value={companyStatus} onChange={(event) => setCompanyStatus(event.target.value)} className={controlClass}>{COMPANY_STATUS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              <label><FilterLabel>Carteira</FilterLabel><select value={portfolio} onChange={(event) => setPortfolio(event.target.value)} className={controlClass}><option value="">Todas</option>{portfolioOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
              <label><FilterLabel>Regime tributário</FilterLabel><select value={taxRegime} onChange={(event) => setTaxRegime(event.target.value)} className={controlClass}><option value="">Todos</option>{regimeOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
            </div>
          </section>

          {selectedReport.preview === 'obligations' && <section className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800"><div className="flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Obrigações exibidas</h2><span className="text-[10px] font-bold text-slate-500">{selectedObligations.length}</span></div><div className="mt-2 grid gap-1">{OBLIGATIONS.map(({ key, label }) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:text-slate-200 dark:hover:bg-slate-800"><input type="checkbox" checked={selectedObligations.includes(key)} onChange={() => setSelectedObligations((current) => toggleItem(current, key))} className="rounded border-slate-300 text-slate-900 focus:ring-slate-500" />{label}</label>)}</div><h3 className="mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Colunas extras</h3><div className="mt-2 flex flex-wrap gap-1.5">{EXTRA_COLUMNS.map(({ key, label }) => <button key={key} type="button" aria-pressed={extraColumns.includes(key)} onClick={() => setExtraColumns((current) => toggleItem(current, key))} className={`rounded-md border px-2 py-1 text-[10px] font-bold ${extraColumns.includes(key) ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{label}</button>)}</div></section>}

          {showDates && <section className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Período</h2><div className="mt-3 grid grid-cols-2 gap-2"><label><FilterLabel>De</FilterLabel><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={`${controlClass} px-2 text-xs`} /></label><label><FilterLabel>Até</FilterLabel><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={`${controlClass} px-2 text-xs`} /></label></div>{selectedReportId === 'boletos_financeiro' && <label className="mt-3 block"><FilterLabel>Status</FilterLabel><select value={billingStatus} onChange={(event) => setBillingStatus(event.target.value)} className={controlClass}>{BILLING_STATUS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}{selectedReportId === 'historico_envios' && <label className="mt-3 block"><FilterLabel>Status do envio</FilterLabel><select value={sendStatus} onChange={(event) => setSendStatus(event.target.value)} className={controlClass}><option value="">Todos</option><option value="sucesso">Sucesso</option><option value="falha">Falha</option></select></label>}</section>}
          {selectedReportId === 'documentos' && <section className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-800"><h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Documentos</h2><div className="mt-3 grid gap-3"><label><FilterLabel>Pasta</FilterLabel><select value={documentFolder} onChange={(event) => setDocumentFolder(event.target.value)} className={controlClass}>{FOLDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label><FilterLabel>Mês</FilterLabel><input type="number" min="1" max="12" value={month} onChange={(event) => setMonth(event.target.value)} className={controlClass} /></label><label><FilterLabel>Ano</FilterLabel><input type="number" min="2020" max="2100" value={year} onChange={(event) => setYear(event.target.value)} className={controlClass} /></label></div></div></section>}
        </aside>

        <section className="min-w-0 p-4 sm:p-5" aria-label="Prévia do relatório">
          <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"><DocumentChartBarIcon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Prévia do relatório</p><h2 className="truncate text-lg font-bold text-slate-950 dark:text-white">{selectedReport.title}</h2><p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{selectedReport.description}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{preview.rows.length} registro(s)</span><button type="button" onClick={handleExport} disabled={exporting} className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950"><ArrowDownTrayIcon className="h-4 w-4" />Excel</button></div></div>

          {loading ? <div className="mt-4 space-y-2" aria-label="Carregando prévia">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div>
            : selectedReport.preview && preview.columns.length ? <div className="mt-4 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-[760px] border-collapse text-left text-xs"><thead className="sticky top-0 z-[1] bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:bg-slate-800 dark:text-slate-300"><tr>{preview.columns.map((column) => <th key={column} className={`whitespace-nowrap px-3 py-3 font-bold ${column === 'Empresa' ? 'sticky left-0 z-[2] bg-slate-100 dark:bg-slate-800' : 'text-center'}`}>{column}</th>)}</tr></thead><tbody>{preview.rows.length ? preview.rows.map((row) => <tr key={row.id} className="border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">{preview.columns.map((column) => <td key={column} className={`whitespace-nowrap px-3 py-2.5 ${column === 'Empresa' ? 'sticky left-0 bg-white font-semibold text-slate-900 dark:bg-slate-900 dark:text-white' : 'text-center text-slate-600 dark:text-slate-300'}`}>{preview.obligationLabels?.has(column) ? <StatusMark done={row[column]} /> : column === 'Situação' ? <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${row[column] === 'Ativa' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{row[column]}</span> : row[column]}</td>)}</tr>) : <tr><td colSpan={preview.columns.length} className="px-4 py-14 text-center text-sm text-slate-500">Nenhum registro encontrado com os filtros atuais.</td></tr>}</tbody>{preview.obligationLabels?.size > 0 && preview.rows.length > 0 && <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-950/50 dark:text-slate-200"><tr>{preview.columns.map((column, index) => <td key={column} className={`px-3 py-3 ${index === 0 ? 'sticky left-0 bg-slate-50 dark:bg-slate-950' : 'text-center'}`}>{index === 0 ? 'Concluídas' : preview.obligationLabels.has(column) ? preview.rows.filter((row) => row[column]).length : ''}</td>)}</tr></tfoot>}</table></div>
              : <div className="mt-4 grid min-h-[360px] place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-950/30"><div><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"><SelectedReportIcon className="h-6 w-6" /></span><h3 className="mt-4 font-bold text-slate-900 dark:text-white">Relatório pronto para exportação</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500 dark:text-slate-400">Este relatório cruza dados no servidor durante a geração do Excel. Os filtros ao lado serão aplicados ao arquivo.</p><div className="mt-4 flex flex-wrap justify-center gap-2">{selectedReport.fields.map((field) => <span key={field} className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">{field}</span>)}</div><button type="button" onClick={handleExport} disabled={exporting} className="mt-6 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-950"><ArrowDownTrayIcon className="h-5 w-5" />Gerar Excel</button></div></div>}

          <footer className="mt-4 flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950/50 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-1.5"><CheckCircleIcon className="h-4 w-4 text-emerald-600" />A prévia respeita empresa, situação, carteira e regime.</span><span className="inline-flex items-center gap-1.5"><AdjustmentsHorizontalIcon className="h-4 w-4" />O Excel inclui todos os campos detalhados do relatório.</span></footer>
        </section>
      </div>
    </motion.main>
  );
}
