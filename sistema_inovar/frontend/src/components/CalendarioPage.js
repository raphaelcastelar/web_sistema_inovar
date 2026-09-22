import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  Bars3BottomLeftIcon,
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  Squares2X2Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';
import { ActivityForm, Details, isAdmin } from './InicioOverview';
import './InicioOverview.css';
import './CalendarioPage.css';
import './OperationalScale.css';

const STATES = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando_terceiros: 'Aguardando terceiros',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};
const PRIORITIES = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' };
const PRIORITY_ORDER = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TIME_SLOT_HEIGHT = 72;
const VIEWS = [
  ['month', 'Mês', CalendarDaysIcon],
  ['week', 'Semana', Squares2X2Icon],
  ['day', 'Dia', ClockIcon],
  ['list', 'Lista', Bars3BottomLeftIcon],
];
const EMPTY_FILTERS = { tipo: '', prioridade: '', estado: '' };

const dateKey = (date = new Date()) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');
const dateObject = (value) => new Date(`${value}T12:00:00`);
const activityTitle = (activity) => activity.mascarada ? 'Atividade privada' : activity.titulo || 'Sem título';
const activityTime = (activity) => activity.tipo === 'compromisso'
  ? `${activity.inicio?.slice(11, 16) || '--:--'}–${activity.termino?.slice(11, 16) || '--:--'}`
  : 'Dia inteiro';
const activityColor = (activity) => {
  if (activity.mascarada || ['a_fazer', 'cancelada'].includes(activity.estado)) return 'slate';
  if (activity.estado === 'concluida') return 'green';
  if (activity.estado === 'aguardando_terceiros') return 'amber';
  return 'blue';
};
const activityOnDay = (activity, day) => {
  if (activity.tipo !== 'compromisso') return activity.dataPlanejada?.slice(0, 10) === day;
  const start = activity.inicio?.slice(0, 10);
  const end = (activity.termino || activity.inicio)?.slice(0, 10);
  if (!start) return false;
  if (end === day && start < day && activity.termino?.slice(11, 16) === '00:00') return false;
  return start <= day && end >= day;
};
const sortActivities = (left, right) => {
  if (left.tipo === 'compromisso' && right.tipo === 'compromisso') return String(left.inicio).localeCompare(String(right.inicio));
  if (left.tipo !== right.tipo) return left.tipo === 'compromisso' ? -1 : 1;
  return (PRIORITY_ORDER[left.prioridade] ?? 3) - (PRIORITY_ORDER[right.prioridade] ?? 3)
    || String(left.titulo).localeCompare(String(right.titulo));
};
const weekDays = (day) => {
  const reference = dateObject(day);
  return Array.from({ length: 7 }, (_, index) => dateKey(new Date(
    reference.getFullYear(), reference.getMonth(), reference.getDate() - reference.getDay() + index,
  )));
};
const monthWeeks = (year, month, activities) => {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const day = dateKey(date);
    return {
      day,
      outside: date.getMonth() !== month,
      activities: activities.filter((activity) => activityOnDay(activity, day)).sort(sortActivities),
    };
  });
  return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
};
const moveActivity = (activity, day, hour) => {
  if (activity.tipo !== 'compromisso') return { dataPlanejada: day };
  const time = hour === undefined ? activity.inicio.slice(11, 16) : `${String(hour).padStart(2, '0')}:00`;
  const start = `${day}T${time}`;
  const duration = Date.parse(`${activity.termino.slice(0, 19)}Z`) - Date.parse(`${activity.inicio.slice(0, 19)}Z`);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('O compromisso precisa de um intervalo válido.');
  return { inicio: start, termino: new Date(Date.parse(`${start}Z`) + duration).toISOString().slice(0, 16) };
};
const canMove = (activity, user) => Boolean(user && !activity.mascarada && (
  activity.responsavelId === user.id || (!activity.privada && isAdmin(user))
));

function organizeTimedActivities(activities, day) {
  const events = activities.filter((activity) => activity.tipo === 'compromisso' && activityOnDay(activity, day)).map((activity) => {
    const start = activity.inicio.slice(0, 10) < day ? 0 : Number(activity.inicio.slice(11, 13)) * 60 + Number(activity.inicio.slice(14, 16));
    const end = activity.termino.slice(0, 10) > day ? 1440 : Number(activity.termino.slice(11, 13)) * 60 + Number(activity.termino.slice(14, 16));
    return { activity, start, end, minutes: Math.max(0, end - start) };
  }).filter((event) => event.minutes > 0).sort((a, b) => a.start - b.start || b.end - a.end);
  let group = [], ends = [], groupEnd = -1;
  const finishGroup = () => { group.forEach((event) => { event.columns = ends.length; }); group = []; ends = []; };
  events.forEach((event) => {
    if (event.start >= groupEnd) finishGroup();
    const visualEnd = Math.max(event.end, event.start + 30);
    let column = ends.findIndex((end) => end <= event.start);
    if (column < 0) column = ends.length;
    ends[column] = visualEnd;
    event.column = column;
    group.push(event);
    groupEnd = Math.max(...ends);
  });
  finishGroup();
  return events;
}

function EventCard({ activity, compact = false, draggable = false, style, onOpen, onDragStart, onDragEnd }) {
  return <button
    type="button"
    className={`cal-event cal-event--${activityColor(activity)} ${compact ? 'cal-event--compact' : ''}`}
    style={style}
    draggable={draggable}
    onDragStart={(event) => onDragStart?.(event, activity)}
    onDragEnd={onDragEnd}
    onClick={(event) => { event.stopPropagation(); onOpen(activity); }}
    title={`${activityTitle(activity)} · ${activityTime(activity)}`}
  >
    <span><i /> <strong>{activityTitle(activity)}</strong></span>
    {!compact && <small>{activityTime(activity)} · {activity.mascarada ? 'Detalhes privados' : STATES[activity.estado] || 'A fazer'}{activity.privada ? ' · Privada' : ''}</small>}
  </button>;
}

function MonthView({ weeks, month, today, selected, user, onSelect, onOpen, onDragStart, onDragEnd, onDrop }) {
  return <div className="cal-month" role="grid" aria-label={`Dias de ${month + 1}`}>
    <div className="cal-weekdays" role="row">{WEEKDAYS.map((name) => <span key={name}>{name}</span>)}</div>
    {weeks.map((week) => <div className="cal-week" role="row" key={week[0].day}>
      {week.map((item) => <div
        key={item.day}
        role="gridcell"
        className={`cal-day ${item.outside ? 'outside' : ''} ${item.day === selected ? 'selected' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => { event.preventDefault(); onDrop(item.day); }}
      >
        <button className={item.day === today ? 'today' : ''} onClick={() => onSelect(item.day)} aria-label={new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dateObject(item.day))}>{Number(item.day.slice(8))}</button>
        <div>{item.activities.slice(0, 3).map((activity) => <EventCard key={activity.id} activity={activity} compact draggable={canMove(activity, user)} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}
          {item.activities.length > 3 && <button className="cal-more" onClick={() => onSelect(item.day)}>+{item.activities.length - 3} atividades</button>}
        </div>
      </div>)}
    </div>)}
  </div>;
}

function TimeGrid({ days, today, activities, user, onOpen, onCreate, onDragStart, onDragEnd, onDrop }) {
  const scrollRef = useRef(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 7 * 56; }, [days]);
  return <div className="cal-time-scroll" ref={scrollRef} role="region" aria-label="Agenda por horários">
    <div className="cal-time" style={{ '--day-count': days.length, minWidth: days.length > 1 ? 780 : undefined }}>
      <div className="cal-time__header"><span>Horário</span>{days.map((day) => <div className={day === today ? 'is-today' : ''} key={day}><small>{new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(dateObject(day))}</small><strong>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(dateObject(day))}</strong></div>)}</div>
      <div className="cal-all-day"><span>Dia inteiro</span>{days.map((day) => <div key={day} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(day); }}>{activities.filter((activity) => activity.tipo !== 'compromisso' && activityOnDay(activity, day)).map((activity) => <EventCard key={activity.id} activity={activity} compact draggable={canMove(activity, user)} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} />)}</div>)}</div>
      <div className="cal-time__body"><div className="cal-hours">{Array.from({ length: 24 }, (_, hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}</div>{days.map((day) => <div className="cal-time__column" key={day}>{Array.from({ length: 24 }, (_, hour) => <button key={hour} aria-label={`Criar compromisso às ${hour}:00`} onClick={() => onCreate(day, hour)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(day, hour); }} />)}{organizeTimedActivities(activities, day).map(({ activity, start, minutes, column, columns }) => <EventCard key={activity.id} activity={activity} compact={minutes < 60} draggable={canMove(activity, user)} onOpen={onOpen} onDragStart={onDragStart} onDragEnd={onDragEnd} style={{ position: 'absolute', top: start / 60 * TIME_SLOT_HEIGHT + 2, height: Math.min(Math.max(38, minutes / 60 * TIME_SLOT_HEIGHT - 4), 24 * TIME_SLOT_HEIGHT - start / 60 * TIME_SLOT_HEIGHT - 2), left: `calc(${column / columns * 100}% + 3px)`, width: `calc(${100 / columns}% - 6px)` }} />)}</div>)}</div>
    </div>
  </div>;
}

function DayPanel({ day, activities, onOpen }) {
  return <aside className="cal-day-panel"><header><span>Agenda do dia</span><h3>{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dateObject(day))}</h3><p>{activities.length} {activities.length === 1 ? 'atividade' : 'atividades'}</p></header>{activities.length ? <div>{activities.sort(sortActivities).map((activity) => <button key={activity.id} onClick={() => onOpen(activity)}><i className={`color-${activityColor(activity)}`} /><span><strong>{activityTitle(activity)}</strong><small>{activityTime(activity)} · {activity.mascarada ? 'Detalhes privados' : STATES[activity.estado]}</small></span></button>)}</div> : <p className="cal-empty">Nenhuma tarefa ou compromisso neste dia.</p>}</aside>;
}

export default function CalendarioPage() {
  const today = dateKey();
  const [context, setContext] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentDate, setCurrentDate] = useState(today);
  const [view, setView] = useState('month');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [modal, setModal] = useState(null);
  const [details, setDetails] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const draggedId = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [contextResponse, activitiesResponse] = await Promise.all([
        axiosInstance.get('/api/atividades/contexto/'), axiosInstance.get('/api/atividades/'),
      ]);
      setContext(contextResponse.data); setActivities(activitiesResponse.data);
    } catch (requestError) { setError(requestError.response?.data?.detail || 'Não foi possível carregar o calendário.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reference = dateObject(currentDate);
  const year = reference.getFullYear(), month = reference.getMonth();
  const daysOfWeek = weekDays(currentDate);
  const filtered = useMemo(() => activities.filter((activity) => {
    const text = activity.mascarada ? 'atividade privada' : `${activity.titulo || ''} ${activity.descricao || ''} ${activity.empresaNome || ''}`.toLocaleLowerCase('pt-BR');
    return text.includes(search.trim().toLocaleLowerCase('pt-BR'))
      && (!filters.tipo || activity.tipo === filters.tipo)
      && (!filters.prioridade || (!activity.mascarada && activity.prioridade === filters.prioridade))
      && (!filters.estado || (!activity.mascarada && activity.estado === filters.estado));
  }), [activities, filters, search]);
  const weeks = useMemo(() => monthWeeks(year, month, filtered), [year, month, filtered]);
  const selectedActivities = filtered.filter((activity) => activityOnDay(activity, currentDate));
  const periodDays = view === 'day' ? [currentDate] : view === 'week' ? daysOfWeek : weeks.flat().filter((item) => !item.outside).map((item) => item.day);
  const periodCount = filtered.filter((activity) => periodDays.some((day) => activityOnDay(activity, day))).length;
  const groups = useMemo(() => {
    const dates = [...new Set(filtered.map((activity) => activity.tipo === 'compromisso' ? activity.inicio?.slice(0, 10) : activity.dataPlanejada).filter(Boolean))].sort();
    const result = dates.map((day) => ({ day, activities: filtered.filter((activity) => (activity.tipo === 'compromisso' ? activity.inicio?.slice(0, 10) : activity.dataPlanejada) === day).sort(sortActivities) }));
    const undated = filtered.filter((activity) => activity.tipo !== 'compromisso' && !activity.dataPlanejada);
    if (undated.length) result.push({ day: '', activities: undated });
    return result;
  }, [filtered]);
  const activeFilters = Object.values(filters).filter(Boolean).length;

  const title = view === 'list' ? 'Todas as atividades' : view === 'week'
    ? `${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dateObject(daysOfWeek[0]))} – ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(dateObject(daysOfWeek[6]))}`
    : view === 'day' ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(reference)
      : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(reference);
  const navigate = (direction) => {
    if (view === 'month') setCurrentDate(dateKey(new Date(year, month + direction, 1)));
    else setCurrentDate(dateKey(new Date(year, month, reference.getDate() + direction * (view === 'week' ? 7 : 1))));
  };
  const openEdit = async (activity) => {
    setDetails(null); setBlocks([]);
    try { setBlocks((await axiosInstance.get(`/api/atividades/${activity.id}/blocos/`)).data); } catch {}
    setModal({ activity });
  };
  const saveActivity = async (payload) => {
    setSaving(true);
    try {
      if (modal.activity) await axiosInstance.patch(`/api/atividades/${modal.activity.id}/`, payload);
      else await axiosInstance.post('/api/atividades/', payload);
      setActivities((await axiosInstance.get('/api/atividades/')).data); setModal(null);
    } finally { setSaving(false); }
  };
  const createBlock = async (payload) => { const { data } = await axiosInstance.post(`/api/atividades/${modal.activity.id}/blocos/`, payload); setBlocks((current) => [...current, data]); };
  const updateBlock = async (id, payload) => { const { data } = await axiosInstance.patch(`/api/blocos-execucao/${id}/`, payload); setBlocks((current) => current.map((item) => item.id === id ? data : item)); };
  const deleteBlock = async (id) => { await axiosInstance.delete(`/api/blocos-execucao/${id}/`); setBlocks((current) => current.filter((item) => item.id !== id)); };
  const startDrag = (event, activity) => { draggedId.current = activity.id; event.dataTransfer.setData('text/plain', String(activity.id)); event.dataTransfer.effectAllowed = 'move'; };
  const drop = async (day, hour) => {
    const activity = activities.find((item) => item.id === draggedId.current); draggedId.current = null;
    if (!activity || !canMove(activity, context.usuario)) return;
    setMoving(true); setError('');
    try {
      const { data } = await axiosInstance.patch(`/api/atividades/${activity.id}/`, moveActivity(activity, day, hour));
      setActivities((current) => current.map((item) => item.id === data.id ? data : item));
    } catch (requestError) { setError(requestError.response?.data?.detail || 'Não foi possível mover a atividade.'); }
    finally { setMoving(false); }
  };

  if (loading) return <div className="cal-state"><ArrowPathIcon className="animate-spin" /><strong>Carregando calendário...</strong></div>;
  if (!context) return <div className="cal-state error"><strong>{error}</strong><button onClick={load}>Tentar novamente</button></div>;

  return <div className="cal-page">
    <header className="cal-hero"><div><span><CalendarDaysIcon /></span><div><p>Planejamento operacional</p><h1>Calendário</h1><small>Organize tarefas, compromissos e o tempo entre eles.</small></div></div><button onClick={() => setModal({ initial: { tipo: 'tarefa', dataPlanejada: currentDate } })}><PlusIcon /> Nova atividade</button></header>
    <section className="cal-toolbar"><div className="cal-period"><div><span>Período</span><h2>{title}</h2></div>{view !== 'list' && <nav><button aria-label="Anterior" onClick={() => navigate(-1)}><ChevronLeftIcon /></button><button onClick={() => setCurrentDate(today)}>Hoje</button><button aria-label="Próximo" onClick={() => navigate(1)}><ChevronRightIcon /></button></nav>}</div><div className="cal-views">{VIEWS.map(([key, label, Icon]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}><Icon /> {label}</button>)}</div></section>
    <section className="cal-filters"><label><MagnifyingGlassIcon /><input type="search" aria-label="Buscar atividades" placeholder="Buscar por atividade ou empresa..." value={search} onChange={(event) => setSearch(event.target.value)} /></label><details><summary><FunnelIcon /> Filtros {activeFilters > 0 && <b>{activeFilters}</b>}</summary><div><label>Tipo<select value={filters.tipo} onChange={(event) => setFilters({ ...filters, tipo: event.target.value })}><option value="">Todos</option><option value="tarefa">Tarefa</option><option value="compromisso">Compromisso</option></select></label><label>Prioridade<select value={filters.prioridade} onChange={(event) => setFilters({ ...filters, prioridade: event.target.value })}><option value="">Todas</option>{Object.entries(PRIORITIES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label>Status<select value={filters.estado} onChange={(event) => setFilters({ ...filters, estado: event.target.value })}><option value="">Todos</option>{Object.entries(STATES).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label></div></details>{(search || activeFilters > 0) && <button className="cal-clear" onClick={() => { setSearch(''); setFilters(EMPTY_FILTERS); }}><XMarkIcon /> Limpar</button>}<button className="cal-refresh" onClick={load} aria-label="Atualizar"><ArrowPathIcon /></button></section>
    <div className="cal-legend"><span><i className="slate" />A fazer / canceladas</span><span><i className="blue" />Em andamento</span><span><i className="amber" />Aguardando terceiros</span><span><i className="green" />Concluídas</span><b>{view === 'list' ? filtered.length : periodCount} atividades{view !== 'list' ? ' no período' : ''}</b></div>
    {error && <div className="cal-alert">{error}<button onClick={() => setError('')}><XMarkIcon /></button></div>}{moving && <div className="cal-saving"><ArrowPathIcon className="animate-spin" /> Salvando nova data...</div>}
    {view === 'month' && <div className="cal-month-layout"><section className="cal-board"><MonthView weeks={weeks} month={month} today={today} selected={currentDate} user={context.usuario} onSelect={setCurrentDate} onOpen={setDetails} onDragStart={startDrag} onDragEnd={() => { draggedId.current = null; }} onDrop={drop} /></section><DayPanel day={currentDate} activities={selectedActivities} onOpen={setDetails} /></div>}
    {(view === 'week' || view === 'day') && <section className="cal-board"><TimeGrid days={view === 'week' ? daysOfWeek : [currentDate]} today={today} activities={filtered} user={context.usuario} onOpen={setDetails} onCreate={(day, hour) => { const start = `${day}T${String(hour).padStart(2, '0')}:00`; const end = new Date(Date.parse(`${start}Z`) + 3600000).toISOString().slice(0, 16); setModal({ initial: { tipo: 'compromisso', inicio: start, termino: end } }); }} onDragStart={startDrag} onDragEnd={() => { draggedId.current = null; }} onDrop={drop} /></section>}
    {view === 'list' && <section className="cal-board cal-list">{groups.length ? groups.map((group) => <article key={group.day || 'undated'}><header><div><span>{group.day ? new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(dateObject(group.day)) : 'Planejamento'}</span><h3>{group.day ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(dateObject(group.day)) : 'Sem data planejada'}</h3></div><b>{group.activities.length}</b></header><div>{group.activities.map((activity) => <EventCard key={activity.id} activity={activity} onOpen={setDetails} />)}</div></article>) : <p className="cal-empty">Nenhuma atividade encontrada. Ajuste a busca ou os filtros.</p>}</section>}
    <p className="cal-tip">Clique em uma atividade para ver os detalhes. Arraste os cartões que você pode editar para reorganizar a agenda.</p>
    {modal && <ActivityForm activity={modal.activity} initial={modal.initial} context={context} saving={saving} blocks={blocks} onClose={() => setModal(null)} onSave={saveActivity} onCreateBlock={createBlock} onUpdateBlock={updateBlock} onDeleteBlock={deleteBlock} />}
    {details && <Details activity={details} context={context} canEdit={details.responsavelId === context.usuario.id || (isAdmin(context.usuario) && !details.privada)} onClose={() => setDetails(null)} onEdit={() => openEdit(details)} />}
  </div>;
}
