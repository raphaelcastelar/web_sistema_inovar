import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { UserIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade.png';

// Importe e configure o fundo de partículas
import Particles from "@tsparticles/react"; // <-- NOME CORRETO
import { loadSlim } from "@tsparticles/slim";
import particlesConfig from '../config/particlesConfig'; // Vamos criar este arquivo

const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    // Configuração do tsparticles
    const particlesInit = useCallback(async (engine) => {
        await loadSlim(engine);
    }, []);

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
            navigate('/');
            window.location.reload();
            
        } catch (err) {
            console.error("Erro no login:", err.response?.data);
            setError('Usuário ou senha inválidos. Tente novamente.');
        } finally {
            setLoading(false);
        }
    };
    
    // Variantes para animação escalonada com Framer Motion
    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };
    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: { y: 0, opacity: 1 }
    };

    return (
        <div className="relative flex items-center justify-center min-h-screen bg-slate-900 overflow-hidden">
            {/* Componente de Partículas para o fundo animado */}
            <Particles
                id="tsparticles"
                init={particlesInit}
                options={particlesConfig}
                className="absolute inset-0 z-0"
            />
            
            {/* Card de Login com efeito Glassmorphism */}
            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="relative z-10 w-full max-w-md p-8 space-y-6 bg-gray-800/60 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-700"
            >
                <motion.div variants={itemVariants} className="flex flex-col items-center">
                    <img src={LogoContabilidade} alt="Logo da Contabilidade" className="w-32 h-auto mb-4"/>
                    <h2 className="text-3xl font-bold text-center text-white">Bem-Vindo(a) de Volta</h2>
                    <p className="text-md text-center text-gray-400">Acesse sua conta para continuar</p>
                </motion.div>

                <form onSubmit={handleLogin} className="mt-8 space-y-6">
                    <motion.div variants={itemVariants} className="relative">
                        <UserIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-4 transform -translate-y-1/2" />
                        <input
                            id="username"
                            type="text"
                            autoComplete="username"
                            required
                            className="w-full p-3 pl-12 bg-gray-700/50 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300"
                            placeholder="Nome de Usuário"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </motion.div>

                    <motion.div variants={itemVariants} className="relative">
                        <LockClosedIcon className="h-5 w-5 text-gray-400 absolute top-1/2 left-4 transform -translate-y-1/2" />
                        <input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            required
                            className="w-full p-3 pl-12 pr-12 bg-gray-700/50 text-white rounded-md border border-gray-600 focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-300"
                            placeholder="Senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute top-1/2 right-4 transform -translate-y-1/2 text-gray-400 hover:text-gray-200">
                            {showPassword ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/>}
                        </button>
                    </motion.div>

                    {error && <motion.p variants={itemVariants} className="text-sm text-red-400 text-center">{error}</motion.p>}

                    <motion.div variants={itemVariants}>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full flex justify-center items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : (
                                <>
                                    Entrar
                                    <ArrowRightOnRectangleIcon className="h-5 w-5"/>
                                </>
                            )}
                        </button>
                    </motion.div>
                </form>
            </motion.div>
        </div>
    );
};

export default LoginPage;