import React, { useState, useEffect } from 'react';
import { HomeIcon, UsersIcon, ClockIcon } from '@heroicons/react/24/outline'; // Adicione ClockIcon
import { ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { Link, useLocation, useNavigate } from 'react-router-dom'; // Adicione useLocation
import LogoContabilidade from '../assets/logo_contabilidade.png';
import axiosInstance from '../api/axiosInstance';

const Navbar = () => {
    // Usar useLocation para deixar a seleção de item mais robusta
    const navigate = useNavigate();
    const location = useLocation();
    const [selectedItem, setSelectedItem] = useState(location.pathname);

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
        window.location.reload();
    };

    // Atualiza o item selecionado quando a rota muda
    useEffect(() => {
        setSelectedItem(location.pathname);
    }, [location.pathname]);

    return (
        <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col items-center py-8">
            <img
                src={LogoContabilidade}
                alt="Logo Contabilidade"
                className="h-24 w-auto max-w-48 object-contain mb-10"
            />
            <div className="w-full flex flex-col space-y-2">
                <Link
                    to="/empresas"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        selectedItem === '/empresas' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <HomeIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Início</span>
                </Link>
                <Link
                    to="/empresas/cadastrar"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        selectedItem === '/empresas/cadastrar' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <UsersIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Cadastrar</span>
                </Link>
                
                {/* NOVO BOTÃO DE HISTÓRICO */}
                <Link
                    to="/historico-whatsapp"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        selectedItem === '/historico-whatsapp' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <ClockIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Histórico</span>
                </Link>

                <Link
                    to="/gerenciar-usuarios"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        selectedItem.startsWith('/gerenciar-usuarios') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <UserGroupIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Usuários</span>
                </Link>

                <button
                    onClick={handleLogout}
                    className="flex items-center space-x-4 px-6 py-3 text-red-400 hover:bg-red-700 hover:text-white transition-all duration-300 w-full mt-auto"
                >
                    <ArrowLeftOnRectangleIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Sair</span>
                </button>
            </div>
        </div>
    );
};

export default Navbar;