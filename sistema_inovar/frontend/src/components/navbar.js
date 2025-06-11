// src/components/navbar.js
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    HomeIcon, 
    BuildingOfficeIcon, // Novo ícone para Empresas
    UserGroupIcon, 
    ClockIcon, 
    DocumentArrowDownIcon,
    DocumentMagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon 
} from '@heroicons/react/24/outline';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
    };

    return (
        <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col">
            <div className="flex-shrink-0 flex justify-center py-8">
                {/* Você pode adicionar o logo aqui se desejar */}
            </div>
            <nav className="flex-grow w-full pt-4 flex flex-col space-y-2 px-2">
                {/* Link "Início" agora aponta para a raiz "/" */}
                <Link
                    to="/"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname === '/' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <HomeIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Início</span>
                </Link>
                
                {/* NOVO LINK DEDICADO PARA "EMPRESAS" */}
                <Link
                    to="/empresas"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname.startsWith('/empresas') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <BuildingOfficeIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Empresas</span>
                </Link>
                
                <Link to="/gerenciar-usuarios" className={`flex items-center ... ${location.pathname.startsWith('/gerenciar-usuarios') ? 'bg-indigo-800 text-white' : ''}`}>
                    <UserGroupIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Usuários</span>
                </Link>
                
                {/* ... Seus outros links (Histórico, Gerar DAS, etc.) ... */}

            </nav>
            <div className="w-full flex-shrink-0 p-4 space-y-2 border-t border-indigo-800/50">
                <ThemeToggle />
                <button onClick={handleLogout} className="flex items-center w-full space-x-2 px-4 py-2 text-sm text-red-300 hover:bg-red-800/50 hover:text-white rounded-md transition-colors">
                    <ArrowLeftOnRectangleIcon className="h-6 w-6" />
                    <span className="font-medium">Sair</span>
                </button>
            </div>
        </div>
    );
};

export default Navbar;