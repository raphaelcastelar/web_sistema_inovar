import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    HomeIcon, 
    UserGroupIcon, 
    ClockIcon, 
    DocumentArrowDownIcon,
    DocumentMagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon,
    BuildingOfficeIcon
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade.png';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
        window.location.reload(); 
    };

    return (
        // Container principal fixo com flexbox em coluna
        <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col">
            
            {/* Seção do Logo (topo) */}
            <div className="flex-shrink-0 flex justify-center py-8">
                <img
                    src={LogoContabilidade}
                    alt="Logo Contabilidade"
                    className="h-24 w-auto"
                />
            </div>

            {/* Seção dos Links de Navegação (ocupa o espaço restante) */}
            <nav className="flex-grow w-full flex flex-col space-y-2 px-2">
                <Link
                    to="/"
                    // --- CORREÇÃO AQUI ---
                    // Mudado de .startsWith('/') para uma comparação exata === '/'
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname === '/' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <HomeIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Início</span>
                </Link>
                
                <Link
                    to="/empresas"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname.startsWith('/empresas') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <BuildingOfficeIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Empresas</span>
                </Link>

                <Link
                    to="/empresas"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname.startsWith('/gerenciar-empresas') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <BuildingOfficeIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Gerenciar Empresas</span>
                </Link>

                <Link
                    to="/gerenciar-usuarios"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname.startsWith('/gerenciar-usuarios') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <UserGroupIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Usuários</span>
                </Link>
                
                <Link
                    to="/historico-whatsapp"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname === '/historico-whatsapp' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <ClockIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Histórico</span>
                </Link>

                <Link
                    to="/gerar-das"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname === '/gerar-das' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <DocumentArrowDownIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Gerar DAS</span>
                </Link>

                <Link
                    to="/consultar-extrato"
                    className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                        location.pathname === '/consultar-extrato' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <DocumentMagnifyingGlassIcon className="h-6 w-6" />
                    <span className="text-base font-medium">Consultar Extrato</span>
                </Link>
            </nav>

            {/* Seção do Rodapé da Navbar (com Tema e Sair) */}
            <div className="w-full flex-shrink-0 p-4 space-y-2 border-t border-indigo-800/50">
                <ThemeToggle />
                <button
                    onClick={handleLogout}
                    className="flex items-center w-full space-x-2 px-4 py-2 text-sm text-red-300 hover:bg-red-800/50 hover:text-white rounded-md transition-colors duration-200"
                >
                    <ArrowLeftOnRectangleIcon className="h-6 w-6" />
                    <span className="font-medium">Sair</span>
                </button>
            </div>
        </div>
    );
};

export default Navbar;