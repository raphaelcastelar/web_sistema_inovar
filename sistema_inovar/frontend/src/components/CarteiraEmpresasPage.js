import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  ChevronRightIcon,
  FolderOpenIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  TagIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';

const PASTAS_FILTERS_KEY = 'pastasEmpresaFilters';
const DEFAULT_CARTEIRA_OPTIONS = ['INOVAR ES', 'INOVAR MG', 'NOVVA'];
const PAGE_SIZE_OPTIONS = [24, 48, 96];
const DEFAULT_PAGE_SIZE = 48;

const controlClass = 'h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-slate-500/20';
const chipClass = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors';
const chipOff = 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700';
const chipOn = 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950';

function readSavedFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(PASTAS_FILTERS_KEY));
    if (!saved || typeof saved !== 'object') return {};

    return {
      ...saved,
      selectedTagIds: Array.isArray(saved.selectedTagIds)
        ? saved.selectedTagIds.map(String)
        : [],
    };
  } catch {
    return {};
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

function formatCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 14) return value || 'CNPJ não informado';

  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

function getInitials(name) {
  const parts = String(name || 'Empresa').trim().split(/\s+/).filter(Boolean);
  const selectedParts = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return selectedParts.map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function getGroupLetter(name) {
  const firstCharacter = normalizeText(name).charAt(0).toUpperCase();
  return /[A-Z]/.test(firstCharacter) ? firstCharacter : '#';
}

function SummaryFilter({ label, value, tone = 'neutral', active, onClick }) {
  const toneClass = {
    neutral: 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/70 dark:text-slate-200 dark:ring-slate-800',
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900',
    muted: 'bg-gray-50 text-gray-700 ring-gray-200 dark:bg-gray-900/70 dark:text-gray-200 dark:ring-gray-800',
  }[tone];

  const hint = onClick ? 'Clique para listar' : 'Dentro dos filtros atuais';
  const content = (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</span>
      <strong className="text-xl font-bold tabular-nums">{value}</strong>
      <span className="sr-only">{hint}</span>
    </div>
  );

  if (!onClick) {
    return <div className={`min-w-0 rounded-lg px-3 py-2 ring-1 ${toneClass}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-w-0 rounded-lg px-3 py-2 text-left ring-1 transition hover:brightness-[0.98] ${toneClass} ${active ? 'ring-2 ring-slate-900 ring-offset-1 dark:ring-slate-100 dark:ring-offset-gray-950' : ''}`}
    >
      {content}
    </button>
  );
}

const CarteiraEmpresasPage = () => {
  const initialFilters = useRef(readSavedFilters()).current;
  const searchInputRef = useRef(null);
  const latestRequestRef = useRef(0);

  const [empresas, setEmpresas] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState(initialFilters.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search || '');
  const [selectedCarteira, setSelectedCarteira] = useState(initialFilters.selectedCarteira || '');
  const [selectedTagIds, setSelectedTagIds] = useState(initialFilters.selectedTagIds || []);
  const [activeTab, setActiveTab] = useState(initialFilters.activeTab || 'ativadas');
  const [pageSize, setPageSize] = useState(
    PAGE_SIZE_OPTIONS.includes(initialFilters.pageSize) ? initialFilters.pageSize : DEFAULT_PAGE_SIZE,
  );
  const [showTagPanel, setShowTagPanel] = useState((initialFilters.selectedTagIds || []).length > 0);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [nextPageUrl, setNextPageUrl] = useState(null);
  const [previousPageUrl, setPreviousPageUrl] = useState(null);
  const [summary, setSummary] = useState({ total: 0, ativadas: 0, naoAtivadas: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    axiosInstance.get('/api/tags/')
      .then((response) => {
        const data = Array.isArray(response.data) ? response.data : response.data?.results || [];
        setTags(data);
      })
      .catch(() => setTags([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PASTAS_FILTERS_KEY, JSON.stringify({
        search,
        selectedCarteira,
        selectedTagIds,
        activeTab,
        pageSize,
      }));
    } catch {
      // Se o navegador bloquear o armazenamento, os filtros continuam válidos nesta visita.
    }
  }, [activeTab, pageSize, search, selectedCarteira, selectedTagIds]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedSearch, pageSize, selectedCarteira, selectedTagIds]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName) || target?.isContentEditable;

      if (event.key === '/' && !isTyping && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setSearch('');
        searchInputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const buildRequestParams = useCallback(() => {
    const params = {
      paginated: 'true',
      page,
      page_size: pageSize,
      ativo: activeTab === 'ativadas' ? 'true' : 'false',
    };

    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (selectedCarteira) params.carteira_clientes = selectedCarteira;
    if (selectedTagIds.length > 0) params.tags = [...selectedTagIds].sort().join(',');
    return params;
  }, [activeTab, debouncedSearch, page, pageSize, selectedCarteira, selectedTagIds]);

  const fetchEmpresas = useCallback(async ({ forceLoading = false } = {}) => {
    const requestId = latestRequestRef.current + 1;
    latestRequestRef.current = requestId;

    if (loading || forceLoading) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const response = await axiosInstance.get('/api/empresas/', { params: buildRequestParams() });
      if (latestRequestRef.current !== requestId) return;

      const data = response.data || {};
      const results = Array.isArray(data.results) ? data.results : (Array.isArray(data) ? data : []);
      setEmpresas(results);
      setTotalCount(Number(data.count) || results.length);
      setNextPageUrl(data.next || null);
      setPreviousPageUrl(data.previous || null);
      setSummary({
        total: Number(data.summary?.total) || 0,
        ativadas: Number(data.summary?.ativadas) || 0,
        naoAtivadas: Number(data.summary?.nao_ativadas) || 0,
      });
    } catch (err) {
      if (latestRequestRef.current !== requestId) return;
      if (err?.response?.status === 404 && page > 1) {
        setPage(1);
        return;
      }
      setError(err?.response?.data?.detail || 'Não foi possível carregar as empresas.');
    } finally {
      if (latestRequestRef.current === requestId) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [buildRequestParams, loading, page]);

  useEffect(() => {
    fetchEmpresas();
    // A função muda quando qualquer filtro ou página muda.
  }, [buildRequestParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const groupedEmpresas = useMemo(() => {
    const sorted = [...empresas].sort((left, right) => String(left.nome || '').localeCompare(
      String(right.nome || ''),
      'pt-BR',
      { sensitivity: 'base' },
    ));

    return sorted.reduce((groups, empresa) => {
      const letter = getGroupLetter(empresa.nome);
      const currentGroup = groups.find((group) => group.letter === letter);
      if (currentGroup) currentGroup.empresas.push(empresa);
      else groups.push({ letter, empresas: [empresa] });
      return groups;
    }, []);
  }, [empresas]);

  const carteiraOptions = useMemo(() => {
    const options = new Set(DEFAULT_CARTEIRA_OPTIONS);
    if (selectedCarteira) options.add(selectedCarteira);
    return Array.from(options);
  }, [selectedCarteira]);

  const activeFilterCount = (debouncedSearch.trim() ? 1 : 0)
    + (selectedCarteira ? 1 : 0)
    + selectedTagIds.length;
  const totalPages = Math.max(Math.ceil(totalCount / pageSize), 1);
  const firstItem = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalCount);

  const toggleTagFilter = (tagId) => {
    setSelectedTagIds((current) => (
      current.includes(tagId)
        ? current.filter((id) => id !== tagId)
        : [...current, tagId]
    ));
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setSelectedCarteira('');
    setSelectedTagIds([]);
  };

  return (
    <main className="w-full max-w-none space-y-3 px-0 py-1 text-gray-900 dark:text-gray-100 sm:space-y-4 sm:py-2">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Arquivos das empresas</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Pastas</h1>
        </div>
        <button
          type="button"
          onClick={() => fetchEmpresas({ forceLoading: false })}
          disabled={loading || refreshing}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <div className="grid w-full gap-2 sm:grid-cols-3">
        <SummaryFilter label="Total" value={summary.total} />
        <SummaryFilter label="Ativadas" value={summary.ativadas} tone="success" active={activeTab === 'ativadas'} onClick={() => setActiveTab('ativadas')} />
        <SummaryFilter label="Não ativadas" value={summary.naoAtivadas} tone="muted" active={activeTab === 'nao-ativadas'} onClick={() => setActiveTab('nao-ativadas')} />
      </div>

      <section className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <div className="grid gap-3 xl:grid-cols-[minmax(16rem,1.6fr)_minmax(11rem,1fr)_auto]">
          <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 transition focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-200 dark:border-gray-700 dark:text-gray-400 dark:focus-within:ring-slate-500/20">
            <MagnifyingGlassIcon className="h-4 w-4 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome, CNPJ, e-mail ou telefone  ( / )"
              aria-label="Buscar empresa"
              className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Limpar busca" className="opacity-60 transition hover:opacity-100">
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </label>

          <select value={selectedCarteira} onChange={(event) => setSelectedCarteira(event.target.value)} className={controlClass} aria-label="Filtrar por carteira">
            <option value="">Todas as carteiras</option>
            {carteiraOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowTagPanel((current) => !current)}
              aria-expanded={showTagPanel}
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors ${selectedTagIds.length > 0 ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}
            >
              <TagIcon className="h-4 w-4" />
              Tags
              {selectedTagIds.length > 0 && <span className="rounded-full bg-white/20 px-1.5 text-xs tabular-nums dark:bg-slate-950/20">{selectedTagIds.length}</span>}
            </button>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearFilters} className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                <XMarkIcon className="h-4 w-4" /> Limpar
              </button>
            )}
          </div>
        </div>

        {showTagPanel && (
          <div className="mt-2 rounded-md border border-gray-200 p-3 dark:border-gray-700">
            {tags.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">Nenhuma tag disponível para o seu perfil.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedTagIds([])} className={`${chipClass} ${selectedTagIds.length === 0 ? chipOn : chipOff}`}>Todas</button>
                {tags.map((tag) => {
                  const tagId = String(tag.id);
                  const selected = selectedTagIds.includes(tagId);
                  return (
                    <button key={tag.id} type="button" onClick={() => toggleTagFilter(tagId)} className={`${chipClass} ${selected ? chipOn : chipOff}`}>
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                      {tag.nome}
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTagIds.length > 1 && <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Com várias tags marcadas, aparecem empresas que tenham <strong>qualquer uma</strong> delas.</p>}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
          <span className="inline-flex items-center gap-2">
            <FunnelIcon className="h-4 w-4" />
            {activeFilterCount > 0 ? `${activeFilterCount} filtro(s) ativo(s) · ` : 'Sem filtros · '}
            <strong className="font-semibold tabular-nums text-gray-700 dark:text-gray-200">{totalCount}</strong>
            {totalCount === 1 ? ' empresa' : ' empresas'}
          </span>
          {refreshing && <span className="inline-flex items-center gap-1.5"><ArrowPathIcon className="h-3.5 w-3.5 animate-spin" />Atualizando…</span>}
          <label className="ml-auto inline-flex items-center gap-2">
            Por página
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
              {PAGE_SIZE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => fetchEmpresas({ forceLoading: true })} className="rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold dark:border-rose-800 dark:bg-transparent">Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando empresas">
          {Array.from({ length: 8 }).map((_, index) => <div key={index} className="h-[68px] animate-pulse rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900" />)}
        </div>
      ) : groupedEmpresas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
          <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">Nenhuma empresa para os filtros atuais</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste a busca, a carteira, a situação ou as tags selecionadas.</p>
          {activeFilterCount > 0 && <button type="button" onClick={clearFilters} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white dark:bg-slate-100 dark:text-slate-950">Limpar filtros</button>}
        </div>
      ) : (
        <>
          <div className={`space-y-5 transition-opacity ${refreshing ? 'opacity-60' : ''}`}>
            {groupedEmpresas.map((group) => (
              <section key={group.letter} aria-labelledby={`grupo-${group.letter}`}>
                <div className="mb-2 flex items-center gap-3">
                  <h2 id={`grupo-${group.letter}`} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-950">{group.letter}</h2>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {group.empresas.map((empresa) => (
                    <Link
                      key={empresa.id}
                      to={`/empresas/${empresa.id}/pastas`}
                      aria-label={`Abrir pasta de ${empresa.nome}`}
                      className="group flex min-h-[68px] min-w-0 items-center gap-2.5 rounded-lg border border-gray-200 bg-white p-2.5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-700 dark:focus:ring-offset-gray-950"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-bold text-sky-700 transition group-hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300 dark:group-hover:bg-sky-950">{getInitials(empresa.nome)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-gray-950 dark:text-gray-100" title={empresa.nome}>{empresa.nome}</span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">{formatCnpj(empresa.cnpj)}</span>
                      </span>
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition group-hover:bg-sky-50 group-hover:text-sky-700 dark:group-hover:bg-sky-950/50 dark:group-hover:text-sky-300">
                        <FolderOpenIcon className="h-5 w-5 group-hover:hidden" />
                        <ChevronRightIcon className="hidden h-5 w-5 group-hover:block" />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 sm:flex-row">
            <div>Mostrando <strong className="tabular-nums">{firstItem}–{lastItem}</strong> de <strong className="tabular-nums">{totalCount}</strong> · página <strong className="tabular-nums">{page}</strong> de <strong className="tabular-nums">{totalPages}</strong></div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(current - 1, 1))} disabled={!previousPageUrl || loading || refreshing} className="rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200">Anterior</button>
              <button type="button" onClick={() => setPage((current) => current + 1)} disabled={!nextPageUrl || loading || refreshing} className="rounded-md bg-slate-900 px-3 py-2 font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950">Próxima</button>
            </div>
          </div>
        </>
      )}
    </main>
  );
};

export default CarteiraEmpresasPage;
