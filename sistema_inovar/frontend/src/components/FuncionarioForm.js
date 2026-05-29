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
        cargo: '',
    });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEditing) {
            setLoading(true);
            axiosInstance.get(`/api/funcionarios/${funcionarioId}/`)
                .then(response => {
                    const { password, ...userData } = response.data;
                    setFormData({ ...userData, cargo: userData.cargo || 'pessoal' });
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
        console.log('Dados enviados:', formData);

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

    const inputClass = 'mt-1 w-full rounded-md border border-gray-200 bg-white p-3 text-gray-900 transition-colors focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20';
    const inputWithIconClass = `${inputClass} pl-10`;
    const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300';
    const errorClass = 'mt-1 text-xs text-rose-500 dark:text-rose-400';

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4"
        >
            <div className="mx-auto max-w-3xl">
                <div className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Administração</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">
                        {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
                    </h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                        Configure acesso, função e permissões do colaborador.
                    </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-8">
                
                {errors.general && (
                    <div className="mb-6 flex items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300" role="alert">
                        <InformationCircleIcon className="h-6 w-6 text-rose-700 dark:text-rose-300"/>
                        <span className="block sm:inline">{errors.general}</span>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="first_name" className={labelClass}>Nome</label>
                            <input 
                                type="text" 
                                name="first_name" 
                                id="first_name" 
                                value={formData.first_name} 
                                onChange={handleChange} 
                                className={inputClass}
                            />
                            {errors.first_name && <p className={errorClass}>{errors.first_name}</p>}
                        </div>
                        <div>
                            <label htmlFor="last_name" className={labelClass}>Sobrenome</label>
                            <input 
                                type="text" 
                                name="last_name" 
                                id="last_name" 
                                value={formData.last_name} 
                                onChange={handleChange} 
                                className={inputClass}
                            />
                            {errors.last_name && <p className={errorClass}>{errors.last_name}</p>}
                        </div>
                    </div>

                    <div className="relative">
                        <label htmlFor="username" className={labelClass}>Nome de Usuário (para login)</label>
                        <UserIcon className="h-5 w-5 text-gray-400 dark:text-gray-300 absolute top-10 left-3"/>
                        <input 
                            type="text" 
                            name="username" 
                            id="username" 
                            value={formData.username} 
                            onChange={handleChange} 
                            required 
                            className={inputWithIconClass}
                        />
                        {errors.username && <p className={errorClass}>{errors.username}</p>}
                    </div>

                    <div className="relative">
                        <label htmlFor="email" className={labelClass}>Email</label>
                        <EnvelopeIcon className="h-5 w-5 text-gray-400 dark:text-gray-300 absolute top-10 left-3"/>
                        <input 
                            type="email" 
                            name="email" 
                            id="email" 
                            value={formData.email} 
                            onChange={handleChange} 
                            required 
                            className={inputWithIconClass}
                        />
                        {errors.email && <p className={errorClass}>{errors.email}</p>}
                    </div>
                    
                    <div className="relative">
                        <label htmlFor="password" className={labelClass}>Senha</label>
                        <LockClosedIcon className="h-5 w-5 text-gray-400 dark:text-gray-300 absolute top-10 left-3"/>
                        <input 
                            type="password" 
                            name="password" 
                            id="password" 
                            value={formData.password} 
                            onChange={handleChange} 
                            placeholder={isEditing ? "Deixe em branco para não alterar" : "Senha obrigatória"} 
                            required={!isEditing} 
                            className={inputWithIconClass}
                        />
                        {errors.password && <p className={errorClass}>{errors.password}</p>}
                    </div>

                    <div className="relative">
                        <label htmlFor="cargo" className={labelClass}>Função</label>
                        <UserGroupIcon className="h-5 w-5 text-gray-400 dark:text-gray-300 absolute top-10 left-3"/>
                        <select
                            name="cargo"
                            id="cargo"
                            value={formData.cargo}
                            onChange={handleChange}
                            required
                            className={inputWithIconClass}
                        >
                            <option value="" disabled>Selecione uma função</option>
                            <option value="pessoal">Departamento Pessoal</option>
                            <option value="fiscal">Departamento Fiscal</option>
                            <option value="admin">Administrador</option>
                        </select>
                        {errors.cargo && <p className={errorClass}>{errors.cargo}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                        <label htmlFor="is_active" className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-slate-950">
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
                                <div className="h-6 w-11 rounded-full bg-gray-300 peer after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-slate-900 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-gray-700 dark:peer-checked:bg-slate-100"></div>
                            </div>
                        </label>
                        <label htmlFor="is_staff" className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-slate-50 p-3 dark:border-gray-800 dark:bg-slate-950">
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
                                <div className="h-6 w-11 rounded-full bg-gray-300 peer after:absolute after:left-[2px] after:top-0.5 after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-slate-900 peer-checked:after:translate-x-full peer-checked:after:border-white dark:bg-gray-700 dark:peer-checked:bg-slate-100"></div>
                            </div>
                        </label>
                    </div>

                    <div className="flex items-center justify-end space-x-4 pt-4">
                        <button 
                            type="button" 
                            onClick={() => navigate('/gerenciar-usuarios')} 
                            className="rounded-md border border-gray-300 bg-white px-6 py-3 text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit" 
                            className="rounded-md bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                            disabled={loading}
                        >
                            {loading ? 'Salvando...' : (isEditing ? 'Atualizar Usuário' : 'Criar Usuário')}
                        </button>
                    </div>
                </form>
                </div>
            </div>
        </motion.div> 
    );
};

export default FuncionarioForm;
