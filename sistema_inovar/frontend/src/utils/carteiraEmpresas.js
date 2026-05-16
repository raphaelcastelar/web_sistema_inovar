export const taskPalette = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300',
  pending: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
};

export function getTaskDefinitions(userCargo, isSuperuser) {
  const canPersonal = userCargo === 'pessoal' || userCargo === 'admin' || isSuperuser;
  const canFiscal = userCargo === 'fiscal' || userCargo === 'admin' || isSuperuser;
  const tasks = [];

  if (canPersonal) {
    tasks.push(
      { key: 'inss', label: 'INSS', area: 'Pessoal' },
      { key: 'fgts', label: 'FGTS', area: 'Pessoal' },
      { key: 'folha', label: 'Folha', area: 'Pessoal' },
      { key: 'honorario', label: 'Honorário', area: 'Financeiro' }
    );
  }

  if (canFiscal) {
    tasks.push({ key: 'simples_nacional', label: 'Simples', area: 'Fiscal' });
  }

  return tasks;
}

export function getDaysToDue(userCargo) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDay = userCargo === 'fiscal' ? 25 : 15;
  let targetDate = new Date(today.getFullYear(), today.getMonth(), targetDay);

  if (today.getDate() > targetDay) {
    targetDate = new Date(today.getFullYear(), today.getMonth() + 1, targetDay);
  }

  return Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
}

export function buildCompanyStatus(empresa, tasks, daysToDue) {
  const total = tasks.length;
  const done = tasks.filter((task) => Boolean(empresa[task.key])).length;
  const pending = Math.max(total - done, 0);
  const progress = total > 0 ? Math.round((done / total) * 100) : 100;

  if (!empresa.ativo) {
    return {
      done,
      pending,
      total,
      progress,
      tone: 'neutral',
      label: 'Inativa',
      priority: 4,
      description: 'Empresa inativa no cadastro',
    };
  }

  if (pending === 0) {
    return {
      done,
      pending,
      total,
      progress,
      tone: 'success',
      label: 'Em dia',
      priority: 3,
      description: 'Todas as obrigações atribuídas foram concluídas',
    };
  }

  if (daysToDue <= 3) {
    return {
      done,
      pending,
      total,
      progress,
      tone: 'warning',
      label: 'Vencendo',
      priority: 0,
      description: `${pending} pendência(s) com prazo próximo`,
    };
  }

  return {
    done,
    pending,
    total,
    progress,
    tone: 'attention',
    label: 'Com pendências',
    priority: 1,
    description: `${pending} obrigação(ões) pendente(s)`,
  };
}

export function getStatusClasses(tone) {
  const classes = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300',
    warning: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/70 dark:bg-orange-950/30 dark:text-orange-300',
    attention: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300',
    neutral: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  };

  return classes[tone] || classes.neutral;
}
