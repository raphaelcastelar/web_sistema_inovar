import React, { useEffect, useState } from 'react';
import {
    ArrowDownTrayIcon, ArrowPathIcon, DocumentChartBarIcon, EyeIcon, TableCellsIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../centralShared';
import { API, CabecalhoSecao, Feedback, Observacao, Vazio, baixar, erroApi } from './shared';

const GRUPOS = [
    ['Movimentação', [['documentos', 'Documentos por empresa'], ['compras_vendas', 'Compras e vendas'], ['servicos_prestados', 'Serviços prestados'],
        ['servicos_tomados', 'Serviços tomados'], ['transportes', 'Transportes']]],
    ['Participantes e itens', [['fornecedores', 'Fornecedores'], ['clientes', 'Clientes'], ['produtos', 'Produtos'], ['ncm', 'NCM'], ['cfop', 'CFOP'], ['tributos', 'Tributos destacados']]],
    ['Situação dos documentos', [['cancelados', 'Cancelados'], ['substituidos', 'Substituídos'], ['manifestacoes', 'Manifestações'], ['xmls_indisponiveis', 'XMLs indisponíveis']]],
    ['Operação', [['certificados', 'Certificados'], ['sincronizacoes', 'Sincronizações'], ['cobertura', 'Cobertura de captura por fonte']]],
];

const Relatorios = ({ ambiente }) => {
    const [tipo, setTipo] = useState('documentos');
    const [empresas, setEmpresas] = useState([]);
    const [filtros, setFiltros] = useState({ empresa: '', emissao_inicio: '', emissao_fim: '', ambiente: String(ambiente) });
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [feedback, setFeedback] = useState(null);

    useEffect(() => { axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {}); }, []);

    const params = () => Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
    const titulo = GRUPOS.flatMap(([, itens]) => itens).find(([v]) => v === tipo)?.[1];

    const visualizar = async (novoTipo = tipo) => {
        setCarregando(true);
        try {
            const { data } = await axiosInstance.get(`${API}/relatorios/${novoTipo}/`, { params: params() });
            setDados(data);
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
        setCarregando(false);
    };

    const escolher = (novo) => { setTipo(novo); setDados(null); };
    const exportar = (formato) => baixar(`${API}/relatorios/${tipo}/`, { ...params(), formato }, `monitor-fiscal-${tipo}.${formato}`)
        .catch(() => setFeedback({ tipo: 'erro', texto: 'Não foi possível exportar o relatório.' }));

    return (
        <div className="space-y-4">
            <CabecalhoSecao titulo="Relatórios fiscais" descricao="Gerados a partir dos documentos disponíveis na plataforma, respeitando cancelamentos e substituições." />
            <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="space-y-4">
                    <section className={`${cardClass} space-y-3 p-4`}>
                        <h3 className="text-sm font-semibold">Filtros</h3>
                        <label className="block"><span className={labelClass}>Empresa</span>
                            <select className={controlClass} value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })}>
                                <option value="">Todas as empresas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                            </select></label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block"><span className={labelClass}>Emissão de</span><input type="date" className={controlClass} value={filtros.emissao_inicio} onChange={(e) => setFiltros({ ...filtros, emissao_inicio: e.target.value })} /></label>
                            <label className="block"><span className={labelClass}>Até</span><input type="date" className={controlClass} value={filtros.emissao_fim} onChange={(e) => setFiltros({ ...filtros, emissao_fim: e.target.value })} /></label>
                        </div>
                        <label className="block"><span className={labelClass}>Ambiente fiscal</span>
                            <select className={controlClass} value={filtros.ambiente} onChange={(e) => setFiltros({ ...filtros, ambiente: e.target.value })}>
                                <option value="1">Produção</option><option value="2">Homologação</option>
                            </select></label>
                    </section>
                    <section className={`${cardClass} p-2`}>
                        {GRUPOS.map(([grupo, itens]) => (
                            <div key={grupo} className="py-1">
                                <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">{grupo}</p>
                                {itens.map(([valor, texto]) => (
                                    <button key={valor} type="button" onClick={() => escolher(valor)}
                                        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${tipo === valor ? 'bg-slate-900 font-semibold text-white dark:bg-slate-100 dark:text-slate-950' : 'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800'}`}>
                                        <DocumentChartBarIcon className="h-4 w-4 flex-shrink-0" /> {texto}
                                    </button>
                                ))}
                            </div>
                        ))}
                    </section>
                </aside>

                <section className={`${cardClass} min-w-0 p-4`}>
                    <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950"><TableCellsIcon className="h-5 w-5" /></span>
                            <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">Relatório</p><h3 className="text-lg font-semibold">{titulo}</h3></div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={secondaryButtonClass} onClick={() => visualizar()} disabled={carregando}>
                                {carregando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <EyeIcon className="h-4 w-4" />} Visualizar
                            </button>
                            <button type="button" className={secondaryButtonClass} onClick={() => exportar('csv')}><ArrowDownTrayIcon className="h-4 w-4" /> CSV</button>
                            <button type="button" className={primaryButtonClass} onClick={() => exportar('xlsx')}><ArrowDownTrayIcon className="h-4 w-4" /> Excel</button>
                        </div>
                    </div>
                    <div className="mt-4 space-y-3">
                        <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />
                        {!dados ? (
                            <Vazio icone={DocumentChartBarIcon} titulo="Escolha um relatório" texto="Ajuste os filtros e clique em Visualizar para ver a prévia, ou exporte direto em Excel ou CSV." />
                        ) : (
                            <>
                                <div className="max-h-[65vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">
                                    <table className="w-full min-w-max border-collapse text-left text-xs">
                                        <thead className="sticky top-0 z-10 bg-gray-100 text-[10px] uppercase tracking-[0.08em] text-gray-500 shadow-sm dark:bg-gray-800">
                                            <tr>{dados.cabecalhos.map((c) => <th key={c} className="whitespace-nowrap px-3 py-3">{c}</th>)}</tr>
                                        </thead>
                                        <tbody>
                                            {dados.linhas.length === 0 && <tr><td colSpan={dados.cabecalhos.length} className="px-4 py-14 text-center text-sm text-gray-500">Nenhum registro com os filtros atuais.</td></tr>}
                                            {dados.linhas.map((linha, i) => (
                                                <tr key={i} className="border-t border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50">
                                                    {linha.map((v, j) => <td key={j} className="max-w-[320px] truncate whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">{v === null ? '' : String(v)}</td>)}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-xs text-gray-500">{dados.total} linha(s){dados.total > 1000 ? ' — a prévia mostra as 1.000 primeiras; exporte para obter todas.' : ''}</p>
                            </>
                        )}
                        <Observacao>{dados?.aviso || 'Os relatórios consideram apenas documentos disponíveis na plataforma e não representam, necessariamente, toda a movimentação fiscal da empresa.'}</Observacao>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default Relatorios;
