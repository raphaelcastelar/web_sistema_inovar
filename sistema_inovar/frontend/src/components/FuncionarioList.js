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
      <div className="p-6 md:p-8 text-center">
        <ExclamationCircleIcon className="mx-auto h-16 w-16 text-red-500 dark:text-red-400 mt-10" />
        <h2 className="mt-4 text-xl font-bold text-gray-800 dark:text-indigo-300">Acesso Negado</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Você não possui permissões de administrador para acessar esta página. Somente administradores podem gerenciar os usuários.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
        >
          Voltar ao Início
        </Link>
      </div>
    );
  }

  if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

  return (
    <div className="p-6 md:p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300">Gerenciamento de Usuários</h1>
        <Link
          to="/gerenciar-usuarios/novo"
          className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-500 transition-colors shadow-lg"
        >
          <UserPlusIcon className="h-5 w-5 mr-2" />
          Novo Usuário
        </Link>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Pesquisar por nome, usuário ou email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
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
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
          >
            <div className="p-6 flex-grow">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 bg-gray-200 dark:bg-gray-700 p-2 rounded-full">
                  <UserCircleIcon className="h-10 w-10 text-indigo-500 dark:text-indigo-400" />
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
                      ? 'bg-green-100 text-green-800 dark:bg-green-800/50 dark:text-green-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-800/50 dark:text-red-300'
                  }`}
                >
                  {func.is_active ? 'Ativo' : 'Inativo'}
                </span>
                {func.is_staff && (
                  <span className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800 dark:bg-indigo-800/50 dark:text-indigo-300">
                    <ShieldCheckIcon className="h-4 w-4" />
                    Admin
                  </span>
                )}
                <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-800/50 dark:text-blue-300">
                  {func.cargo === 'pessoal' ? 'Depto. Pessoal' : func.cargo === 'fiscal' ? 'Depto. Fiscal' : func.cargo === 'admin' ? 'Administrador' : 'Sem Função'}
                </span>
              </div>
            </div>
            <div className="flex border-t border-gray-200 dark:border-gray-700">
              <Link
                to={`/gerenciar-usuarios/editar/${func.id}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                title="Editar"
              >
                <PencilSquareIcon className="h-5 w-5" /> Editar
              </Link>
              <button
                onClick={() => handleDelete(func.id, `${func.first_name} ${func.last_name}`)}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover:text-red-600 dark:hover:text-red-400 rounded-bl-lg transition-colors border-l border-gray-200 dark:border-gray-700"
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