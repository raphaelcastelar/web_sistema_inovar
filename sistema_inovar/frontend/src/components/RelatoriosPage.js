import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import axiosInstance from '../api/axiosInstance';
import {
  AdjustmentsHorizontalIcon, ArrowDownTrayIcon, BanknotesIcon, BuildingOfficeIcon,
  CheckCircleIcon, ChevronDownIcon, ClipboardDocumentCheckIcon, DocumentChartBarIcon,
  FolderOpenIcon, MagnifyingGlassIcon, TableCellsIcon, UserGroupIcon, UsersIcon, XMarkIcon,
} from '@heroicons/react/24/outline';

const rows = (data) => Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value, withTime = false) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' });
};
const cnpj = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : value || '—';
};
const yesNo = (value) => value ? 'Sim' : 'Não';
const names = (items) => (items || []).map((item) => item?.nome || item).filter(Boolean).join(', ') || '—';
const excelOnly = () => 'No Excel';
const plain = (key, label) => ({ key, label, value: (company) => company[key] ?? '—' });

const COLUMN_GROUPS = [
  { id: 'cadastro', label: 'Cadastro e contato', columns: [
    { key: 'nome', label: 'Empresa', value: (c) => c.nome || '—' },
    { key: 'cnpj', label: 'CNPJ', value: (c) => cnpj(c.cnpj) },
    { key: 'ativo', label: 'Situação', value: (c) => c.ativo ? 'Ativa' : 'Inativa' },
    plain('email', 'E-mail'), plain('telefone', 'Telefone'),
  ] },
  { id: 'endereco', label: 'Endereço', columns: [plain('endereco', 'Endereço'), plain('numero', 'Número'), plain('bairro', 'Bairro'), plain('cidade', 'Cidade'), plain('uf', 'UF'), plain('cep', 'CEP')] },
  { id: 'fiscal', label: 'Enquadramento fiscal', columns: [
    plain('regime_tributario', 'Regime tributário'), plain('porte_empresa', 'Porte'), plain('carteira_clientes', 'Carteira'),
    { key: 'grupo_atividade', label: 'Grupo de atividade', value: (c) => names(c.grupo_atividade) },
    { key: 'simples_nacional', label: 'Simples Nacional', value: (c) => yesNo(c.simples_nacional) }, plain('anexo_simples', 'Anexo do Simples'),
  ] },
  { id: 'obrigacoes', label: 'Obrigações e monitoramento', columns: [
    ...['inss', 'fgts', 'folha', 'honorario', 'monitorar_simples'].map((key) => ({ key, label: { inss: 'INSS', fgts: 'FGTS', folha: 'Folha', honorario: 'Honorário', monitorar_simples: 'Monitorar Simples' }[key], value: (c) => yesNo(c[key]) })),
    { key: 'pendencias_obrigacoes', label: 'Pendências de obrigações', value: (c) => [c.inss, c.fgts, c.folha, c.honorario, c.simples_nacional].filter((item) => !item).length },
  ] },
  { id: 'financeiro', label: 'Honorários e condições', columns: [
    { key: 'valor_honorario', label: 'Valor do honorário', value: (c) => money(c.valor_honorario) },
    plain('dia_vencimento_honorario', 'Dia de vencimento'), plain('juros_mora_taxa', 'Juros de mora (%)'), plain('multa_taxa', 'Multa (%)'), plain('desconto_taxa', 'Desconto (%)'), plain('dias_para_desconto', 'Dias para desconto'),
  ] },
  { id: 'vinculos', label: 'Sócios, equipe e tags', columns: [
    { key: 'total_socios', label: 'Quantidade de sócios', value: (c) => c.socios?.length || 0 },
    { key: 'socios_nomes', label: 'Sócios', value: (c) => names(c.socios) },
    { key: 'socios_cpfs', label: 'CPFs dos sócios', value: (c) => (c.socios || []).map(({ cpf }) => cpf).filter(Boolean).join(', ') || '—' },
    { key: 'tags', label: 'Tags', value: (c) => names(c.tags) },
    { key: 'usuarios', label: 'Usuários vinculados', value: (c) => `${c.usuarios?.length || 0} vinculado(s)` },
    { key: 'gerentes', label: 'Gerenciada por', value: excelOnly },
  ] },
  { id: 'datas', label: 'Datas do cadastro', columns: [
    { key: 'criado_em', label: 'Data de cadastro', value: (c) => date(c.criado_em, true) },
    { key: 'desativado_em', label: 'Data de desativação', value: (c) => date(c.desativado_em, true) },
  ] },
  { id: 'boletos', label: 'Resumo de boletos', columns: [
    { key: 'total_boletos', label: 'Quantidade de boletos', value: (c, b) => b.length },
    { key: 'boletos_abertos', label: 'Boletos em aberto', value: (c, b) => b.filter((x) => x.status === 'registrado').length },
    { key: 'boletos_vencidos', label: 'Boletos vencidos', value: (c, b) => b.filter((x) => x.status === 'registrado' && x.data_vencimento && x.data_vencimento < new Date().toISOString().slice(0, 10)).length },
    { key: 'boletos_pagos', label: 'Boletos pagos', value: (c, b) => b.filter((x) => x.status === 'pago').length },
    { key: 'valor_total_boletos', label: 'Valor total dos boletos', value: (c, b) => money(b.reduce((sum, x) => sum + Number(x.valor_original || 0), 0)) },
    { key: 'valor_boletos_abertos', label: 'Valor em aberto', value: (c, b) => money(b.filter((x) => x.status === 'registrado').reduce((sum, x) => sum + Number(x.valor_original || 0), 0)) },
    { key: 'valor_boletos_pagos', label: 'Valor pago', value: (c, b) => money(b.filter((x) => x.status === 'pago').reduce((sum, x) => sum + Number(x.valor_pago || 0), 0)) },
    { key: 'vencimento_aberto_mais_antigo', label: 'Vencimento em aberto mais antigo', value: (c, b) => date(b.filter((x) => x.status === 'registrado' && x.data_vencimento).map((x) => x.data_vencimento).sort()[0]) },
    { key: 'ultimo_pagamento', label: 'Último pagamento', value: (c, b) => date(b.map((x) => x.data_pagamento).filter(Boolean).sort().reverse()[0]) },
  ] },
  { id: 'documentos', label: 'Documentos', columns: [
    { key: 'total_documentos', label: 'Quantidade de documentos', value: excelOnly },
    { key: 'documentos_entregues', label: 'Documentos entregues', value: excelOnly },
    { key: 'documentos_pendentes', label: 'Documentos pendentes', value: excelOnly },
  ] },
  { id: 'comunicacao', label: 'Comunicação', columns: [
    { key: 'total_envios', label: 'Quantidade de envios', value: excelOnly },
    { key: 'envios_sucesso', label: 'Envios com sucesso', value: excelOnly },
    { key: 'envios_falha', label: 'Envios com falha', value: excelOnly },
    { key: 'ultimo_envio', label: 'Último envio', value: excelOnly },
  ] },
];

const ALL_COLUMNS = COLUMN_GROUPS.flatMap((group) => group.columns);
const COLUMN_BY_KEY = Object.fromEntries(ALL_COLUMNS.map((column) => [column.key, column]));
const PRESETS = [
  { id: 'cadastro', title: 'Cadastro completo', description: 'Identificação, contato, endereço e enquadramento.', icon: BuildingOfficeIcon, columns: ['nome', 'cnpj', 'ativo', 'email', 'telefone', 'endereco', 'numero', 'bairro', 'cidade', 'uf', 'cep', 'regime_tributario', 'porte_empresa', 'carteira_clientes', 'tags'] },
  { id: 'carteira', title: 'Carteira e responsáveis', description: 'Distribuição das empresas e equipe vinculada.', icon: UsersIcon, columns: ['nome', 'cnpj', 'ativo', 'carteira_clientes', 'usuarios', 'gerentes', 'regime_tributario', 'tags'] },
  { id: 'obrigacoes', title: 'Obrigações mensais', description: 'Matriz de obrigações e pendências por empresa.', icon: ClipboardDocumentCheckIcon, columns: ['nome', 'cnpj', 'carteira_clientes', 'inss', 'fgts', 'folha', 'honorario', 'simples_nacional', 'monitorar_simples', 'pendencias_obrigacoes'] },
  { id: 'socios', title: 'Sócios por empresa', description: 'Relação societária e dados fiscais principais.', icon: UserGroupIcon, columns: ['nome', 'cnpj', 'ativo', 'total_socios', 'socios_nomes', 'socios_cpfs', 'regime_tributario', 'carteira_clientes'] },
  { id: 'honorarios', title: 'Sócios e honorários', description: 'Sócios, valores, vencimento, juros, multa e desconto.', icon: BanknotesIcon, columns: ['nome', 'cnpj', 'ativo', 'socios_nomes', 'socios_cpfs', 'valor_honorario', 'dia_vencimento_honorario', 'juros_mora_taxa', 'multa_taxa', 'desconto_taxa', 'dias_para_desconto'] },
  { id: 'boletos', title: 'Resumo financeiro', description: 'Totais de boletos, pagamentos e inadimplência.', icon: BanknotesIcon, columns: ['nome', 'cnpj', 'carteira_clientes', 'total_boletos', 'boletos_abertos', 'boletos_vencidos', 'boletos_pagos', 'valor_total_boletos', 'valor_boletos_abertos', 'valor_boletos_pagos', 'vencimento_aberto_mais_antigo', 'ultimo_pagamento'] },
  { id: 'inadimplencia', title: 'Inadimplência', description: 'Boletos vencidos, valores em aberto e contato.', icon: BanknotesIcon, columns: ['nome', 'cnpj', 'telefone', 'carteira_clientes', 'boletos_abertos', 'boletos_vencidos', 'valor_boletos_abertos', 'vencimento_aberto_mais_antigo'] },
  { id: 'documentos', title: 'Documentos', description: 'Volume, entregues e documentos pendentes.', icon: FolderOpenIcon, columns: ['nome', 'cnpj', 'carteira_clientes', 'total_documentos', 'documentos_entregues', 'documentos_pendentes'] },
  { id: 'comunicacao', title: 'Histórico de envios', description: 'Totais de envios, sucessos, falhas e última comunicação.', icon: UsersIcon, columns: ['nome', 'cnpj', 'telefone', 'carteira_clientes', 'total_envios', 'envios_sucesso', 'envios_falha', 'ultimo_envio'] },
  { id: 'usuarios', title: 'Usuários e empresas', description: 'Equipe vinculada, responsáveis e tags por empresa.', icon: UsersIcon, columns: ['nome', 'cnpj', 'ativo', 'carteira_clientes', 'usuarios', 'gerentes', 'tags'] },
  { id: 'completo', title: 'Relatório completo', description: 'Todas as informações disponíveis em uma planilha.', icon: TableCellsIcon, columns: ALL_COLUMNS.map(({ key }) => key) },
];
const STATUS = [{ value: 'ativas', label: 'Somente ativas' }, { value: 'inativas', label: 'Somente inativas' }, { value: 'todas', label: 'Ativas e inativas' }];
const control = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-slate-700';

function Label({ children }) { return <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{children}</span>; }
function download(blob, filename) {
  const url = window.URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const initial = PRESETS.find((preset) => preset.id === 'obrigacoes');
  const [activePreset, setActivePreset] = useState(initial.id);
  const [selectedColumns, setSelectedColumns] = useState(initial.columns);
  const [companyStatus, setCompanyStatus] = useState('ativas');
  const [portfolio, setPortfolio] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [companies, setCompanies] = useState([]);
  const [billings, setBillings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([axiosInstance.get('/api/empresas/?full=true'), axiosInstance.get('/api/boletos-bb/')]).then(([companyResult, billingResult]) => {
      if (!mounted) return;
      if (companyResult.status === 'fulfilled') setCompanies(rows(companyResult.value.data));
      if (billingResult.status === 'fulfilled') setBillings(rows(billingResult.value.data));
      if (companyResult.status === 'rejected') setFeedback({ type: 'error', text: 'Não foi possível carregar a prévia das empresas.' });
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const portfolios = useMemo(() => [...new Set(companies.map((company) => company.carteira_clientes).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [companies]);
  const filtered = useMemo(() => companies.filter((company) => {
    if (companyStatus === 'ativas' && !company.ativo) return false;
    if (companyStatus === 'inativas' && company.ativo) return false;
    return !portfolio || company.carteira_clientes === portfolio;
  }), [companies, companyStatus, portfolio]);
  const visibleGroups = useMemo(() => {
    const term = columnSearch.trim().toLocaleLowerCase('pt-BR');
    return term ? COLUMN_GROUPS.map((group) => ({ ...group, columns: group.columns.filter((column) => column.label.toLocaleLowerCase('pt-BR').includes(term)) })).filter((group) => group.columns.length) : COLUMN_GROUPS;
  }, [columnSearch]);
  const definitions = selectedColumns.map((key) => COLUMN_BY_KEY[key]).filter(Boolean);
  const billsByCompany = useMemo(() => billings.reduce((index, bill) => {
    const companyId = Number(bill.empresa);
    if (!index[companyId]) index[companyId] = [];
    index[companyId].push(bill);
    return index;
  }, {}), [billings]);

  const applyPreset = (preset) => { setActivePreset(preset.id); setSelectedColumns([...preset.columns]); };
  const toggleColumn = (key) => setSelectedColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const selectGroup = (columns) => setSelectedColumns((current) => [...new Set([...current, ...columns.map((column) => column.key)])]);
  const handleExport = async () => {
    if (!selectedColumns.length) { setFeedback({ type: 'error', text: 'Selecione ao menos uma coluna para exportar.' }); return; }
    setExporting(true); setFeedback(null);
    try {
      const response = await axiosInstance.post('/api/relatorios/excel/', { report_type: 'personalizado', filters: { status_empresa: companyStatus, carteira: portfolio, columns: selectedColumns } }, { responseType: 'blob' });
      const filename = String(response.headers?.['content-disposition'] || '').match(/filename="?([^";]+)"?/i)?.[1] || 'relatorio_personalizado.xlsx';
      download(response.data, filename); setFeedback({ type: 'success', text: `Relatório gerado com ${selectedColumns.length} coluna(s).` });
    } catch (error) {
      let text = 'Não foi possível gerar o Excel. Tente novamente.';
      if (error?.response?.data instanceof Blob) { try { text = JSON.parse(await error.response.data.text()).error || text; } catch { /* resposta sem JSON */ } }
      setFeedback({ type: 'error', text });
    } finally { setExporting(false); }
  };

  return <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-full max-w-none space-y-4 px-0 py-2 text-slate-900 dark:text-slate-100">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Construtor de planilhas</p><h1 className="mt-1 font-serif text-3xl font-semibold text-slate-950 dark:text-white sm:text-4xl">Relatórios</h1><p className="mt-1 text-sm text-slate-500">Filtre as empresas e escolha exatamente as colunas do seu Excel.</p></div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="w-full sm:w-64"><Label>Modelo de colunas</Label><select aria-label="Modelo pronto" value={activePreset} onChange={(event) => applyPreset(PRESETS.find((preset) => preset.id === event.target.value))} className={control}>{PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.title}</option>)}</select></label>
        <button type="button" onClick={handleExport} disabled={exporting || !selectedColumns.length} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950"><ArrowDownTrayIcon className={`h-5 w-5 ${exporting ? 'animate-bounce' : ''}`} />{exporting ? 'Gerando Excel...' : 'Exportar relatório'}</button>
      </div>
    </header>
    {feedback && <div role="status" className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}><span>{feedback.text}</span><button type="button" onClick={() => setFeedback(null)} aria-label="Fechar aviso"><XMarkIcon className="h-4 w-4" /></button></div>}

    <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><h2 className="text-sm font-bold">Filtros</h2><p className="text-xs text-slate-500">Defina apenas quais empresas entram no relatório.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <label><Label>Carteira</Label><select aria-label="Carteira" value={portfolio} onChange={(event) => setPortfolio(event.target.value)} className={control}><option value="">Todas as carteiras</option>{portfolios.map((option) => <option key={option}>{option}</option>)}</select></label>
          <label><Label>Situação</Label><select aria-label="Situação" value={companyStatus} onChange={(event) => setCompanyStatus(event.target.value)} className={control}>{STATUS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">Colunas do relatório</h2><p className="text-xs text-slate-500">{selectedColumns.length} de {ALL_COLUMNS.length} selecionadas</p></div><button type="button" onClick={() => setSelectedColumns([])} className="text-[10px] font-bold underline">Limpar</button></div>
          <div className="relative mt-3"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input aria-label="Buscar colunas" value={columnSearch} onChange={(event) => setColumnSearch(event.target.value)} placeholder="Buscar uma coluna" className={`${control} pl-9`} /></div>
          <div className="mt-3 max-h-[590px] space-y-2 overflow-y-auto pr-1">{visibleGroups.map((group) => <details key={group.id} open className="group rounded-lg border border-slate-200 dark:border-slate-700"><summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2"><span className="text-xs font-bold">{group.label}</span><span className="flex items-center gap-2"><button type="button" onClick={(event) => { event.preventDefault(); selectGroup(group.columns); }} className="text-[9px] font-bold uppercase text-slate-500">Marcar grupo</button><ChevronDownIcon className="h-3.5 w-3.5 transition group-open:rotate-180" /></span></summary><div className="border-t border-slate-100 p-1.5 dark:border-slate-800">{group.columns.map((column) => <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"><input type="checkbox" checked={selectedColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} className="rounded border-slate-300 text-slate-900" />{column.label}</label>)}</div></details>)}</div>
        </section>
      </aside>

      <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label="Prévia do relatório">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"><DocumentChartBarIcon className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Prévia personalizada</p><h2 className="text-lg font-bold">{PRESETS.find((preset) => preset.id === activePreset)?.title}</h2></div></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{filtered.length} empresa(s)</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{selectedColumns.length} coluna(s)</span></div></div>
        {loading ? <div className="mt-4 space-y-2" aria-label="Carregando prévia">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />)}</div> : !definitions.length ? <div className="mt-4 grid min-h-[380px] place-items-center rounded-lg border border-dashed border-slate-300 p-8 text-center"><div><AdjustmentsHorizontalIcon className="mx-auto h-10 w-10 text-slate-400" /><h3 className="mt-3 font-bold">Escolha as colunas do relatório</h3><p className="mt-1 text-sm text-slate-500">Selecione manualmente ao lado ou aplique um modelo pronto.</p></div></div> : <div data-testid="report-preview-scroll" className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800"><table className="w-full min-w-max border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-[0.08em] text-slate-500 shadow-sm dark:bg-slate-800"><tr>{definitions.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-3">{column.label}</th>)}</tr></thead><tbody>{filtered.length ? filtered.map((company) => <tr key={company.id} className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">{definitions.map((column) => <td key={column.key} className={`max-w-[320px] whitespace-nowrap px-3 py-2.5 ${column.key === 'nome' ? 'font-semibold' : 'text-slate-600 dark:text-slate-300'}`}>{column.value(company, billsByCompany[Number(company.id)] || [])}</td>)}</tr>) : <tr><td colSpan={definitions.length} className="px-4 py-14 text-center text-sm text-slate-500">Nenhuma empresa encontrada com os filtros atuais.</td></tr>}</tbody></table></div>}
        <footer className="mt-4 flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-950/50 sm:flex-row sm:justify-between"><span className="inline-flex items-center gap-1.5"><CheckCircleIcon className="h-4 w-4 text-emerald-600" />A prévia e o Excel respeitam carteira e situação.</span><span className="inline-flex items-center gap-1.5"><AdjustmentsHorizontalIcon className="h-4 w-4" />“No Excel” indica dados calculados no servidor.</span></footer>
      </section>
    </div>
  </motion.main>;
}
