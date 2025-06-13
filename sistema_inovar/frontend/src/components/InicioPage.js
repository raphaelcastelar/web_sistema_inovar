import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { UsersIcon, ClockIcon, ExclamationTriangleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

ChartJS.register(ArcElement, Tooltip, Legend);

const StatCard = ({ icon: Icon, title, value, color }) => {
    if (!Icon || typeof Icon !== 'function') {
        console.error(`Ícone inválido para o título: ${title}`, Icon);
        return <div className="p-6 text-red-500">Erro: Ícone inválido para {title}</div>;
    }

    return (
        <motion.div
            variants={{ hidden: { scale: 0.8, opacity: 0 }, visible: { scale: 1, opacity: 1 } }}
            className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 flex items-center space-x-4"
        >
            <div className={`p-3 rounded-full ${color}`}>
                <Icon className="h-7 w-7 text-white" />
            </div>
            <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? '...'}</p>
            </div>
        </motion.div>
    );
};

const InicioPage = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const response = await axiosInstance.get('/api/dashboard-summary/');
                console.log('Dados do Dashboard:', response.data);
                setData(response.data);
            } catch (err) {
                const errorMessage = err.response?.data?.error || "Não foi possível carregar os dados do dashboard.";
                setError(errorMessage);
                console.error("Erro ao carregar dados:", err.response || err);
            } finally {
                setLoading(false);
            }
        };
        fetchDashboardData();
    }, []);

    const chartData = {
        labels: data?.chart_data?.labels || ['Exemplo Concluído', 'Exemplo Pendente'],
        datasets: [
            {
                data: data?.chart_data?.data || [8, 2],
                backgroundColor: ['#22c55e', '#ef4444', '#64748b'],
                borderColor: 'transparent',
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
                labels: {
                    color: document.documentElement.classList.contains('dark') ? 'white' : '#374151',
                },
            },
        },
        cutout: '70%',
    };

    if (loading) return <div className="p-8 text-center">Carregando...</div>;
    if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
    if (!data) return <div className="p-8 text-center">Nenhum dado para exibir.</div>;

    const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } };
    const itemVariants = { hidden: { y: -20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

    return (
        <motion.div initial="hidden" animate="visible" variants={containerVariants} className="p-6 md:p-8">
            <motion.h1 variants={itemVariants} className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8">Dashboard</motion.h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatCard icon={UsersIcon} title="Total de Clientes" value={data.kpis.total_clientes ?? 0} color="bg-blue-500" />
                <StatCard icon={ClockIcon} title="Tarefas Pendentes (Total)" value={data.kpis.tarefas_pendentes ?? 0} color="bg-yellow-500" />
                <StatCard icon={ExclamationTriangleIcon} title="Vencendo em 7 dias" value={data.kpis.vencendo_em_7_dias ?? 0} color="bg-red-500" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <motion.div variants={itemVariants} className="lg:col-span-2 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Próximas Obrigações a Vencer</h2>
                    <div className="space-y-4">
                        {data.proximas_tarefas.length > 0 ? (
                            data.proximas_tarefas.map((tarefa) => (
                                <motion.div
                                    key={tarefa.id}
                                    variants={itemVariants}
                                    className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-between"
                                >
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-gray-100">{tarefa.titulo}</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">{tarefa.empresa_nome}</p>
                                    </div>
                                    <p className="font-mono text-sm text-red-500 dark:text-red-400 font-semibold">{tarefa.data_vencimento}</p>
                                </motion.div>
                            ))
                        ) : (
                            <p className="text-gray-500 dark:text-gray-400 text-center py-8">Nenhuma tarefa pendente próxima.</p>
                        )}
                    </div>
                </motion.div>
                <div className="space-y-8">
                    <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4 text-center">Status Simples ({data.chart_data.periodo})</h2>
                        <div className="h-64 relative">
                            <Doughnut data={chartData} options={chartOptions} />
                        </div>
                    </motion.div>
                    <motion.div variants={itemVariants} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Acesso Rápido</h2>
                        <div className="space-y-3">
                            <Link
                                to="/gerar-das"
                                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <span>Gerar Guia DAS</span>
                                <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                            </Link>
                            <Link
                                to="/consultar-extrato"
                                className="w-full flex justify-between items-center p-3 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <span>Consultar Extrato</span>
                                <ArrowRightIcon className="h-5 w-5 text-gray-400" />
                            </Link>
                        </div>
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
};

const SimplesStatusChart = () => {
    const [chartData, setChartData] = useState(null);

    useEffect(() => {
        axiosInstance.get('/api/dashboard/status-simples/')
            .then(response => {
                const data = response.data;
                setChartData({
                    labels: data.labels,
                    datasets: [{
                        data: data.data,
                        backgroundColor: ['#22c55e', '#ef4444', '#64748b'], // Verde, Vermelho, Cinza
                        borderColor: 'transparent',
                    }]
                });
            });
    }, []);

    if (!chartData) return <div className="h-64 flex items-center justify-center">Carregando dados do gráfico...</div>;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white mb-4">Status do Simples Nacional (Mês Anterior)</h2>
            <div className="h-64 relative">
                <Doughnut data={chartData} options={{ maintainAspectRatio: false, /* ...outras opções... */ }} />
            </div>
        </div>
    );
};

export default InicioPage;