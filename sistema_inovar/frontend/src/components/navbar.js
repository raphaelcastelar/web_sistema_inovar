import React, { useEffect, useState } from 'react';
// Adicione useNavigate para o redirecionamento do logout
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    HomeIcon, 
    UserGroupIcon, 
    ClockIcon, 
    DocumentArrowDownIcon,
    DocumentMagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon // Ícone para o botão "Sair"
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade.png';

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate(); // Hook para navegação
    const [selectedItem, setSelectedItem] = useState(location.pathname);

    useEffect(() => {
        setSelectedItem(location.pathname);
    }, [location.pathname]);

    // --- INÍCIO: Lógica de Logout ---
    const handleLogout = () => {
        // Remove os tokens de autenticação do armazenamento local
        localStorage.removeItem('authTokens');
        // Redireciona para a página de login
        navigate('/login');
        // Opcional: recarregar a página para limpar completamente o estado da aplicação
        // window.location.reload(); 
    };
    // --- FIM: Lógica de Logout ---

    return (
        <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col items-center py-8">
            <img
                src={LogoContabilidade}
                alt="Logo Contabilidade"
                className="h-24 w-auto max-w-48 object-contain mb-10"
            />
            {/* Itens de Navegação Principais */}
            <div className="w-full flex-grow flex flex-col space-y-2">
                <Link
                    to="/empresas"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        location.pathname.startsWith('/empresas') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <HomeIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Início</span>
                </Link>
                
                <Link
                    to="/gerenciar-usuarios"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        location.pathname.startsWith('/gerenciar-usuarios') ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <UserGroupIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Usuários</span>
                </Link>
                
                <Link
                    to="/historico-whatsapp"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        location.pathname === '/historico-whatsapp' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <ClockIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Histórico</span>
                </Link>

                <Link
                    to="/gerar-das"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        location.pathname === '/gerar-das' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <DocumentArrowDownIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Gerar DAS</span>
                </Link>

                <Link
                    to="/consultar-extrato"
                    className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
                        location.pathname === '/consultar-extrato' ? 'bg-indigo-800 text-white' : ''
                    }`}
                >
                    <DocumentMagnifyingGlassIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Consultar Extrato</span>
                </Link>
            </div>

            {/* --- INÍCIO: Botão de Sair no final da Navbar --- */}
            {/* 'mt-auto' empurra este item para o final do container flex */}
            <div className="w-full mt-auto">
                <button
                    onClick={handleLogout}
                    className="flex items-center space-x-4 px-6 py-3 text-red-400 hover:bg-red-800 hover:text-white transition-all duration-300 w-full"
                >
                    <ArrowLeftOnRectangleIcon className="h-7 w-7" />
                    <span className="text-base font-medium">Sair</span>
                </button>
            </div>
            {/* --- FIM: Botão de Sair --- */}
        </div>
    );
};

export default Navbar;