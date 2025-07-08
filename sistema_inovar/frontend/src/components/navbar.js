import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
    HomeIcon, 
    UserGroupIcon, 
    ClockIcon, 
    DocumentArrowDownIcon,
    DocumentMagnifyingGlassIcon,
    ArrowLeftOnRectangleIcon,
    BuildingOfficeIcon,
    Cog6ToothIcon,
    DocumentCheckIcon,
    ExclamationTriangleIcon // Adicione esta importação
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade.png';
import ThemeToggle from './ThemeToggle';

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
    };

    const NavLink = ({ to, icon: Icon, text }) => {
        const isActive = (to === "/") 
            ? location.pathname === "/" 
            : location.pathname.startsWith(to);
        
        return (
            <Link
                to={to}
                className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${
                    isActive ? 'bg-indigo-800 text-white shadow-inner' : ''
                }`}
            >
                <Icon className="h-6 w-6 flex-shrink-0" />
                <span className="text-base font-medium">{text}</span>
            </Link>
        );
    };

    return (
        <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col">
            <div className="flex-shrink-0 flex justify-center py-8">
                <img
                    src={LogoContabilidade}
                    alt="Logo Contabilidade"
                    className="h-24 w-auto"
                />
            </div>

            <nav className="flex-grow w-full flex flex-col space-y-1 px-2">
                <NavLink to="/" icon={HomeIcon} text="Início" />
                <NavLink to="/empresas" icon={BuildingOfficeIcon} text="Empresas" />
                <NavLink to="/gerenciar-usuarios" icon={UserGroupIcon} text="Usuários" />
                <NavLink to="/gerenciar-empresas" icon={Cog6ToothIcon} text="Gerenciar Empresas" />
                
                <div className="px-4 pt-4 pb-2">
                    <span className="text-xs font-semibold text-indigo-400 uppercase">Serviços</span>
                </div>
                
                <NavLink to="/gerar-das" icon={DocumentArrowDownIcon} text="Gerar DAS" />
                <NavLink to="/consultar-extrato" icon={DocumentMagnifyingGlassIcon} text="Consultar Extrato" />
                <NavLink to="/declarar-das" icon={DocumentCheckIcon} text="Declarar DAS" />
                <NavLink to="/pendencias" icon={ExclamationTriangleIcon} text="Pendências" /> {/* Adicione esta linha */}
                <NavLink to="/historico-whatsapp" icon={ClockIcon} text="Histórico" />
            </nav>

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