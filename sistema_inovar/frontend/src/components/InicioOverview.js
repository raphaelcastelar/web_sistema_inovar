import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon, BuildingOffice2Icon, CalendarDaysIcon, CheckCircleIcon,
  ClipboardDocumentListIcon, ClockIcon, DocumentTextIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { getTaskDefinitions } from '../utils/carteiraEmpresas';
import './InicioOverview.css';

const formatDate = (date) => date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

function OverviewCard({ icon: Icon, title, value, detail, to, tone = 'blue', badge }) {
  const Card = to ? Link : 'div';
  return (
    <Card {...(to ? { to } : {})} className={`inicio-card inicio-card--${tone}`}>
      <span className="inicio-card__top"><span className="inicio-card__icon"><Icon /></span><span className="inicio-card__title">{title}</span>{badge && <span className="inicio-card__badge">{badge}</span>}</span>
      <strong>{value}</strong><span className="inicio-card__detail">{detail}</span>
      {to && <span className="inicio-card__link">Ver detalhes <ArrowRightIcon /></span>}
    </Card>
  );
}

export default function InicioOverview({ empresas, cargo, isSuperuser, userName, loading, canAccess, documents = [], documentsLoading = false, volumeChart, onCompleteTask, updatingTask }) {
  const [taskFilter, setTaskFilter] = useState('pending');
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tasks = useMemo(() => getTaskDefinitions(cargo, isSuperuser), [cargo, isSuperuser]);
  const allTasks = empresas.flatMap((empresa) => tasks.map((task) => {
    const due = new Date(today.getFullYear(), today.getMonth(), task.area === 'Fiscal' ? 25 : 15);
    return { id: `${empresa.id}-${task.key}`, empresa, task, due, done: Boolean(empresa[task.key]) };
  }));
  const pending = allTasks.filter((item) => !item.done);
  const done = allTasks.length - pending.length;
  const overdue = pending.filter((item) => item.due < today);
  const upcoming = pending.filter((item) => item.due >= today).sort((a, b) => a.due - b.due);
  const visibleTasks = (taskFilter === 'done' ? allTasks.filter((item) => item.done) : pending)
    .sort((a, b) => a.due - b.due || a.empresa.nome.localeCompare(b.empresa.nome)).slice(0, 6);
  const nearDue = upcoming.filter((item) => item.due - today <= 7 * 86400000);
  const deadlines = [...new Map(upcoming.map((item) => [item.task.key, item])).values()].sort((a, b) => a.due - b.due);
  const firstName = userName?.trim().split(/\s+/)[0] || 'você';
  const greeting = now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const dateLabel = today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="inicio-overview">
      <header className="inicio-hero">
        <div className="inicio-hero__intro"><span className="inicio-hero__mark"><ClipboardDocumentListIcon /></span><div><p className="inicio-eyebrow">Visão geral da operação</p><h1>{greeting}, {firstName}!</h1><p>Acompanhe as obrigações e os resultados do escritório em um só lugar.</p></div></div>
        <div className="inicio-hero__date"><CalendarDaysIcon /><span>{dateLabel}</span></div>
      </header>

      <div className="inicio-cards" aria-label="Resumo da operação">
        <OverviewCard icon={ClipboardDocumentListIcon} title="Pendências do mês" value={loading ? '—' : pending.length} detail="Obrigações ainda não concluídas" to={canAccess('pendencias') ? '/pendencias' : null} />
        <OverviewCard icon={CheckCircleIcon} title="Tarefas executadas" value={loading ? '—' : `${done} / ${allTasks.length}`} detail="Obrigações marcadas como concluídas" to={canAccess('carteira') ? '/carteira-empresas' : null} tone="green" badge={allTasks.length ? `${Math.round(done / allTasks.length * 100)}%` : '0%'} />
        <OverviewCard icon={CalendarDaysIcon} title="Próximos prazos" value={loading ? '—' : upcoming.length} detail="Pendências com prazo neste mês" to={canAccess('pendencias') ? '/pendencias' : null} />
        <OverviewCard icon={ExclamationTriangleIcon} title="Tarefas atrasadas" value={loading ? '—' : overdue.length} detail="Obrigações após o prazo mensal" to={canAccess('pendencias') ? '/pendencias' : null} tone="red" badge={overdue.length ? 'Atenção' : 'Em dia'} />
        <OverviewCard icon={BuildingOffice2Icon} title="Carteira" value={loading ? '—' : empresas.length} detail="Empresas ativas" to={canAccess('carteira') ? '/carteira-empresas' : null} />
      </div>

      <div className="inicio-main-grid">
        <section className="inicio-panel inicio-chart"><div className="inicio-panel__heading"><div><p className="inicio-eyebrow">Financeiro</p><h2>Volume de boletos</h2></div>{canAccess('boletos_empresa') && <Link to="/boletos-por-empresa">Ver boletos <ArrowRightIcon /></Link>}</div>{volumeChart}</section>
        <section className="inicio-panel inicio-attention"><div className="inicio-panel__heading"><h2>Pontos de atenção</h2><Link to="/pendencias">Ver todos <ArrowRightIcon /></Link></div><div className="inicio-attention__list">
          <Link to="/pendencias"><span className="inicio-attention__icon red"><ExclamationTriangleIcon /></span><span><strong>Obrigações vencidas</strong><small>Prazo mensal ultrapassado</small></span><b>{loading ? '—' : overdue.length}</b></Link>
          <Link to="/pendencias"><span className="inicio-attention__icon amber"><ClockIcon /></span><span><strong>Vencem nos próximos 7 dias</strong><small>Pendências próximas do prazo</small></span><b>{loading ? '—' : nearDue.length}</b></Link>
          <Link to="/carteira-empresas"><span className="inicio-attention__icon blue"><BuildingOffice2Icon /></span><span><strong>Empresas com pendências</strong><small>Obrigações a acompanhar</small></span><b>{loading ? '—' : new Set(pending.map((item) => item.empresa.id)).size}</b></Link>
        </div></section>
        <section className="inicio-panel inicio-deadlines"><div className="inicio-panel__heading"><h2>Próximos vencimentos</h2><Link to="/pendencias">Ver pendências <ArrowRightIcon /></Link></div>{deadlines.length ? <div className="inicio-deadlines__list">{deadlines.map((item) => <Link to="/pendencias" key={item.task.key}><span className="inicio-deadlines__date"><strong>{String(item.due.getDate()).padStart(2, '0')}</strong><small>{item.due.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}</small></span><span><strong>{item.task.label}</strong><small>{upcoming.filter((entry) => entry.task.key === item.task.key).length} empresa(s) pendente(s)</small></span><span className="inicio-deadlines__area">{item.task.area}</span></Link>)}</div> : <p className="inicio-empty">Nenhum vencimento pendente neste mês.</p>}</section>
      </div>

      <div className="inicio-bottom-grid">
        <section className="inicio-panel inicio-tasks"><div className="inicio-panel__heading"><div><h2>Obrigações da carteira <span className="inicio-count">{taskFilter === 'done' ? done : pending.length}</span></h2><p>Prazo mensal por empresa</p></div><select aria-label="Filtrar obrigações" value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)}><option value="pending">Pendentes</option><option value="done">Concluídas</option></select></div><div className="inicio-table-wrap"><table><thead><tr><th>Tarefa</th><th>Empresa</th><th>Prazo</th><th>Status</th><th>Ação</th></tr></thead><tbody>{visibleTasks.map((item) => <tr key={item.id}><td>{item.task.label}</td><td>{item.empresa.nome}</td><td>{formatDate(item.due)}</td><td><span className={`inicio-status ${item.done ? 'done' : item.due < today ? 'late' : 'pending'}`}>{item.done ? 'Concluída' : item.due < today ? 'Atrasada' : 'Pendente'}</span></td><td>{!item.done && <button type="button" className="inicio-complete" disabled={updatingTask === item.id} onClick={() => onCompleteTask(item)}>{updatingTask === item.id ? 'Salvando...' : 'Concluir'}</button>}</td></tr>)}</tbody></table>{!visibleTasks.length && <p className="inicio-empty">{loading ? 'Carregando obrigações...' : 'Nenhuma obrigação nesta situação.'}</p>}</div><Link className="inicio-panel__footer" to="/pendencias">Ver todas as obrigações <ArrowRightIcon /></Link></section>
        {canAccess('carteira') && <section className="inicio-panel inicio-documents"><div className="inicio-panel__heading"><h2>Últimos documentos</h2><Link to="/carteira-empresas">Ver pastas <ArrowRightIcon /></Link></div><div className="inicio-documents__list">{documents.map((doc) => <Link to={`/empresas/${doc.empresa}/pastas`} key={doc.id}><span className="inicio-documents__icon"><DocumentTextIcon /></span><span><strong title={doc.nome_arquivo}>{doc.nome_arquivo}</strong><small>{doc.empresa_nome || 'Empresa'} · {doc.criado_em ? new Date(doc.criado_em).toLocaleDateString('pt-BR') : 'Sem data'}</small></span><ArrowRightIcon /></Link>)}{!documents.length && <p className="inicio-empty">{documentsLoading ? 'Carregando documentos...' : 'Nenhum documento recente.'}</p>}</div></section>}
      </div>
    </div>
  );
}
