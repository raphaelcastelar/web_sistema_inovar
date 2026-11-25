import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, thClass } from '../centralShared';
import { API, Aviso, Indicador, Selo, erroApi, formatarDocumento, moeda } from './shared';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SERIES = [
    { chave: 'entrada', rotulo: 'Entradas', cor: '#64748b' },
    { chave: 'saida', rotulo: 'Saídas', cor: '#c49a61' },
    { chave: 'servico_prestado', rotulo: 'Serviços prestados', cor: '#0f766e' },
    { chave: 'servico_tomado', rotulo: 'Serviços tomados', cor: '#7c3aed' },
];

const VisaoGeral = ({ integracoes, pode }) => {
    const [painel, setPainel] = useState(null);
    const [dash, setDash] = useState(null);
    const [periodo, setPeriodo] = useState({ inicio: '', fim: '' });
    const [erro, setErro] = useState('');

    useEffect(() => {
        axiosInstance.get(`${API}/painel/`).then(({ data }) => setPainel(data)).catch((e) => setErro(erroApi(e)));
    }, []);

    const podeRelatorios = pode('consultar_relatorios');

    useEffect(() => {
        if (!podeRelatorios) return;
        const params = {};
        if (periodo.inicio) params.inicio = periodo.inicio;
        if (periodo.fim) params.fim = periodo.fim;
        axiosInstance.get(`${API}/dashboard/`, { params }).then(({ data }) => setDash(data)).catch((e) => setErro(erroApi(e)));
    }, [periodo, podeRelatorios]);

    if (erro) return <Aviso tom="vermelho">{erro}</Aviso>;
    if (!painel) return <p className="text-sm text-gray-500">Carregando painel...</p>;

    const meses = dash ? Object.keys(dash.mensal).sort() : [];
    const grafico = {
        labels: meses,
        datasets: SERIES.map((serie) => ({
            label: serie.rotulo,
            backgroundColor: serie.cor,
            data: meses.map((mes) => Number(dash.mensal[mes]?.[serie.chave]?.total || 0)),
        })),
    };

    return (
        <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
                <Indicador titulo="Empresas" valor={painel.total_empresas} detalhe={`${painel.monitoramento_ativo} com monitoramento`} />
                <Indicador titulo="Sem certificado" valor={painel.sem_certificado} tom={painel.sem_certificado ? 'alerta' : ''} />
                <Indicador titulo="Cert. vencidos" valor={painel.certificados_vencidos} detalhe={`${painel.certificados_vencendo} vencem em 30 dias`} tom={painel.certificados_vencidos ? 'alerta' : ''} />
                <Indicador titulo="Com erro" valor={painel.empresas_com_erro} detalhe={`${painel.empresas_bloqueadas} bloqueadas`} tom={painel.empresas_com_erro ? 'alerta' : ''} />
                <Indicador titulo="Capturados hoje" valor={painel.documentos_hoje} detalhe={`${painel.documentos_mes} no mês`} />
                <Indicador titulo="XMLs pendentes" valor={painel.xmls_pendentes} detalhe="somente resumo" />
                <Indicador titulo="Manifestações" valor={painel.manifestacoes_pendentes} detalhe="pendentes" />
            </section>

            {dash && (
                <section className={`${cardClass} space-y-4 p-5`}>
                    <div className="flex flex-wrap items-end gap-3">
                        <div><label className={labelClass}>Início</label><input type="date" className={controlClass} value={periodo.inicio} onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} /></div>
                        <div><label className={labelClass}>Fim</label><input type="date" className={controlClass} value={periodo.fim} onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></div>
                    </div>
                    <Aviso>{dash.aviso_cobertura}</Aviso>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <Indicador titulo="Compras documentadas" valor={moeda(dash.totais.compras_documentadas)} />
                        <Indicador titulo="Vendas documentadas" valor={moeda(dash.totais.vendas_documentadas)} />
                        <Indicador titulo="Serviços prestados" valor={moeda(dash.totais.servicos_prestados)} />
                        <Indicador titulo="Serviços tomados" valor={moeda(dash.totais.servicos_tomados)} />
                        <Indicador titulo="Transportes" valor={moeda(dash.totais.transportes)} />
                        <Indicador titulo="Receita estimada (documentos)" valor={moeda(dash.totais.receita_estimada_documentada)} detalhe="não é receita apurada" />
                        <Indicador titulo="Cancelados / substituídos" valor={`${dash.totais.cancelados} / ${dash.totais.substituidos}`} detalhe="excluídos dos totais" />
                        <Indicador titulo="Sem movimentação capturada" valor={dash.totais.empresas_sem_movimentacao_capturada} detalhe="não significa sem faturamento" />
                    </div>
                    <div className="h-72"><Bar data={grafico} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }} /></div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {[['Principais fornecedores', dash.principais_fornecedores, 'emitente'], ['Principais clientes', dash.principais_clientes, 'destinatario']].map(([titulo, lista, campo]) => (
                            <div key={titulo}>
                                <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">{titulo}</h3>
                                <table className="min-w-full text-sm">
                                    <tbody>
                                        {lista.length === 0 && <tr><td className="py-2 text-xs text-gray-500">Sem dados no período.</td></tr>}
                                        {lista.map((item) => (
                                            <tr key={item[`${campo}_documento`]} className="border-t border-gray-100 dark:border-gray-800">
                                                <td className="py-1.5">{item[`${campo}_nome`] || formatarDocumento(item[`${campo}_documento`])}</td>
                                                <td className="py-1.5 text-right">{moeda(item.total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <section className={`${cardClass} overflow-x-auto`}>
                <h2 className="px-5 pt-4 text-sm font-semibold text-gray-800 dark:text-gray-200">Situação das integrações</h2>
                <table className="mt-2 min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead><tr><th className={thClass}>Integração</th><th className={thClass}>Implementada</th><th className={thClass}>Homologação</th><th className={thClass}>Produção</th><th className={thClass}>Observação</th></tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {integracoes.map((item) => (
                            <tr key={item.fonte}>
                                <td className="px-4 py-2 font-medium">{item.nome}</td>
                                <td className="px-4 py-2"><Selo valor={item.implementada ? 'completo' : 'pendente'} texto={item.implementada ? 'Sim' : 'Não'} /></td>
                                <td className="px-4 py-2 text-xs">{item.homologacao}</td>
                                <td className="px-4 py-2 text-xs">{item.producao}</td>
                                <td className="px-4 py-2 text-xs text-gray-500">{item.observacao}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
};

export default VisaoGeral;
