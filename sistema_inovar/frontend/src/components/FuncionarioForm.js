import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { UserIcon, EnvelopeIcon, LockClosedIcon, InformationCircleIcon, UserGroupIcon } from '@heroicons/react/24/outline';

const FuncionarioForm = () => {
    const { funcionarioId } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(funcionarioId);

    const [formData, setFormData] = useState({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        password: '',
        is_active: true,
        is_staff: false,
        theme: 'light',
        cargo: '', // Alterado de 'role' para 'cargo'
    });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEditing) {
            setLoading(true);
            axiosInstance.get(`/api/funcionarios/${funcionarioId}/`)
                .then(response => {
                    const { password, ...userData } = response.data;
                    setFormData({ ...userData, cargo: userData.cargo || 'pessoal' }); // Alterado de 'role' para 'cargo'
                })
                .catch(err => {
                    console.error("Erro ao carregar usuário:", err);
                    setErrors({ general: "Não foi possível carregar os dados do usuário." });
                })
                .finally(() => setLoading(false));
        }
    }, [funcionarioId, isEditing]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});
        console.log('Dados enviados:', formData); // Log para depuração

        const payload = { ...formData };
        if (isEditing && !payload.password) {
            delete payload.password;
        }

        const url = isEditing ? `/api/funcionarios/${funcionarioId}/` : '/api/funcionarios/';
        const method = isEditing ? 'put' : 'post';

        axiosInstance[method](url, payload)
            .then(() => {
                alert(`Usuário ${isEditing ? 'atualizado' : 'criado'} com sucesso!`);
                navigate('/gerenciar-usuarios');
            })
            .catch(err => {
                console.error("Erro ao salvar usuário:", err.response?.data);
                if (err.response && err.response.data) {
                    setErrors(err.response.data);
                } else {
                    setErrors({ general: 'Ocorreu um erro inesperado. Tente novamente.' });
                }
            })
            .finally(() => setLoading(false));
    };

    if (loading && isEditing) return <p className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando dados do usuário...</p>;

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="p-6 md:p-8"
        >
            <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8 text-center">
                    {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
                </h1>
                
                {errors.general && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md relative mb-6 flex items-center gap-3" role="alert">
                        <InformationCircleIcon className="h-6 w-6"/>
                        <span className="block sm:inline">{errors.general}</span>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
                            <input 
                                type="text" 
                                name="first_name" 
                                id="first_name" 
                                value={formData.first_name} 
                                onChange={handleChange} 
                                className="mt-1 w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
                        </div>
                        <div>
                            <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sobrenome</label>
                            <input 
                                type="text" 
                                name="last_name" 
                                id="last_name" 
                                value={formData.last_name} 
                                onChange={handleChange} 
                                className="mt-1 w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
                        </div>
                    </div>

                    <div className="relative">
                        <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome de Usuário (para login)</label>
                        <UserIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3"/>
                        <input 
                            type="text" 
                            name="username" 
                            id="username" 
                            value={formData.username} 
                            onChange={handleChange} 
                            required 
                            className="mt-1 w-full p-3 pl-10 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
                    </div>

                    <div className="relative">
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                        <EnvelopeIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3"/>
                        <input 
                            type="email" 
                            name="email" 
                            id="email" 
                            value={formData.email} 
                            onChange={handleChange} 
                            required 
                            className="mt-1 w-full p-3 pl-10 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                    
                    <div className="relative">
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Senha</label>
                        <LockClosedIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3"/>
                        <input 
                            type="password" 
                            name="password" 
                            id="password" 
                            value={formData.password} 
                            onChange={handleChange} 
                            placeholder={isEditing ? "Deixe em branco para não alterar" : "Senha obrigatória"} 
                            required={!isEditing} 
                            className="mt-1 w-full p-3 pl-10 bg-gray-100 dark:bg-gray-700 rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                    </div>

                    <div className="relative">
                        <label htmlFor="cargo" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Função</label>
                        <UserGroupIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3"/>
                        <select
                            name="cargo"
                            id="cargo"
                            value={formData.cargo}
                            onChange={handleChange}
                            required
                            className="mt-1 w-full p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border-gray-300 dark:border-gray-600 focus:ring-indigo-500 focus:border-indigo-500"
                        >
                            <option value="" disabled>Selecione uma função</option>
                            <option value="pessoal">Departamento Pessoal</option>
                            <option value="fiscal">Departamento Fiscal</option>
                            <option value="admin">Administrador</option>
                        </select>
                        {errors.cargo && <p className="text-red-500 text-xs mt-1">{errors.cargo}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                        <label htmlFor="is_active" className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/60 rounded-lg cursor-pointer">
                            <span className="font-medium text-gray-900 dark:text-gray-100">Usuário Ativo</span>
                            <div className="relative">
                                <input 
                                    id="is_active" 
                                    name="is_active" 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={formData.is_active} 
                                    onChange={handleChange} 
                                />
                                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </div>
                        </label>
                        <label htmlFor="is_staff" className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-700/60 rounded-lg cursor-pointer">
                            <span className="font-medium text-gray-900 dark:text-gray-100">Acesso de Administrador</span>
                            <div className="relative">
                                <input 
                                    id="is_staff" 
                                    name="is_staff" 
                                    type="checkbox" 
                                    className="sr-only peer" 
                                    checked={formData.is_staff} 
                                    onChange={handleChange} 
                                />
                                <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                            </div>
                        </label>
                    </div>

                    <div className="flex items-center justify-end space-x-4 pt-4">
                        <button 
                            type="button" 
                            onClick={() => navigate('/gerenciar-usuarios')} 
                            className="px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" 
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" 
                            disabled={loading}
                        >
                            {loading ? 'Salvando...' : (isEditing ? 'Atualizar Usuário' : 'Criar Usuário')}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div> 
    );
};

export default FuncionarioForm;