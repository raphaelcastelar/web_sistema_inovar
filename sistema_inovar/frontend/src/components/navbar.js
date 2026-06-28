import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    HomeIcon,
    UserGroupIcon,
    ClockIcon,
    ArrowLeftOnRectangleIcon,
    BuildingOfficeIcon,
    Cog6ToothIcon,
    DocumentChartBarIcon,
    ExclamationTriangleIcon,
    ClipboardDocumentCheckIcon,
    DocumentTextIcon,
    CalculatorIcon,
    Bars3Icon,
    XMarkIcon,
    Squares2X2Icon,
    DocumentArrowDownIcon,
    FolderOpenIcon,
    ShieldCheckIcon,
    CurrencyDollarIcon,
    RocketLaunchIcon,
    BanknotesIcon,
    ChevronDownIcon,
    TableCellsIcon,
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade2.png';
import ThemeToggle from './ThemeToggle';
import axiosInstance from '../api/axiosInstance';

const navigationSections = [
    {
        title: 'Operação',
        icon: RocketLaunchIcon,
        items: [
            { to: '/', icon: HomeIcon, text: 'Dashboard', keywords: 'dashboard painel resumo' },
            { to: '/carteira-empresas', icon: BuildingOfficeIcon, text: 'Carteira', keywords: 'carteira empresas atribuidas operacao mensal' },
            { to: '/gerenciamento-integrado', icon: Squares2X2Icon, text: 'Gestão integrada', keywords: 'gestao gerenciamento integrado empresas tarefas' },
            { to: '/pendencias', icon: ExclamationTriangleIcon, text: 'Pendências', keywords: 'alertas vencimentos tarefas' },
            { to: '/empresas', icon: BuildingOfficeIcon, text: 'Empresas', match: ['/empresas'], keywords: 'clientes cadastro pastas documentos' },
        ],
    },
    {
        title: 'Fiscal',
        icon: ShieldCheckIcon,
        items: [
            { to: '/central-simples', icon: DocumentChartBarIcon, text: 'Central do Simples', keywords: 'simples nacional central apuracao' },
            { to: '/gerar-das', icon: DocumentArrowDownIcon, text: 'Gerar DAS', keywords: 'guia imposto download' },
            { to: '/consultar-extrato', icon: ShieldCheckIcon, text: 'Consultar extrato', keywords: 'extrato consulta serpro declaracao' },
        ],
    },
    {
        title: 'Financeiro',
        icon: BanknotesIcon,
        items: [
            { to: '/monitor-boletos', icon: ClipboardDocumentCheckIcon, text: 'Monitor boletos', keywords: 'acompanhar cobrancas pagamentos' },
            { to: '/boletos-por-empresa', icon: FolderOpenIcon, text: 'Boletos por empresa', keywords: 'cliente empresa boletos' },
            { to: '/inadimplencia-boletos', icon: ExclamationTriangleIcon, text: 'Inadimplência', keywords: 'inadimplencia boletos vencidos cobrancas' },
            { to: '/calculadora-honorarios', icon: CalculatorIcon, text: 'Honorários', keywords: 'calculo honorarios mensalidade' },
            { to: '/relacao-faturamento', icon: CurrencyDollarIcon, text: 'Faturamento', keywords: 'relacao faturamento receita' },
            { to: '/relatorios', icon: TableCellsIcon, text: 'Relatorios Excel', keywords: 'relatorios excel planilhas exportar banco dados' },
            { to: '/gerar-pro-labore', icon: DocumentTextIcon, text: 'Pró-labore PDF', keywords: 'pro labore documento pdf socios' },
        ],
    },
    {
        title: 'Administração',
        icon: Cog6ToothIcon,
        items: [
            { to: '/gerenciar-usuarios', icon: UserGroupIcon, text: 'Usuários', match: ['/gerenciar-usuarios'], keywords: 'funcionarios equipe colaboradores' },
            { to: '/gerenciar-atribuicoes', icon: Cog6ToothIcon, text: 'Atribuições', keywords: 'responsaveis tarefas distribuicao' },
            { to: '/historico-whatsapp', icon: ClockIcon, text: 'Histórico WhatsApp', keywords: 'mensagens whatsapp envios' },
        ],
    },
];

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [openSections, setOpenSections] = useState(() => (
        navigationSections.reduce((acc, section) => ({ ...acc, [section.title]: true }), {})
    ));

    const userDisplayName = useMemo(() => {
        if (!currentUser) return 'Usuário';
        const fullName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim();
        return fullName || currentUser.username || 'Usuário';
    }, [currentUser]);
    const userInitials = useMemo(() => (
        userDisplayName
            .split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join('')
            .toUpperCase() || 'U'
    ), [userDisplayName]);

    useEffect(() => {
        let isMounted = true;

        axiosInstance.get('/api/current-user/')
            .then((response) => {
                if (isMounted) {
                    setCurrentUser(response.data);
                }
            })
            .catch((error) => {
                console.warn('Não foi possível carregar o usuário atual para a navegação.', error);
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
    };

    const closeMobileMenu = () => setIsMobileOpen(false);

    const toggleSection = (sectionTitle) => {
        setOpenSections((current) => ({
            ...current,
            [sectionTitle]: !current[sectionTitle],
        }));
    };

    const NavLink = ({ item }) => {
        const Icon = item.icon;
        const isActive = isItemActive(location.pathname, item);

        return (
            <Link
                to={item.to}
                onClick={closeMobileMenu}
                className={`group relative flex h-8 items-center gap-2 overflow-hidden rounded-md p-2 text-sm font-medium transition-all ${
                    isActive
                        ? 'border border-slate-500/30 bg-slate-700/70 text-white shadow-inner shadow-white/5'
                        : 'text-slate-300 hover:bg-slate-700/45 hover:text-white'
                }`}
            >
                <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="min-w-0 flex-1 truncate">{item.text}</span>
            </Link>
        );
    };

    const sidebar = (
        <aside className="flex h-full w-64 flex-col overflow-hidden bg-[#0f1c29] text-white shadow-xl">
            <div className="flex min-h-16 flex-shrink-0 items-center border-b border-white/8 px-3 py-3">
                <img
                    src={LogoContabilidade}
                    alt="Sistema Inovar"
                    className="block h-auto max-h-20 w-[10.25rem] object-contain object-left"
                />
            </div>

            <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-2">
                {navigationSections.map((section) => {
                    const SectionIcon = section.icon;
                    const isOpen = openSections[section.title];
                    const hasActiveItem = section.items.some((item) => isItemActive(location.pathname, item));

                    return (
                        <section key={section.title} className="rounded-lg border border-slate-700/70 bg-slate-800/35 p-2">
                            <button
                                type="button"
                                onClick={() => toggleSection(section.title)}
                                className={`mb-1 flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-slate-700/45 ${
                                    hasActiveItem ? 'text-white' : 'text-slate-400'
                                }`}
                                aria-expanded={Boolean(isOpen)}
                            >
                                <SectionIcon className="h-4 w-4 flex-shrink-0 text-slate-400" />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-[0.12em]">{section.title}</span>
                                <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isOpen && (
                                <div className="space-y-1">
                                    {section.items.map((item) => (
                                        <NavLink key={item.to} item={item} />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </nav>

            <div className="flex-shrink-0 border-t border-white/8 p-2">
                <div className="rounded-lg border border-slate-700/70 bg-slate-800/35 p-2">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-slate-600/70 bg-[#0f1c29] text-sm font-bold text-slate-200">
                            {userInitials}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] leading-tight text-slate-400">Usuário ativo</p>
                            <p className="truncate text-sm font-semibold leading-5 text-white">{userDisplayName}</p>
                        </div>
                        <ThemeToggle />
                    </div>
                    <button
                        onClick={handleLogout}
                        className="mt-2 flex h-8 w-full items-center justify-center gap-2 rounded-md text-sm font-medium text-slate-300 transition-colors hover:bg-red-500/15 hover:text-white"
                    >
                        <ArrowLeftOnRectangleIcon className="h-4 w-4" />
                        <span>Sair</span>
                    </button>
                </div>
            </div>
        </aside>
    );

    return (
        <>
            <div className="fixed left-0 top-0 z-40 hidden h-screen lg:block">
                {sidebar}
            </div>

            <header className="fixed left-0 right-0 top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white/95 px-4 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 lg:hidden">
                <button
                    type="button"
                    onClick={() => setIsMobileOpen(true)}
                    className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800"
                    aria-label="Abrir menu"
                >
                    <Bars3Icon className="h-6 w-6" />
                </button>
                <div className="flex items-center gap-2">
                    <img src={LogoContabilidade} alt="Sistema Inovar" className="h-9 w-9 rounded-md object-contain" />
                    <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">Sistema Inovar</span>
                        <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{userDisplayName}</span>
                    </div>
                </div>
                <ThemeToggle />
            </header>

            {isMobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/60"
                        onClick={closeMobileMenu}
                        aria-label="Fechar menu"
                    />
                    <div className="relative h-full w-72 max-w-[88vw]">
                        {sidebar}
                        <button
                            type="button"
                            onClick={closeMobileMenu}
                            className="absolute right-3 top-3 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
                            aria-label="Fechar menu"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

const isItemActive = (pathname, item) => {
    if (item.to === '/') {
        return pathname === '/';
    }

    const matches = item.match || [item.to];
    return matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
};

export default Navbar;
