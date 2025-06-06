// src/pages/FuncionarioList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance'; // Use a instância customizada!
import { UserPlusIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';

const FuncionarioList = () => {
    const [funcionarios, setFuncionarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchFuncionarios = () => {
        setLoading(true);
        axiosInstance.get('/api/funcionarios/')
            .then(response => {
                setFuncionarios(response.data);
            })
            .catch(err => {
                console.error("Erro ao buscar funcionários:", err);
                setError("Não foi possível carregar os usuários. Verifique se você tem permissão de administrador.");
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchFuncionarios();
    }, []);

    const handleDelete = (id) => {
        if (window.confirm('Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.')) {
            axiosInstance.delete(`/api/funcionarios/${id}/`)
                .then(() => {
                    alert('Usuário excluído com sucesso!');
                    fetchFuncionarios(); // Atualiza a lista
                })
                .catch(err => {
                    console.error("Erro ao excluir usuário:", err);
                    alert('Falha ao excluir o usuário.');
                });
        }
    };

    if (loading) return <p className="p-8 text-center text-gray-400">Carregando usuários...</p>;
    if (error) return <p className="p-8 text-center text-red-500">{error}</p>;

    return (
        <div className="p-6 md:p-10 bg-gray-900 min-h-screen">
            <div className="flex justify-between items-center mb-8">
                <h1 className="text-3xl font-bold text-indigo-400">Gerenciamento de Usuários</h1>
                <Link to="/gerenciar-usuarios/novo" className="flex items-center bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-500 transition-colors">
                    <UserPlusIcon className="h-5 w-5 mr-2" />
                    Novo Usuário
                </Link>
            </div>
            <div className="bg-gray-800 shadow-xl rounded-lg overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-gray-750">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Usuário</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {funcionarios.map(func => (
                            <tr key={func.id} className="hover:bg-gray-700">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{`${func.first_name} ${func.last_name}`}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{func.username}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{func.email}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${func.is_active ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                                        {func.is_active ? 'Ativo' : 'Inativo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                    <Link to={`/gerenciar-usuarios/editar/${func.id}`} className="text-indigo-400 hover:text-indigo-300 inline-block p-1" title="Editar">
                                        <PencilSquareIcon className="h-5 w-5" />
                                    </Link>
                                    <button onClick={() => handleDelete(func.id)} className="text-red-500 hover:text-red-400 inline-block p-1" title="Excluir">
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default FuncionarioList;