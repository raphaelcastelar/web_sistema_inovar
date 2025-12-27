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
    DocumentChartBarIcon,
    ChartBarIcon,
    ExclamationTriangleIcon,
    BanknotesIcon
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
        // Verifica se a rota atual é exatamente igual à rota do link
        const isExactMatch = location.pathname === to;

        // Tratamento especial para "Empresas" e "Gerenciar Empresas"
        const isEmpresasActive = location.pathname === '/empresas';
        const isGerenciarActive = location.pathname === '/empresas/gerenciar';

        // Define se o link está ativo com base no texto e na rota
        const isActive = (text === 'Empresas' && isEmpresasActive) ||
            (text === 'Gerenciar Empresas' && isGerenciarActive) ||
            (text !== 'Empresas' && text !== 'Gerenciar Empresas' && isExactMatch);

        return (
            <Link
                to={to}
                className={`flex items-center space-x-4 px-4 py-3 text-indigo-200 rounded-md hover:bg-indigo-700 hover:text-white transition-colors duration-200 ${isActive ? 'bg-indigo-800 text-white shadow-inner' : ''
                    }`}
            >
                <Icon className="h-6 w-6 flex-shrink-0" />
                <span className="text-base font-medium">{text}</span>
            </Link>
        );
    };

    return (
        <div className="fixed left-0 top-0 h-screen w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col">
            <div className="flex-shrink-0 flex justify-center py-8">
                <img
                    src={LogoContabilidade}
                    alt="Logo Contabilidade"
                    className="h-24 w-auto"
                />
            </div>

            <nav className="flex-grow w-full flex flex-col space-y-1 px-2 overflow-y-auto">
                <NavLink to="/" icon={HomeIcon} text="Início" />
                <NavLink to="/empresas" icon={BuildingOfficeIcon} text="Empresas" />
                <NavLink to="/gerenciar-usuarios" icon={UserGroupIcon} text="Usuários" />
                <NavLink to="/gerenciar-atribuicoes" icon={Cog6ToothIcon} text="Gerenciar Atribuicoes" />
                <NavLink to="/empresas/gerenciar" icon={ChartBarIcon} text="Gerenciar Empresas" />

                <div className="px-4 pt-4 pb-2">
                    <span className="text-xs font-semibold text-indigo-400 uppercase">Serviços</span>
                </div>

                <NavLink to="/central-simples" icon={DocumentChartBarIcon} text="Central do Simples" />
                <NavLink to="/gerar-boleto" icon={BanknotesIcon} text="Gerar Boleto" />
                <NavLink to="/pendencias" icon={ExclamationTriangleIcon} text="Pendências" />
                <NavLink to="/historico-whatsapp" icon={ClockIcon} text="Histórico" />
                <NavLink to="/gerenciar-boleto" icon={BanknotesIcon} text="Gerenciar Boleto" />
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