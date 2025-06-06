// src/components/FuncionarioForm.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';

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
        is_staff: false
    });
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEditing) {
            setLoading(true);
            axiosInstance.get(`/api/funcionarios/${funcionarioId}/`)
                .then(response => {
                    // Não incluímos a senha, pois não a recebemos da API
                    const { password, ...userData } = response.data;
                    setFormData(userData);
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

        // Para edição, só envie a senha se ela foi digitada.
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

    if (loading && isEditing) return <p className="p-8 text-center text-gray-400">Carregando formulário...</p>;

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl shadow-2xl">
                <h1 className="text-3xl font-bold text-indigo-400 mb-8 text-center">
                    {isEditing ? 'Editar Usuário' : 'Novo Usuário'}
                </h1>
                {errors.general && <p className="text-red-500 mb-4">{errors.general}</p>}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="first_name" className="block text-sm font-medium text-gray-300">Nome</label>
                            <input type="text" name="first_name" id="first_name" value={formData.first_name} onChange={handleChange} className="mt-1 w-full p-3 bg-gray-700 rounded-md"/>
                            {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
                        </div>
                        <div>
                            <label htmlFor="last_name" className="block text-sm font-medium text-gray-300">Sobrenome</label>
                            <input type="text" name="last_name" id="last_name" value={formData.last_name} onChange={handleChange} className="mt-1 w-full p-3 bg-gray-700 rounded-md"/>
                            {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
                        </div>
                    </div>
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-gray-300">Nome de Usuário (para login)</label>
                        <input type="text" name="username" id="username" value={formData.username} onChange={handleChange} required className="mt-1 w-full p-3 bg-gray-700 rounded-md"/>
                        {errors.username && <p className="text-red-500 text-xs mt-1">{errors.username}</p>}
                    </div>
                    <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-300">Email</label>
                        <input type="email" name="email" id="email" value={formData.email} onChange={handleChange} required className="mt-1 w-full p-3 bg-gray-700 rounded-md"/>
                        {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-300">Senha</label>
                        <input type="password" name="password" id="password" value={formData.password} onChange={handleChange}
                               placeholder={isEditing ? "Deixe em branco para não alterar" : "Senha obrigatória"}
                               required={!isEditing}
                               className="mt-1 w-full p-3 bg-gray-700 rounded-md"/>
                        {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <input id="is_active" name="is_active" type="checkbox" checked={formData.is_active} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                            <label htmlFor="is_active" className="ml-2 block text-sm text-gray-300">Usuário Ativo</label>
                        </div>
                         <div className="flex items-center">
                            <input id="is_staff" name="is_staff" type="checkbox" checked={formData.is_staff} onChange={handleChange} className="h-4 w-4 text-indigo-600 border-gray-300 rounded"/>
                            <label htmlFor="is_staff" className="ml-2 block text-sm text-gray-300">Acesso de Administrador</label>
                        </div>
                    </div>
                    <div className="flex items-center justify-end space-x-4 pt-4">
                        <button type="button" onClick={() => navigate('/gerenciar-usuarios')} className="px-6 py-3 bg-gray-600 rounded-md hover:bg-gray-500" disabled={loading}>Cancelar</button>
                        <button type="submit" className="px-6 py-3 bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:opacity-50" disabled={loading}>
                            {loading ? 'Salvando...' : (isEditing ? 'Atualizar Usuário' : 'Criar Usuário')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default FuncionarioForm;