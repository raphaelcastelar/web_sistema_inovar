import React, { useState, useEffect, useMemo } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { PencilIcon, TrashIcon, PlusIcon, FolderIcon, MagnifyingGlassIcon, BuildingOffice2Icon, TagIcon } from '@heroicons/react/24/outline';



const EmpresaList = () => {
    const [empresas, setEmpresas] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [tags, setTags] = useState([]);
    const [selectedTagId, setSelectedTagId] = useState('');
    const [activeTab, setActiveTab] = useState('ativadas'); // 'ativadas' ou 'nao-ativadas'

    // Estado para controle do Infinite Scroll
    const [visibleCount, setVisibleCount] = useState(24); // Começa mostrando 24
    const observerTarget = React.useRef(null);

    useEffect(() => {
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

        const fetchTags = async () => {
            try {
                const response = await axiosInstance.get('/api/tags/');
                setTags(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                console.error('Erro ao carregar tags:', err.response?.data || err.message);
            }
        };

        fetchUser();
        fetchTags();
        fetchEmpresas();
    }, []);

    // Resetar a contagem visível quando mudar a busca ou a aba
    useEffect(() => {
        setVisibleCount(24);
    }, [search, activeTab, selectedTagId]);

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
            return empresas.filter((empresa) => {
                const isInTab = activeTab === 'ativadas' ? empresa.ativo : !empresa.ativo;
                const matchTag = !selectedTagId || (empresa.tags || []).some((tag) => String(tag.id) === selectedTagId);
                return isInTab && matchTag;
            });
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
            const matchTag = !selectedTagId || (empresa.tags || []).some((tag) => String(tag.id) === selectedTagId);
            const isInTab = activeTab === 'ativadas' ? empresa.ativo : !empresa.ativo;
            return (matchNome || matchEmail || matchCnpj) && isInTab && matchTag;
        });
    }, [empresas, search, activeTab, selectedTagId]);

    // Intersection Observer para carregar mais itens
    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return;

        // Usa threshold mais baixo e rootMargin para acionar antes do fim da lista
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => prev + 24);
                }
            },
            { threshold: 0.25, rootMargin: '200px' }
        );

        observer.observe(target);

        return () => {
            observer.disconnect();
        };
    }, [filteredEmpresas.length, visibleCount]);

    const visibleEmpresas = filteredEmpresas.slice(0, visibleCount);

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
                        <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-3 transform -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="p-3 pl-10 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-sm border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                    </div>
                    <div className="relative w-full md:w-56">
                        <TagIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-3 transform -translate-y-1/2" />
                        <select
                            value={selectedTagId}
                            onChange={(e) => setSelectedTagId(e.target.value)}
                            className="p-3 pl-10 w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg shadow-sm border border-gray-300 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        >
                            <option value="">Todas as tags</option>
                            {tags.map((tag) => (
                                <option key={tag.id} value={String(tag.id)}>
                                    {tag.nome}
                                </option>
                            ))}
                        </select>
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

            <div className="mb-6">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="flex space-x-6">
                        <button
                            onClick={() => setActiveTab('ativadas')}
                            className={`py-2 px-4 text-sm font-medium ${activeTab === 'ativadas' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        >
                            Empresas Ativadas
                        </button>
                        <button
                            onClick={() => setActiveTab('nao-ativadas')}
                            className={`py-2 px-4 text-sm font-medium ${activeTab === 'nao-ativadas' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        >
                            Empresas Não Ativadas
                        </button>
                    </nav>
                </div>
            </div>

            {filteredEmpresas.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
                        {activeTab === 'ativadas' ? 'Nenhuma empresa ativada' : 'Nenhuma empresa não ativada'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {search ? 'Tente refinar sua busca ou ' : activeTab === 'ativadas' ? 'Nenhuma empresa ativada no momento.' : 'Nenhuma empresa desativada no momento.'}
                        {isAdmin && !search && activeTab === 'ativadas' && <Link to="/empresas/cadastrar" className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">cadastre a primeira</Link>}
                    </p>
                </div>
            ) : (
                <>
                    <motion.div
                        className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                        variants={containerVariants}
                        initial="hidden"
                        animate="visible"
                    >
                        {visibleEmpresas.map(empresa => {

                            return (
                                <motion.div
                                    key={empresa.id}
                                    variants={itemVariants}
                                    whileHover={{ y: -5 }}
                                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl border border-gray-200 dark:border-gray-700 transition-shadow duration-300 flex flex-col"
                                >
                                    <div className="p-6 flex-grow">
                                        <div className="mb-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-gray-900 dark:text-indigo-300 break-words leading-tight">{empresa.nome}</h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400">{empresa.cnpj}</p>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 break-all">{empresa.email}</p>
                                        {(empresa.tags || []).length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {(empresa.tags || []).map((tag) => (
                                                    <span
                                                        key={tag.id}
                                                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                                                    >
                                                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                        {tag.nome}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex space-x-2 bg-gray-50 dark:bg-gray-700/50 p-3 border-t border-gray-200 dark:border-gray-700">
                                        <Link to={`/empresas/editar/${empresa.id}`} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors" title="Editar">
                                            <PencilIcon className="h-5 w-5 mx-auto" />
                                        </Link>
                                        {isAdmin && (
                                            <button onClick={() => handleDelete(empresa.id)} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors" title="Excluir">
                                                <TrashIcon className="h-5 w-5 mx-auto" />
                                            </button>
                                        )}
                                        <Link to={`/empresas/${empresa.id}/pastas`} className="flex-1 text-center py-2 px-3 text-sm text-gray-600 dark:text-gray-300 hover:bg-green-100 dark:hover:bg-green-900/50 hover:text-green-600 dark:hover:text-green-400 rounded-md transition-colors" title="Acessar Pastas">
                                            <FolderIcon className="h-5 w-5 mx-auto" />
                                        </Link>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>

                    {/* Elemento sentinela para o Infinite Scroll */}
                    {visibleCount < filteredEmpresas.length && (
                        <div ref={observerTarget} className="text-center py-8 text-gray-500">
                            Carregando mais empresas...
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default EmpresaList;
