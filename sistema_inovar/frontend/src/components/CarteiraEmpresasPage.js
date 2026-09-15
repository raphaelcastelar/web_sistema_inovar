import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  ChevronRightIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../api/axiosInstance';

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

const CarteiraEmpresasPage = () => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const searchInputRef = useRef(null);

  const fetchEmpresas = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await axiosInstance.get('/api/empresas/');
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.results || [];
      setEmpresas(data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'Não foi possível carregar as empresas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmpresas();
  }, [fetchEmpresas]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);

      if (event.key === '/' && !isTyping) {
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

  const filteredEmpresas = useMemo(() => {
    const term = normalizeText(search);
    const digits = search.replace(/\D/g, '');

    return empresas
      .filter((empresa) => {
        if (!term && !digits) return true;

        const nameMatches = normalizeText(empresa.nome).includes(term);
        const cnpjMatches = digits
          && String(empresa.cnpj || '').replace(/\D/g, '').includes(digits);

        return nameMatches || cnpjMatches;
      })
      .sort((left, right) => String(left.nome || '').localeCompare(
        String(right.nome || ''),
        'pt-BR',
        { sensitivity: 'base' },
      ));
  }, [empresas, search]);

  const groupedEmpresas = useMemo(() => (
    filteredEmpresas.reduce((groups, empresa) => {
      const letter = getGroupLetter(empresa.nome);
      const currentGroup = groups.find((group) => group.letter === letter);

      if (currentGroup) {
        currentGroup.empresas.push(empresa);
      } else {
        groups.push({ letter, empresas: [empresa] });
      }

      return groups;
    }, [])
  ), [filteredEmpresas]);

  return (
    <main className="w-full max-w-none space-y-6 px-0 py-2 text-gray-900 dark:text-gray-100 sm:py-4">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Arquivos das empresas
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">
            Pastas
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Selecione uma empresa para acessar seus documentos.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchEmpresas}
          disabled={loading}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 sm:w-auto"
        >
          <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </header>

      <section className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 transition focus-within:border-sky-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-sky-500/15 dark:border-gray-700 dark:bg-gray-950 dark:focus-within:border-sky-400 dark:focus-within:bg-gray-900">
            <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-gray-400" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar empresa por nome ou CNPJ"
              aria-label="Buscar empresa por nome ou CNPJ"
              className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Limpar busca"
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="flex items-center justify-between gap-3 px-1 text-sm text-gray-500 dark:text-gray-400 sm:justify-end sm:px-0">
            <span>
              <strong className="font-semibold text-gray-900 dark:text-gray-100">{filteredEmpresas.length}</strong>
              {' '}{filteredEmpresas.length === 1 ? 'empresa' : 'empresas'}
            </span>
            <span className="hidden rounded-md border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 lg:inline">
              / para buscar
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-label="Carregando empresas">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"
            />
          ))}
        </div>
      ) : groupedEmpresas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center dark:border-gray-700 dark:bg-gray-900">
          <BuildingOffice2Icon className="mx-auto h-10 w-10 text-gray-400" />
          <p className="mt-3 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Nenhuma empresa encontrada
          </p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Verifique o nome ou CNPJ informado.
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            >
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {groupedEmpresas.map((group) => (
            <section key={group.letter} aria-labelledby={`grupo-${group.letter}`}>
              <div className="mb-3 flex items-center gap-3">
                <h2
                  id={`grupo-${group.letter}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-white dark:bg-slate-100 dark:text-slate-950"
                >
                  {group.letter}
                </h2>
                <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {group.empresas.map((empresa) => (
                  <Link
                    key={empresa.id}
                    to={`/empresas/${empresa.id}/pastas`}
                    aria-label={`Abrir pasta de ${empresa.nome}`}
                    className="group flex min-h-20 min-w-0 items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-700 dark:focus:ring-offset-gray-950"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sm font-bold text-sky-700 transition group-hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-300 dark:group-hover:bg-sky-950">
                      {getInitials(empresa.nome)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-950 dark:text-gray-100" title={empresa.nome}>
                        {empresa.nome}
                      </span>
                      <span className="mt-1 block truncate text-xs text-gray-500 dark:text-gray-400">
                        {formatCnpj(empresa.cnpj)}
                      </span>
                    </span>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition group-hover:bg-sky-50 group-hover:text-sky-700 dark:group-hover:bg-sky-950/50 dark:group-hover:text-sky-300">
                      <FolderOpenIcon className="h-5 w-5 group-hover:hidden" />
                      <ChevronRightIcon className="hidden h-5 w-5 group-hover:block" />
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
};

export default CarteiraEmpresasPage;
