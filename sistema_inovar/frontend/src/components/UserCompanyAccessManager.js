import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { UsersIcon, BuildingOffice2Icon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Navigate } from 'react-router-dom';

const UserCompanyAccessManager = () => {
    const [users, setUsers] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [assignUserId, setAssignUserId] = useState('');
    const [assignEmpresaId, setAssignEmpresaId] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);

    useEffect(() => {
        // Verifica se o usuário é administrador
        const checkAdmin = async () => {
            try {
                const response = await axiosInstance.get('/api/current-user/'); // Endpoint para obter dados do usuário logado
                setIsAdmin(response.data.is_superuser);
            } catch (err) {
                setError('Erro ao verificar permissões');
                setIsAdmin(false);
            }
        };
        checkAdmin();
    }, []);

    useEffect(() => {
        if (isAdmin === false) return;
        // Carrega usuários e empresas
        const fetchData = async () => {
            setLoading(true);
            try {
                const [usersResponse, empresasResponse] = await Promise.all([
                    axiosInstance.get('/api/user-company-access/'),
                    axiosInstance.get('/api/empresas/')
                ]);
                setUsers(usersResponse.data);
                setEmpresas(empresasResponse.data);
                if (usersResponse.data.length > 0) {
                    setSelectedUser(usersResponse.data[0]);
                }
            } catch (err) {
                setError('Erro ao carregar dados: ' + (err.response?.data?.detail || 'Erro desconhecido'));
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [isAdmin]);

    const handleAssign = async (e) => {
        e.preventDefault();
        if (!assignUserId || !assignEmpresaId) {
            setError('Selecione um usuário e uma empresa');
            return;
        }
        try {
            const response = await axiosInstance.post('/api/user-company-access/assign/', {
                user_id: assignUserId,
                empresa_id: assignEmpresaId
            });
            alert(response.data.message);
            const usersResponse = await axiosInstance.get('/api/user-company-access/');
            setUsers(usersResponse.data);
            if (selectedUser) {
                setSelectedUser(usersResponse.data.find(u => u.user_id === selectedUser.user_id));
            }
            setAssignUserId('');
            setAssignEmpresaId('');
        } catch (err) {
            setError('Erro ao conceder acesso: ' + (err.response?.data?.error || 'Erro desconhecido'));
        }
    };

    const handleRemove = async (userId, empresaId) => {
        if (!window.confirm('Tem certeza que deseja remover este acesso?')) return;
        try {
            const response = await axiosInstance.post('/api/user-company-access/remove/', { user_id: userId, empresa_id: empresaId });
            alert(response.data.message);
            const usersResponse = await axiosInstance.get('/api/user-company-access/');
            setUsers(usersResponse.data);
            if (selectedUser) {
                setSelectedUser(usersResponse.data.find(u => u.user_id === selectedUser.user_id));
            }
        } catch (err) {
            setError('Erro ao remover acesso: ' + (err.response?.data?.error || 'Erro desconhecido'));
        }
    };

    if (isAdmin === null) {
        return <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Verificando permissões...</p>;
    }

    if (isAdmin === false) {
        return <Navigate to="/empresas" replace />;
    }

    if (error) {
        return <div className="text-center text-red-500 dark:text-red-400 mt-10">{error}</div>;
    }

    if (loading) {
        return <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Carregando...</p>;
    }

    return (
        <div className="p-6 md:p-8 animate-fade-in">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8">Gerenciamento de Acesso a Empresas</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6"
                >
                    <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                        <UsersIcon className="h-6 w-6 mr-2" /> Usuários
                    </h2>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {users.map(user => (
                            <button
                                key={user.user_id}
                                onClick={() => setSelectedUser(user)}
                                className={`w-full text-left p-3 rounded-md flex items-center space-x-3 ${selectedUser?.user_id === user.user_id ? 'bg-indigo-50 dark:bg-indigo-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            >
                                <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-sm font-bold">
                                    {user.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="text-gray-800 dark:text-gray-200 font-medium">{user.username}</p>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-gray-800 rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-6"
                >
                    {selectedUser ? (
                        <>
                            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                                <BuildingOffice2Icon className="h-6 w-6 mr-2" /> Empresas de {selectedUser.username}
                            </h2>
                            <ul className="space-y-2 mb-6">
                                {selectedUser.empresas.length === 0 ? (
                                    <p className="text-gray-500 dark:text-gray-400">Nenhuma empresa associada</p>
                                ) : (
                                    selectedUser.empresas.map(empresa => (
                                        <li key={empresa.id} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">
                                            <span className="text-gray-800 dark:text-gray-200">{empresa.nome} ({empresa.cnpj})</span>
                                            <button
                                                onClick={() => handleRemove(selectedUser.user_id, empresa.id)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                                                title="Remover acesso"
                                            >
                                                <XMarkIcon className="h-5 w-5" />
                                            </button>
                                        </li>
                                    ))
                                )}
                            </ul>

                            <form onSubmit={handleAssign} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Usuário</label>
                                    <select
                                        value={assignUserId}
                                        onChange={(e) => setAssignUserId(e.target.value)}
                                        className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Selecione um usuário</option>
                                        {users.map(user => (
                                            <option key={user.user_id} value={user.user_id}>{user.username}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</label>
                                    <select
                                        value={assignEmpresaId}
                                        onChange={(e) => setAssignEmpresaId(e.target.value)}
                                        className="w-full p-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Selecione uma empresa</option>
                                        {empresas.map(empresa => (
                                            <option key={empresa.id} value={empresa.id}>{empresa.nome} ({empresa.cnpj})</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full p-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center justify-center space-x-2"
                                >
                                    <CheckIcon className="h-5 w-5" />
                                    <span>Conceder Acesso</span>
                                </button>
                            </form>
                        </>
                    ) : (
                        <p className="text-gray-500 dark:text-gray-400">Selecione um usuário para gerenciar acessos</p>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default UserCompanyAccessManager;