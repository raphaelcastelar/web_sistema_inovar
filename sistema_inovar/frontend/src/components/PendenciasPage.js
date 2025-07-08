import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UsersIcon, TrashIcon } from '@heroicons/react/24/outline';

// Dados mockados para teste
const mockPendencias = [
  {
    id: 1,
    empresa: { id: 1, nome: 'Empresa A', cnpj: '12.345.678/0001-90' },
    tipo: 'INSS',
  },
  {
    id: 2,
    empresa: { id: 1, nome: 'Empresa A', cnpj: '12.345.678/0001-90' },
    tipo: 'FGTS',
  },
  {
    id: 3,
    empresa: { id: 2, nome: 'Empresa B', cnpj: '98.765.432/0001-12' },
    tipo: 'Simples Nacional',
  },
  {
    id: 4,
    empresa: { id: 3, nome: 'Empresa C', cnpj: '56.789.123/0001-45' },
    tipo: 'Folha',
  },
  {
    id: 5,
    empresa: { id: 3, nome: 'Empresa C', cnpj: '56.789.123/0001-45' },
    tipo: 'Honorário',
  },
];

const PendenciasPage = () => {
  const [pendencias, setPendencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState('');

  useEffect(() => {
    // Simular carregamento de dados com delay para efeito visual
    const fetchPendencias = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simula delay de 1s
        setPendencias(mockPendencias);
      } catch (err) {
        setError('Erro ao carregar pendências.');
        console.error('Erro ao carregar pendências:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPendencias();
  }, []);

  const handleClearPendencia = async (pendenciaId) => {
    setClearing(true);
    setClearError('');
    try {
      // Simular requisição DELETE
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simula delay de 0.5s
      setPendencias((prev) => prev.filter((pendencia) => pendencia.id !== pendenciaId));
    } catch (err) {
      setClearError('Erro ao limpar pendência.');
      console.error('Erro ao limpar pendência:', err);
    } finally {
      setClearing(false);
    }
  };

  const handleClearAllPendencias = async () => {
    setClearing(true);
    setClearError('');
    try {
      // Simular requisição DELETE para todas as pendências
      await new Promise((resolve) => setTimeout(resolve, 500)); // Simula delay de 0.5s
      setPendencias([]);
    } catch (err) {
      setClearError('Erro ao limpar todas as pendências.');
      console.error('Erro ao limpar todas as pendências:', err);
    } finally {
      setClearing(false);
    }
  };

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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Pendências das Empresas
          </h2>
          {pendencias.length > 0 && (
            <button
              onClick={handleClearAllPendencias}
              disabled={clearing}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <TrashIcon className="h-5 w-5" />
              <span>Limpar Todas</span>
            </button>
          )}
        </div>
        {clearError && (
          <div className="mb-4 text-red-500 dark:text-red-400 text-sm">{clearError}</div>
        )}
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
                  <th className="p-2 text-center text-sm font-medium text-gray-700 dark:text-gray-300 w-1/10">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendencias.map((pendencia) => (
                  <motion.tr
                    key={pendencia.id}
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
                    <td className="p-2 text-center">
                      <button
                        onClick={() => handleClearPendencia(pendencia.id)}
                        disabled={clearing}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Limpar Pendência"
                      >
                        <TrashIcon className="h-5 w-5 text-red-500 dark:text-red-400" />
                      </button>
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