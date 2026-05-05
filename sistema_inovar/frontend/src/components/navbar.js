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
    ChevronDownIcon,
    Bars3Icon,
    XMarkIcon,
    MagnifyingGlassIcon,
    Squares2X2Icon,
    DocumentArrowDownIcon,
    FolderOpenIcon,
    ShieldCheckIcon,
    CurrencyDollarIcon,
    PencilSquareIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import LogoContabilidade from '../assets/logo_contabilidade2.png';
import ThemeToggle from './ThemeToggle';
import axiosInstance from '../api/axiosInstance';

const navigationSections = [
    {
        title: 'Visão geral',
        description: 'Painel e tarefas do dia',
        items: [
            { to: '/', icon: HomeIcon, text: 'Início', keywords: 'dashboard painel resumo' },
            { to: '/gerenciamento-integrado', icon: Squares2X2Icon, text: 'Gestão Integrada', keywords: 'gestao gerenciamento integrado empresas tarefas' },
            { to: '/pendencias', icon: ExclamationTriangleIcon, text: 'Pendências', keywords: 'alertas vencimentos tarefas' },
        ],
    },
    {
        title: 'Cadastros',
        description: 'Empresas, usuários e pastas',
        items: [
            { to: '/empresas', icon: BuildingOfficeIcon, text: 'Empresas', match: ['/empresas'], keywords: 'clientes cadastro pastas documentos' },
            { to: '/gerenciar-usuarios', icon: UserGroupIcon, text: 'Usuários', match: ['/gerenciar-usuarios'], keywords: 'funcionarios equipe colaboradores' },
            { to: '/gerenciar-atribuicoes', icon: Cog6ToothIcon, text: 'Atribuições', keywords: 'responsaveis tarefas distribuicao' },
        ],
    },
    {
        title: 'Simples Nacional',
        description: 'DAS, extrato e acompanhamento',
        items: [
            { to: '/central-simples', icon: DocumentChartBarIcon, text: 'Central do Simples', keywords: 'simples nacional central apuracao' },
            { to: '/gerar-das', icon: DocumentArrowDownIcon, text: 'Gerar DAS', keywords: 'guia imposto download' },
            { to: '/consultar-extrato', icon: ShieldCheckIcon, text: 'Consultar Extrato', keywords: 'extrato consulta serpro declaracao' },
        ],
    },
    {
        title: 'Financeiro',
        description: 'Boletos, honorários, faturamento e pró-labore',
        items: [
            { to: '/monitor-boletos', icon: ClipboardDocumentCheckIcon, text: 'Monitor Boletos', keywords: 'acompanhar cobrancas pagamentos' },
            { to: '/boletos-por-empresa', icon: FolderOpenIcon, text: 'Boletos por Empresa', keywords: 'cliente empresa boletos' },
            { to: '/calculadora-honorarios', icon: CalculatorIcon, text: 'Honorários', keywords: 'calculo honorarios mensalidade' },
            { to: '/relacao-faturamento', icon: CurrencyDollarIcon, text: 'Faturamento', keywords: 'relacao faturamento receita' },
            { to: '/gerar-pro-labore', icon: DocumentTextIcon, text: 'Pró-labore PDF', keywords: 'pro labore documento pdf socios' },
        ],
    },
    {
        title: 'Comunicação',
        description: 'Histórico e mensagens',
        items: [
            { to: '/historico-whatsapp', icon: ClockIcon, text: 'Histórico WhatsApp', keywords: 'mensagens whatsapp envios' },
        ],
    },
];

const defaultQuickActionIds = ['nova-empresa', 'gerar-das', 'monitor-boletos'];

const quickActionOptions = [
    { id: 'nova-empresa', to: '/empresas/cadastrar', icon: BuildingOfficeIcon, label: 'Nova empresa' },
    { id: 'gerar-das', to: '/gerar-das', icon: DocumentArrowDownIcon, label: 'DAS' },
    { id: 'pendencias', to: '/pendencias', icon: ExclamationTriangleIcon, label: 'Pendências' },
    { id: 'monitor-boletos', to: '/monitor-boletos', icon: ClipboardDocumentCheckIcon, label: 'Boletos' },
    { id: 'boletos-empresa', to: '/boletos-por-empresa', icon: FolderOpenIcon, label: 'Por empresa' },
    { id: 'honorarios', to: '/calculadora-honorarios', icon: CalculatorIcon, label: 'Honorários' },
    { id: 'faturamento', to: '/relacao-faturamento', icon: CurrencyDollarIcon, label: 'Faturamento' },
    { id: 'pro-labore', to: '/gerar-pro-labore', icon: DocumentTextIcon, label: 'Pró-labore' },
];

const normalizeQuickActionIds = (actionIds) => {
    const availableIds = new Set(quickActionOptions.map((action) => action.id));
    const uniqueIds = [];

    (Array.isArray(actionIds) ? actionIds : []).forEach((id) => {
        if (availableIds.has(id) && !uniqueIds.includes(id)) {
            uniqueIds.push(id);
        }
    });

    defaultQuickActionIds.forEach((id) => {
        if (uniqueIds.length < 3 && !uniqueIds.includes(id)) {
            uniqueIds.push(id);
        }
    });

    return uniqueIds.slice(0, 3);
};

const Navbar = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isShortcutEditorOpen, setIsShortcutEditorOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentUser, setCurrentUser] = useState(null);
    const activeSectionTitle = navigationSections.find((section) =>
        section.items.some((item) => isItemActive(location.pathname, item))
    )?.title;
    const [openSections, setOpenSections] = useState(() =>
        navigationSections.reduce((acc, section) => ({ ...acc, [section.title]: true }), {})
    );

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const userStorageKey = currentUser
        ? `inovar.quickActions.${currentUser.id || currentUser.username}`
        : 'inovar.quickActions.anonymous';
    const [selectedQuickActionIds, setSelectedQuickActionIds] = useState(defaultQuickActionIds);

    const sectionsToRender = useMemo(() => {
        if (!normalizedSearch) {
            return navigationSections;
        }

        return navigationSections
            .map((section) => ({
                ...section,
                items: section.items.filter((item) =>
                    `${item.text} ${item.keywords || ''}`.toLowerCase().includes(normalizedSearch)
                ),
            }))
            .filter((section) => section.items.length > 0);
    }, [normalizedSearch]);

    const selectedQuickActions = useMemo(() => {
        const optionsById = new Map(quickActionOptions.map((action) => [action.id, action]));
        return selectedQuickActionIds
            .map((id) => optionsById.get(id))
            .filter(Boolean)
            .slice(0, 3);
    }, [selectedQuickActionIds]);

    const userDisplayName = useMemo(() => {
        if (!currentUser) return 'Usuário';
        const fullName = `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim();
        return fullName || currentUser.username || 'Usuário';
    }, [currentUser]);

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

    useEffect(() => {
        try {
            const storedActions = localStorage.getItem(userStorageKey);
            if (!storedActions) {
                setSelectedQuickActionIds(defaultQuickActionIds);
                return;
            }

            setSelectedQuickActionIds(normalizeQuickActionIds(JSON.parse(storedActions)));
        } catch (error) {
            console.warn('Falha ao carregar atalhos salvos. Usando atalhos padrão.', error);
            setSelectedQuickActionIds(defaultQuickActionIds);
        }
    }, [userStorageKey]);

    const handleLogout = () => {
        localStorage.removeItem('authTokens');
        navigate('/login');
    };

    const toggleSection = (sectionTitle) => {
        setOpenSections((current) => ({
            ...current,
            [sectionTitle]: !current[sectionTitle],
        }));
    };

    const closeMobileMenu = () => setIsMobileOpen(false);

    const handleQuickActionToggle = (actionId) => {
        setSelectedQuickActionIds((current) => {
            let nextActions;

            if (current.includes(actionId)) {
                nextActions = current;
            } else if (current.length < 3) {
                nextActions = [...current, actionId];
            } else {
                nextActions = [...current.slice(1), actionId];
            }

            nextActions = normalizeQuickActionIds(nextActions);
            localStorage.setItem(userStorageKey, JSON.stringify(nextActions));
            return nextActions;
        });
    };

    const NavLink = ({ item }) => {
        const Icon = item.icon;
        const isActive = isItemActive(location.pathname, item);
        return (
            <Link
                to={item.to}
                onClick={closeMobileMenu}
                className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
                    isActive
                        ? 'bg-white text-indigo-950 shadow-lg shadow-indigo-950/20'
                        : 'text-indigo-100 hover:bg-white/10 hover:text-white'
                }`}
            >
                <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${
                    isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-white/10 text-indigo-100 group-hover:bg-white/15'
                }`}>
                    <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.text}</span>
            </Link>
        );
    };

    const sidebar = (
        <aside className="flex h-full w-72 flex-col bg-gradient-to-b from-indigo-900 to-gray-800 text-white shadow-2xl">
            <div className="flex-shrink-0 border-b border-indigo-800/60 p-5">
                <div className="flex items-center gap-3">
                    <img src={LogoContabilidade} alt="Logo Contabilidade" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold uppercase tracking-wide text-indigo-200">Sistema Inovar</p>
                        <p className="truncate text-xs text-indigo-300">{activeSectionTitle || 'Organização contábil'}</p>
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-indigo-700/60 bg-indigo-950/35 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-300">Usuário</p>
                    <p className="truncate text-sm font-semibold text-white">{userDisplayName}</p>
                </div>

                <div className="mt-5 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-300">Atalhos</span>
                    <button
                        type="button"
                        onClick={() => setIsShortcutEditorOpen((current) => !current)}
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-100 transition-colors hover:bg-indigo-700/70 hover:text-white"
                    >
                        {isShortcutEditorOpen ? <CheckIcon className="h-4 w-4" /> : <PencilSquareIcon className="h-4 w-4" />}
                        {isShortcutEditorOpen ? 'Ok' : 'Editar'}
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                    {selectedQuickActions.map((action) => {
                        const Icon = action.icon;
                        return (
                            <Link
                                key={action.id}
                                to={action.to}
                                onClick={closeMobileMenu}
                                title={action.label}
                                className="flex h-16 flex-col items-center justify-center gap-1 rounded-lg bg-indigo-800/60 px-2 text-center text-[11px] font-medium text-indigo-100 transition-colors hover:bg-indigo-700 hover:text-white"
                            >
                                <Icon className="h-5 w-5" />
                                <span className="w-full truncate">{action.label}</span>
                            </Link>
                        );
                    })}
                </div>

                {isShortcutEditorOpen && (
                    <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-indigo-700/60 bg-indigo-950/35 p-2">
                        {quickActionOptions.map((action) => {
                            const Icon = action.icon;
                            const isSelected = selectedQuickActionIds.includes(action.id);
                            return (
                                <button
                                    key={action.id}
                                    type="button"
                                    onClick={() => handleQuickActionToggle(action.id)}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs transition-colors ${
                                        isSelected
                                            ? 'bg-white text-indigo-950'
                                            : 'text-indigo-100 hover:bg-indigo-700/70 hover:text-white'
                                    }`}
                                >
                                    <Icon className="h-4 w-4 flex-shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">{action.label}</span>
                                    {isSelected && <CheckIcon className="h-4 w-4 flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                )}

                <label className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-700/60 bg-indigo-950/35 px-3 py-2 text-indigo-100 focus-within:border-indigo-300">
                    <MagnifyingGlassIcon className="h-5 w-5 flex-shrink-0 text-indigo-200" />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Buscar função"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-indigo-200/70 outline-none"
                    />
                </label>
            </div>

            <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                {sectionsToRender.length === 0 ? (
                    <div className="rounded-lg border border-indigo-700/60 bg-indigo-950/35 p-4 text-sm text-indigo-100">
                        Nenhuma funcionalidade encontrada.
                    </div>
                ) : sectionsToRender.map((section) => {
                    const hasActiveItem = section.items.some((item) => isItemActive(location.pathname, item));
                    const isOpen = normalizedSearch || openSections[section.title] || hasActiveItem;

                    return (
                        <section key={section.title} className="rounded-xl border border-indigo-800/60 bg-indigo-950/25 p-2">
                            <button
                                type="button"
                                onClick={() => toggleSection(section.title)}
                                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-indigo-100 transition-colors hover:bg-indigo-700/60 hover:text-white"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-bold uppercase tracking-wide">{section.title}</span>
                                    <span className="block truncate text-[11px] text-indigo-300">{section.description}</span>
                                </span>
                                <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isOpen && (
                                <div className="mt-1 space-y-1">
                                    {section.items.map((item) => (
                                        <NavLink key={item.to} item={item} />
                                    ))}
                                </div>
                            )}
                        </section>
                    );
                })}
            </nav>

            <div className="flex-shrink-0 space-y-2 border-t border-indigo-800/60 p-4">
                <ThemeToggle />
                <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-200 transition-colors duration-200 hover:bg-red-500/20 hover:text-white"
                >
                    <ArrowLeftOnRectangleIcon className="h-5 w-5" />
                    <span>Sair</span>
                </button>
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
                    <img src={LogoContabilidade} alt="Logo Contabilidade" className="h-9 w-9 rounded-md object-contain" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Sistema Inovar</span>
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
                    <div className="relative h-full w-72 max-w-[86vw]">
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
