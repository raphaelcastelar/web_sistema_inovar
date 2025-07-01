import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon, PlusIcon, FolderIcon, MagnifyingGlassIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';

const getAvatarStyle = (name) => {
    if (!name) return { initial: '?', color: 'bg-gray-500' };
    const colors = [
        'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
        'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500',
        'bg-orange-500'
    ];
    const initial = name.charAt(0).toUpperCase();
    const charCodeSum = name.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const color = colors[charCodeSum % colors.length];
    return { initial, color };
};

const EmpresaList = () => {
    const [empresas, setEmpresas] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);

    useEffect(() => {
        // Fetch current user to check admin status
        const fetchUser = async () => {
            try {
                const response = await axiosInstance.get('/api/current-user/');
                setIsAdmin(response.data.is_staff || response.data.is_superuser);
            } catch (err) {
                console.error('Erro ao verificar permissões:', err.response?.data || err.message);
                setError('Erro ao verificar permissões');
                setIsAdmin(false);
            }
        };

        // Fetch all companies
        const fetchEmpresas = async () => {
            setLoading(true);
            try {
                const response = await axiosInstance.get('/api/empresas/?all=true');
                setEmpresas(response.data);
            } catch (err) {
                console.error('Erro ao carregar empresas:', err.response?.data || err.message);
                setError(err.response?.status === 403 
                    ? 'Você não tem permissão para visualizar empresas.' 
                    : `Erro ao carregar empresas: ${err.response?.data?.detail || err.message}`);
            } finally {
                setLoading(false);
            }
        };

        fetchUser();
        fetchEmpresas();
    }, []);

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir esta empresa? Esta ação apaga também a pasta da empresa no servidor.')) {
            axiosInstance.delete(`/api/empresas/${id}/`)
                .then(() => {
                    setEmpresas(empresas.filter(empresa => empresa.id !== id));
                })
                .catch(error => {
                    console.error('Erro ao excluir empresa:', error.response?.data || error.message);
                    alert(`Falha ao excluir a empresa: ${error.response?.data?.error || error.message}`);
                });
        }
    };

    const filteredEmpresas = useMemo(() => {
        const lowercasedSearch = search.toLowerCase().trim();
        if (!lowercasedSearch) {
            return empresas;
        }
        const searchDigits = search.replace(/\D/g, '');
        return empresas.filter(empresa => {
            const matchNome = empresa.nome?.toLowerCase().includes(lowercasedSearch);
            const matchEmail = empresa.email?.toLowerCase().includes(lowercasedSearch);
            let matchCnpj = false;
            if (searchDigits.length > 0) {
                const cleanedEmpresaCnpj = empresa.cnpj?.replace(/\D/g, '');
                matchCnpj = cleanedEmpresaCnpj?.includes(searchDigits);
            }
            return matchNome || matchEmail || matchCnpj;
        });
    }, [empresas, search]);

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    if (loading) {
        return <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Carregando empresas...</p>;
    }

    if (error) {
        return <p className="text-center text-red-500 dark:text-red-400 mt-10">{error}</p>;
    }

    return (
        <div className="p-6 md:p-8 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300">Empresas Cadastradas</h1>
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-3 transform -translate-y-1/2"/>
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="p-3 pl-10 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-sm border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                    {isAdmin && (
                        <Link
                            to="/empresas/cadastrar"
                            className="p-3 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-all duration-300 flex items-center space-x-2 flex-shrink-0"
                        >
                            <PlusIcon className="h-6 w-6" />
                            <span className="hidden sm:inline">Nova Empresa</span>
                        </Link>
                    )}
                </div>
            </div>
            
            {filteredEmpresas.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400"/>
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Nenhuma empresa encontrada</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {search ? 'Tente refinar sua busca ou ' : 'Nenhuma empresa cadastrada.'}
                        {isAdmin && !search && <Link to="/empresas/cadastrar" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">cadastre a primeira</Link>}
                    </p>
                </div>
            ) : (
                <motion.div 
                    className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                >
                    {filteredEmpresas.map(empresa => {
                        const avatar = getAvatarStyle(empresa.nome);
                        return (
                            <motion.div
                                key={empresa.id}
                                variants={itemVariants}
                                whileHover={{ y: -5 }}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl border border-gray-200 dark:border-gray-700 transition-shadow duration-300 flex flex-col"
                            >
                                <div className="p-6 flex-grow">
                                    <div className="flex items-center mb-4">
                                        <div className={`w-12 h-12 rounded-full ${avatar.color} flex items-center justify-center text-white text-xl font-bold mr-4 flex-shrink-0`}>
                                            {avatar.initial}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900 dark:text-indigo-300 break-words leading-tight">{empresa.nome}</h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{empresa.cnpj}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 break-all">{empresa.email}</p>
                                </div>
                                
                                <div className="flex space-x-2 bg-gray-50 dark:bg-gray-700/50 p-3 border-t border-gray-200 dark:border-gray-700">
                                    {isAdmin && (
                                        <>
                                            <Link to={`/empresas/editar/${empresa.id}`} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors" title="Editar">
                                                <PencilIcon className="h-5 w-5 mx-auto"/>
                                            </Link>
                                            <button onClick={() => handleDelete(empresa.id)} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors" title="Excluir">
                                                <TrashIcon className="h-5 w-5 mx-auto" />
                                            </button>
                                        </>
                                    )}
                                    <Link to={`/empresas/${empresa.id}/pastas`} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/50 hover:text-green-600 dark:hover:text-green-400 rounded-md transition-colors" title="Acessar Pastas">
                                        <FolderIcon className="h-5 w-5 mx-auto" />
                                    </Link>
                                </div>
                            </motion.div>
                        )
                    })}
                </motion.div>
            )}
        </div>
    );
};

export default EmpresaList;