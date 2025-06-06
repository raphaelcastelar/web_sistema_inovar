// src/pages/LoginPage.js
import React, { useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = 'http://192.168.196.162:8000'; // Ajuste conforme necessário

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const response = await axiosInstance.post(`${API_BASE_URL}/api/token/`, {
                username: username,
                password: password,
            });
            
            // Login bem-sucedido!
            // Armazena os tokens no localStorage para uso futuro
            localStorage.setItem('authTokens', JSON.stringify(response.data));

            // Redireciona o usuário para a página principal
            navigate('/empresas');
            window.location.reload(); // Recarrega a página para que a navbar e outras partes da UI atualizem
            
        } catch (err) {
            console.error("Erro no login:", err.response?.data);
            setError('Usuário ou senha inválidos. Tente novamente.');
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-800 rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold text-center text-indigo-400">Login de Funcionário</h2>
                <form onSubmit={handleLogin} className="mt-8 space-y-6">
                    <div>
                        <label htmlFor="username" className="text-sm font-medium text-gray-300">Usuário</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            className="w-full p-3 mt-1 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="text-sm font-medium text-gray-300">Senha</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            className="w-full p-3 mt-1 bg-gray-700 text-white rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-red-500 text-center">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500"
                        >
                            Entrar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;