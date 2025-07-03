import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { UsersIcon } from '@heroicons/react/24/outline';

const PendenciasPage = () => {
  const [pendencias, setPendencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPendencias = async () => {
      try {
        const response = await axiosInstance.get('/api/pendencias/');
        setPendencias(response.data);
      } catch (err) {
        setError('Erro ao carregar pendências.');
        console.error('Erro ao carregar pendências:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPendencias();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando Pendências...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500 dark:text-red-400">{error}</div>;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="p-6 md:p-8 animate-fade-in"
    >
      <motion.h1
        variants={itemVariants}
        className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8"
      >
        Pendências
      </motion.h1>
      <motion.div
        variants={itemVariants}
        className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">
          Pendências das Empresas
        </h2>
        <div className="overflow-y-auto max-h-[540px]">
          {pendencias.length > 0 ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-indigo-50 dark:bg-indigo-900/50 sticky top-0">
                  <th className="p-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-2/5">
                    Empresa
                  </th>
                  <th className="p-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-2/5">
                    CNPJ
                  </th>
                  <th className="p-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300 w-1/5">
                    Pendência
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((pendencia, index) => (
                  <motion.tr
                    key={index}
                    variants={itemVariants}
                    className="border-b border-gray-200 dark:border-gray-700"
                  >
                    <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                      <div className="flex items-center space-x-2">
                        <UsersIcon className="h-5 w-5 text-indigo-500 dark:text-indigo-400" />
                        <Link
                          to={`/consultar-declaracoes?empresa_id=${pendencia.empresa.id}`}
                          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                        >
                          {pendencia.empresa.nome}
                        </Link>
                      </div>
                    </td>
                    <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                      {pendencia.empresa.cnpj}
                    </td>
                    <td className="p-2 text-sm text-gray-600 dark:text-gray-300">
                      {pendencia.tipo}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              Nenhuma pendência registrada.
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PendenciasPage;