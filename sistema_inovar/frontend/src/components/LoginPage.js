import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance'; // Certifique-se que o caminho está correto
import { motion } from 'framer-motion';
import { UserIcon, LockClosedIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade.png'; // Verifique se este caminho está correto

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axiosInstance.post('/api/token/', {
                username: username,
                password: password,
            });
            
            localStorage.setItem('authTokens', JSON.stringify(response.data));
            
            navigate('/empresas');
            window.location.reload(); 
            
        } catch (err) {
            console.error("Erro no login:", err.response?.data);
            setError('Usuário ou senha inválidos. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-900 to-slate-900 px-4">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md p-8 md:p-10 space-y-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-700"
            >
                <div className="flex flex-col items-center">
                    <img src={LogoContabilidade} alt="Logo da Contabilidade" className="w-32 h-auto mb-4"/>
                    <h2 className="text-2xl font-bold text-center text-gray-100">Acesso ao Sistema</h2>
                    <p className="text-sm text-center text-gray-400">Bem-vindo(a)! Faça o login para continuar.</p>
                </div>

                <form onSubmit={handleLogin} className="mt-8 space-y-6">
                    <div className="relative">
                        <UserIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-4 transform -translate-y-1/2" />
                        <input
                            id="username"
                            name="username"
                            type="text"
                            autoComplete="username"
                            required
                            className="w-full p-3 pl-12 bg-gray-700/50 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                            placeholder="Nome de Usuário"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div className="relative">
                        <LockClosedIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-4 transform -translate-y-1/2" />
                        <input
                            id="password"
                            name="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            className="w-full p-3 pl-12 pr-12 bg-gray-700/50 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
                            placeholder="Senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute top-1/2 right-4 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        >
                            {showPassword ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
                        </button>
                    </div>

                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                "Entrar"
                            )}
                        </button>
                    </div>
                </form>
                
                <div className="text-center">
                    <a href="/#" className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                        Esqueceu sua senha?
                    </a>
                </div>
            </motion.div> {/* <-- A TAG </motion.div> QUE FALTAVA FOI ADICIONADA AQUI */}
        </div>
    );
};

export default LoginPage;