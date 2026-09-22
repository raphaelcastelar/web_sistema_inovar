import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowPathIcon, CalendarDaysIcon, CheckCircleIcon, ChevronDownIcon,
  ChevronRightIcon, ClockIcon, FunnelIcon, LockClosedIcon,
  MagnifyingGlassIcon, PlusIcon, UserGroupIcon, UserPlusIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { ActivityForm, Details, isAdmin } from './InicioOverview';
import './InicioOverview.css';
import './TarefasPage.css';
import './OperationalScale.css';
import './OperationalLoading.css';

const STATES = [
  ['a_fazer', 'A fazer'], ['em_andamento', 'Em andamento'],
  ['aguardando_terceiros', 'Aguardando terceiros'], ['concluida', 'Concluída'],
  ['cancelada', 'Cancelada'],
];
const PRIORITIES = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const PRIORITY_ORDER = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const EMPTY_FILTERS = { responsavelId: '', empresaId: '', tipo: '', estado: '', inicio: '', fim: '' };
const EMPTY_CONTEXT = { usuario: { id: null, nome: '', papel: '', acesso: '' }, usuarios: [], empresas: [] };
const dateKey = (date = new Date()) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
const formatDate = (value) => value ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const normalized = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const activityDate = (activity) => (activity.tipo === 'compromisso' ? activity.inicio : activity.dataPlanejada)?.slice(0, 10) || '';
const canUpdate = (activity, user) => Boolean(user && !activity.mascarada && (
  activity.responsavelId === user.id || (!activity.privada && isAdmin(user))
));
const moveActivityToDate = (activity, day) => {
  if (activity.tipo !== 'compromisso') return { dataPlanejada: day };
  const start = `${day}T${activity.inicio.slice(11, 16)}`;
  const duration = Date.parse(`${activity.termino.slice(0, 19)}Z`) - Date.parse(`${activity.inicio.slice(0, 19)}Z`);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('O compromisso precisa de um intervalo válido.');
  return { inicio: start, termino: new Date(Date.parse(`${start}Z`) + duration).toISOString().slice(0, 16) };
};

function QuickActions({ activity, context, onPatch }) {
  const [mode, setMode] = useState('');
  const [date, setDate] = useState(activityDate(activity));
  const [responsibleId, setResponsibleId] = useState(String(activity.responsavelId || ''));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const allowed = canUpdate(activity, context.usuario);
  const admin = isAdmin(context.usuario);

  if (!allowed) return <span className="tasks-actions__locked" title="Sem permissão para alterar"><LockClosedIcon /></span>;

  const apply = async (payload) => {
    setPending(true); setError('');
    try { await onPatch(activity.id, payload); setMode(''); }
    catch (requestError) { setError(requestError.message || 'Não foi possível atualizar.'); }
    finally { setPending(false); }
  };
  const reschedule = () => {
    try { apply(moveActivityToDate(activity, date)); }
    catch (requestError) { setError(requestError.message || 'Não foi possível reagendar.'); }
  };

  return <div className="tasks-actions">
    <div className="tasks-actions__buttons">
      <button className={activity.estado === 'concluida' ? 'is-done' : ''} disabled={pending} onClick={() => apply({ estado: activity.estado === 'concluida' ? 'a_fazer' : 'concluida' })} title={activity.estado === 'concluida' ? 'Reabrir' : 'Concluir'} aria-label={activity.estado === 'concluida' ? `Reabrir ${activity.titulo}` : `Concluir ${activity.titulo}`}><CheckCircleIcon /></button>
      <button className={mode === 'date' ? 'active' : ''} disabled={pending} onClick={() => setMode(mode === 'date' ? '' : 'date')} title="Reagendar" aria-label={`Reagendar ${activity.titulo}`}><CalendarDaysIcon /></button>
      {admin && <button className={mode === 'owner' ? 'active' : ''} disabled={pending} onClick={() => setMode(mode === 'owner' ? '' : 'owner')} title="Atribuir responsável" aria-label={`Atribuir responsável para ${activity.titulo}`}><UserPlusIcon /></button>}
    </div>
    {mode && <div className="tasks-actions__editor">
      {mode === 'date' ? <>
        <label>Nova data<input aria-label={`Nova data de ${activity.titulo}`} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <button disabled={!date || pending} onClick={reschedule}>Salvar</button>
      </> : <>
        <label>Novo responsável<select aria-label={`Novo responsável de ${activity.titulo}`} value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}><option value="">Selecione</option>{context.usuarios.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label>
        <button disabled={!responsibleId || pending} onClick={() => apply({ responsavelId: Number(responsibleId) })}>Atribuir</button>
      </>}
      <button className="cancel" aria-label="Cancelar ação" onClick={() => { setMode(''); setError(''); }}><XMarkIcon /></button>
      {error && <small>{error}</small>}
    </div>}
  </div>;
}

function TaskRow({ activity, context, today, onOpen, onPatch }) {
  const title = activity.mascarada ? 'Atividade privada' : activity.titulo || 'Atividade sem título';
  const company = context.empresas.find((item) => item.id === activity.empresaId);
  const planned = activityDate(activity);
  const due = activity.prazo?.slice(0, 10);
  const active = !['concluida', 'cancelada'].includes(activity.estado);
  const overdue = active && due && due < today;
  const dueToday = active && due === today;
  const time = activity.tipo === 'compromisso' && activity.inicio ? activity.inicio.slice(11, 16) : '';

  return <li className={`tasks-row ${activity.estado === 'concluida' ? 'is-complete' : ''} ${overdue ? 'is-overdue' : ''}`}>
    <i className={`tasks-priority tasks-priority--${activity.prioridade || 'normal'}`} />
    <button className="tasks-identity" onClick={() => onOpen(activity)}>
      <span><strong>{title}</strong>{activity.privada && <LockClosedIcon />}</span>
      <small>{activity.mascarada ? 'Detalhes privados' : company?.nome || activity.empresaNome || 'Atividade interna'}</small>
      <span className="tasks-tags"><em>{activity.tipo === 'compromisso' ? `Compromisso${time ? ` · ${time}` : ''}` : 'Tarefa'}</em>{!activity.mascarada && activity.frequencia && activity.frequencia !== 'nenhuma' && <em>↻ Recorrente</em>}{overdue && <em className="danger">Prazo vencido</em>}{dueToday && <em className="warning">Vence hoje</em>}</span>
    </button>
    <dl className="tasks-data">
      <div><dt>Responsável</dt><dd>{activity.responsavelNome || 'Sem responsável'}</dd></div>
      <div><dt>Planejada</dt><dd>{formatDate(planned)}</dd></div>
      <div><dt>Prazo</dt><dd className={overdue ? 'danger' : ''}>{activity.mascarada ? '—' : formatDate(activity.prazo)}</dd></div>
      <div><dt>Prioridade</dt><dd><span className={`tasks-priority-label is-${activity.prioridade || 'normal'}`}><i />{activity.mascarada ? '—' : PRIORITIES[activity.prioridade] || 'Normal'}</span></dd></div>
    </dl>
    <select aria-label={`Estado de ${title}`} value={activity.estado} disabled={!canUpdate(activity, context.usuario)} className={`tasks-state is-${activity.estado}`} onChange={(event) => onPatch(activity.id, { estado: event.target.value }).catch(() => {})}>
      {STATES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <QuickActions activity={activity} context={context} onPatch={onPatch} />
  </li>;
}

export default function TarefasPage() {
  const today = dateKey();
  const [context, setContext] = useState(null), [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [search, setSearch] = useState(''), [view, setView] = useState('todas'), [scope, setScope] = useState('equipe');
  const [filters, setFilters] = useState(EMPTY_FILTERS), [filtersOpen, setFiltersOpen] = useState(false), [collapsed, setCollapsed] = useState({});
  const [modal, setModal] = useState(null), [details, setDetails] = useState(null), [blocks, setBlocks] = useState([]), [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contextResponse, activitiesResponse] = await Promise.all([axiosInstance.get('/api/atividades/contexto/'), axiosInstance.get('/api/atividades/')]);
      setContext(contextResponse.data); setActivities(activitiesResponse.data);
    } catch (err) { setError(err.response?.data?.detail || 'Não foi possível carregar as tarefas.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const filteredBase = useMemo(() => {
    if (!context) return [];
    const admin = isAdmin(context.usuario);
    const ownerId = !admin || scope === 'minhas' ? context.usuario.id : filters.responsavelId ? Number(filters.responsavelId) : null;
    const companyId = filters.empresaId ? Number(filters.empresaId) : null;
    const term = normalized(search.trim());
    return activities.filter((activity) => {
      const date = activityDate(activity);
      const text = activity.mascarada ? 'atividade privada' : `${activity.titulo || ''} ${activity.empresaNome || ''} ${activity.responsavelNome || ''}`;
      return (!ownerId || activity.responsavelId === ownerId)
        && (!companyId || activity.empresaId === companyId)
        && (!filters.tipo || activity.tipo === filters.tipo)
        && (!filters.estado || activity.estado === filters.estado)
        && (!filters.inicio || date >= filters.inicio) && (!filters.fim || date <= filters.fim)
        && (!term || normalized(text).includes(term));
    }).sort((left, right) => (PRIORITY_ORDER[left.prioridade] ?? 3) - (PRIORITY_ORDER[right.prioridade] ?? 3) || activityDate(left).localeCompare(activityDate(right)) || String(left.titulo).localeCompare(String(right.titulo)));
  }, [activities, context, filters, scope, search]);
  const byView = useCallback((items, selectedView) => {
    const limit = new Date(`${today}T12:00:00`); limit.setDate(limit.getDate() + 7); const end = dateKey(limit);
    return items.filter((activity) => {
      const closed = ['concluida', 'cancelada'].includes(activity.estado), planned = activityDate(activity), due = activity.prazo?.slice(0, 10), dates = [planned, due].filter(Boolean);
      if (selectedView === 'atrasadas') return !closed && due && due < today;
      if (selectedView === 'hoje') return !closed && dates.includes(today);
      if (selectedView === 'proximas') return !closed && dates.some((date) => date > today && date <= end);
      return true;
    });
  }, [today]);
  const visible = useMemo(() => byView(filteredBase, view), [byView, filteredBase, view]);
  const shortcuts = [['todas', 'Todas'], ['atrasadas', 'Atrasadas'], ['hoje', 'Hoje'], ['proximas', 'Próximos 7 dias']];
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const pageContext = context || EMPTY_CONTEXT;
  const admin = isAdmin(pageContext.usuario);

  const patchActivity = async (id, payload) => {
    const previous = activities;
    setActivities((current) => current.map((item) => item.id === id ? { ...item, ...payload } : item)); setError('');
    try {
      const { data } = await axiosInstance.patch(`/api/atividades/${id}/`, payload);
      setActivities((current) => current.map((item) => item.id === id ? data : item));
      return data;
    } catch (err) {
      setActivities(previous);
      const message = err.response?.data?.detail || 'Não foi possível atualizar a atividade.';
      setError(message);
      throw new Error(message);
    }
  };
  const openEdit = async (activity) => { setDetails(null); setBlocks([]); try { setBlocks((await axiosInstance.get(`/api/atividades/${activity.id}/blocos/`)).data); } catch {} setModal({ activity }); };
  const saveActivity = async (payload) => { setSaving(true); try { if (modal.activity) await axiosInstance.patch(`/api/atividades/${modal.activity.id}/`, payload); else await axiosInstance.post('/api/atividades/', payload); setActivities((await axiosInstance.get('/api/atividades/')).data); setModal(null); } finally { setSaving(false); } };
  const createBlock = async (payload) => { const { data } = await axiosInstance.post(`/api/atividades/${modal.activity.id}/blocos/`, payload); setBlocks((current) => [...current, data]); };
  const updateBlock = async (id, payload) => { const { data } = await axiosInstance.patch(`/api/blocos-execucao/${id}/`, payload); setBlocks((current) => current.map((item) => item.id === id ? data : item)); };
  const deleteBlock = async (id) => { await axiosInstance.delete(`/api/blocos-execucao/${id}/`); setBlocks((current) => current.filter((item) => item.id !== id)); };

  return <div className={`tasks-page ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
    <header className="tasks-hero"><div><span><CheckCircleIcon /></span><div><p>{admin ? 'Visão da equipe' : 'Sua rotina'}</p><h1>Tarefas</h1><small>Organize tarefas e compromissos em um só lugar.</small></div></div><button disabled={!context || loading} onClick={() => setModal({ initial: { tipo: 'tarefa', dataPlanejada: today } })}><PlusIcon /> Nova atividade</button></header>
    {(loading || admin) && <div className={`tasks-scope ${loading ? 'is-skeleton' : ''}`}><button disabled={loading} className={scope === 'minhas' ? 'active' : ''} onClick={() => { setScope('minhas'); setFilters((current) => ({ ...current, responsavelId: '' })); }}>Minhas tarefas</button><button disabled={loading} className={scope === 'equipe' ? 'active' : ''} onClick={() => setScope('equipe')}><UserGroupIcon /> Toda a equipe</button></div>}
    <section className="tasks-shortcuts">{shortcuts.map(([key, label]) => <button key={key} className={`${view === key ? 'active' : ''} is-${key}`} onClick={() => setView(key)}><span>{label}</span>{loading ? <strong className="tasks-skeleton-number" aria-hidden="true" /> : <strong>{byView(filteredBase, key).length}</strong>}<small>{key === 'todas' ? 'No período filtrado' : key === 'atrasadas' ? 'Precisam de atenção' : key === 'hoje' ? 'Planejadas ou vencendo' : 'Planejadas ou com prazo'}</small></button>)}</section>
    <section className="tasks-toolbar"><label><MagnifyingGlassIcon /><input type="search" aria-label="Buscar tarefas" placeholder="Buscar por título, empresa ou responsável..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className={filtersOpen ? 'active' : ''} onClick={() => setFiltersOpen(!filtersOpen)}><FunnelIcon /> Filtros {activeFilters > 0 && <b>{activeFilters}</b>}</button><button className="refresh" onClick={load} aria-label="Atualizar"><ArrowPathIcon /></button></section>
    {filtersOpen && <section className="tasks-filters"><label>Responsável<select value={filters.responsavelId} disabled={!admin || scope === 'minhas'} onChange={(event) => setFilters({ ...filters, responsavelId: event.target.value })}><option value="">Todos</option>{pageContext.usuarios.map((user) => <option key={user.id} value={user.id}>{user.nome}</option>)}</select></label><label>Empresa<select value={filters.empresaId} onChange={(event) => setFilters({ ...filters, empresaId: event.target.value })}><option value="">Todas</option>{pageContext.empresas.map((company) => <option key={company.id} value={company.id}>{company.nome}</option>)}</select></label><label>Tipo<select value={filters.tipo} onChange={(event) => setFilters({ ...filters, tipo: event.target.value })}><option value="">Todos</option><option value="tarefa">Tarefas</option><option value="compromisso">Compromissos</option></select></label><label>Estado<select value={filters.estado} onChange={(event) => setFilters({ ...filters, estado: event.target.value })}><option value="">Todos</option>{STATES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>De<input type="date" value={filters.inicio} onChange={(event) => setFilters({ ...filters, inicio: event.target.value })} /></label><label>Até<input type="date" value={filters.fim} onChange={(event) => setFilters({ ...filters, fim: event.target.value })} /></label>{activeFilters > 0 && <button onClick={() => setFilters(EMPTY_FILTERS)}><XMarkIcon /> Limpar</button>}</section>}
    {error && <div className="tasks-alert">{error}<button onClick={context ? () => setError('') : load} aria-label={context ? 'Fechar aviso' : 'Tentar novamente'}>{context ? <XMarkIcon /> : 'Tentar novamente'}</button></div>}
    <p className="tasks-context"><ClockIcon /> {loading ? 'Atualizando atividades' : `${visible.length} ${visible.length === 1 ? 'atividade encontrada' : 'atividades encontradas'}`} · Hoje e próximos dias consideram a data planejada ou o prazo.</p>
    <main className="tasks-groups">{STATES.map(([state, label], stateIndex) => { const items = visible.filter((activity) => activity.estado === state); const closed = collapsed[state]; return <section className="tasks-group" key={state}><button className="tasks-group__header" onClick={() => setCollapsed((current) => ({ ...current, [state]: !current[state] }))}><span className={`state-dot is-${state}`} /><strong>{label}</strong>{loading ? <b className="tasks-skeleton-count" aria-hidden="true" /> : <b>{items.length}</b>}{closed ? <ChevronRightIcon /> : <ChevronDownIcon />}</button>{!closed && <div className="tasks-group__body">{loading ? <div className="tasks-skeleton-list" aria-hidden="true">{Array.from({ length: stateIndex < 2 ? 2 : 1 }, (_, index) => <span key={index}><i /><span><b /><small /></span><em /><em /></span>)}</div> : items.length ? <ul>{items.map((activity) => <TaskRow key={activity.id} activity={activity} context={context} today={today} onOpen={setDetails} onPatch={patchActivity} />)}</ul> : <p>Nenhuma atividade neste estado.</p>}</div>}</section>; })}</main>
    {modal && context && <ActivityForm activity={modal.activity} initial={modal.initial} context={context} saving={saving} blocks={blocks} onClose={() => setModal(null)} onSave={saveActivity} onCreateBlock={createBlock} onUpdateBlock={updateBlock} onDeleteBlock={deleteBlock} />}
    {details && context && <Details activity={details} context={context} canEdit={canUpdate(details, context.usuario)} onClose={() => setDetails(null)} onEdit={() => openEdit(details)} />}
  </div>;
}
