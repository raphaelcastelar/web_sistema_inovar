import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import {
  UserPlusIcon,
  PencilSquareIcon,
  TrashIcon,
  UserCircleIcon,
  ShieldCheckIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const FuncionarioList = () => {
  const [funcionarios, setFuncionarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [isAdmin, setIsAdmin] = useState(null);

  const fetchFuncionarios = () => {
    setLoading(true);
    axiosInstance
      .get('/api/funcionarios/')
      .then((response) => {
        // Filtra para não exibir o superusuário "admin", se houver
        setFuncionarios(response.data.filter((f) => f.username !== 'admin'));
      })
      .catch((err) => {
        console.error('Erro ao buscar funcionários:', err);
        setError(
          err.response?.data?.error ||
            'Não foi possível carregar os usuários. Verifique se você tem permissão de administrador.'
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await axiosInstance.get('/api/current-user/');
        setIsAdmin(response.data.is_staff || response.data.is_superuser);
      } catch (err) {
        console.error('Erro ao verificar permissões:', err.response?.data || err.message);
        setIsAdmin(false);
      }
    };
    fetchUser();
    fetchFuncionarios();
  }, []);

  const handleDelete = (id, nome) => {
    if (!isAdmin) {
      setError('Você não tem permissão para excluir usuários.');
      return;
    }
    if (window.confirm(`Tem certeza que deseja excluir o usuário "${nome}"? Esta ação não pode ser desfeita.`)) {
      axiosInstance
        .delete(`/api/funcionarios/${id}/`)
        .then(() => {
          alert('Usuário excluído com sucesso!');
          fetchFuncionarios(); // Atualiza a lista
        })
        .catch((err) => {
          console.error('Erro ao excluir usuário:', err.response?.data);
          const errorMessage =
            err.response?.data?.error ||
            'Falha ao excluir o usuário. Verifique se não há dependências associadas.';
          alert(errorMessage);
        });
    }
  };

  const filteredFuncionarios = useMemo(
    () =>
      funcionarios.filter(
        (func) =>
          `${func.first_name} ${func.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
          func.username.toLowerCase().includes(search.toLowerCase()) ||
          func.email.toLowerCase().includes(search.toLowerCase())
      ),
    [funcionarios, search]
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.07 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1 },
  };

  if (loading) return <p className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando usuários...</p>;

  if (!isAdmin) {
    return (
      <div className="w-full max-w-none px-0 py-10 text-center text-gray-900 dark:text-gray-100">
        <ExclamationCircleIcon className="mx-auto h-16 w-16 text-rose-500 dark:text-rose-400" />
        <h2 className="mt-4 text-xl font-bold text-gray-950 dark:text-white">Acesso Negado</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Você não possui permissões de administrador para acessar esta página. Somente administradores podem gerenciar os usuários.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          Voltar ao Início
        </Link>
      </div>
    );
  }

  if (error) return <p className="p-8 text-center text-rose-500">{error}</p>;

  return (
    <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Administração</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Gerenciamento de Usuários</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
            Cadastre e mantenha os acessos da equipe.
          </p>
        </div>
        <Link
          to="/gerenciar-usuarios/novo"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
        >
          <UserPlusIcon className="h-5 w-5" />
          Novo Usuário
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <input
          type="text"
          placeholder="Pesquisar por nome, usuário ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 transition placeholder-gray-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20"
        />
      </div>

      <motion.div
        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {filteredFuncionarios.map((func) => (
          <motion.div
            key={func.id}
            variants={itemVariants}
            className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"
          >
            <div className="p-6 flex-grow">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                  <UserCircleIcon className="h-10 w-10 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                    {func.first_name || func.last_name
                      ? `${func.first_name} ${func.last_name}`.trim()
                      : 'Nome não cadastrado'}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">@{func.username}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-4 break-all">{func.email}</p>
              <div className="flex items-center gap-2 mt-4">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    func.is_active
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                  }`}
                >
                  {func.is_active ? 'Ativo' : 'Inativo'}
                </span>
                {func.is_staff && (
                  <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheckIcon className="h-4 w-4" />
                    Admin
                  </span>
                )}
                <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
                  {func.cargo === 'pessoal' ? 'Depto. Pessoal' : func.cargo === 'fiscal' ? 'Depto. Fiscal' : func.cargo === 'admin' ? 'Administrador' : 'Sem Função'}
                </span>
              </div>
            </div>
            <div className="flex border-t border-gray-200 dark:border-gray-800">
              <Link
                to={`/gerenciar-usuarios/editar/${func.id}`}
                className="flex flex-1 items-center justify-center gap-2 px-4 py-3 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                title="Editar"
              >
                <PencilSquareIcon className="h-5 w-5" /> Editar
              </Link>
              <button
                onClick={() => handleDelete(func.id, `${func.first_name} ${func.last_name}`)}
                className="flex flex-1 items-center justify-center gap-2 border-l border-gray-200 px-4 py-3 text-sm text-gray-600 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
                title="Excluir"
              >
                <TrashIcon className="h-5 w-5" /> Excluir
              </button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

export default FuncionarioList;
