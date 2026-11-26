import React, { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import {
    ArrowPathIcon, BuildingOffice2Icon, ClockIcon, DocumentArrowDownIcon, ExclamationTriangleIcon, HandRaisedIcon,
    KeyIcon, NoSymbolIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, secondaryButtonClass } from '../centralShared';
import {
    API, CabecalhoSecao, Carregando, Indicador, Observacao, Selo, Tabela, erroApi, formatarDocumento, moeda, tdClass,
} from './shared';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const SERIES = [
    { chave: 'entrada', rotulo: 'Entradas', cor: '#475569' },
    { chave: 'saida', rotulo: 'Saídas', cor: '#c49a61' },
    { chave: 'servico_prestado', rotulo: 'Serviços prestados', cor: '#0f766e' },
    { chave: 'servico_tomado', rotulo: 'Serviços tomados', cor: '#94a3b8' },
];

const Ranking = ({ titulo, itens, campo }) => (
    <div className={`${cardClass} p-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{titulo}</h3>
        {itens.length === 0 ? (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Sem documentos no período.</p>
        ) : (
            <ol className="mt-3 divide-y divide-gray-100 text-sm dark:divide-gray-800">
                {itens.map((item, indice) => (
                    <li key={`${item[`${campo}_documento`]}-${indice}`} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                            <span className="block truncate font-medium text-gray-800 dark:text-gray-100">{item[`${campo}_nome`] || formatarDocumento(item[`${campo}_documento`])}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{item.qtd} documento(s)</span>
                        </span>
                        <span className="whitespace-nowrap font-semibold tabular-nums">{moeda(item.total)}</span>
                    </li>
                ))}
            </ol>
        )}
    </div>
);

const VisaoGeral = ({ integracoes, pode, ambiente }) => {
    const [painel, setPainel] = useState(null);
    const [dash, setDash] = useState(null);
    const [periodo, setPeriodo] = useState({ inicio: '', fim: '' });
    const [erro, setErro] = useState('');
    const [recarregar, setRecarregar] = useState(0);
    const podeRelatorios = pode('consultar_relatorios');

    useEffect(() => {
        axiosInstance.get(`${API}/painel/`, { params: { ambiente } }).then(({ data }) => setPainel(data)).catch((e) => setErro(erroApi(e)));
    }, [ambiente, recarregar]);

    useEffect(() => {
        if (!podeRelatorios) return;
        const params = { ambiente };
        if (periodo.inicio) params.inicio = periodo.inicio;
        if (periodo.fim) params.fim = periodo.fim;
        axiosInstance.get(`${API}/dashboard/`, { params }).then(({ data }) => setDash(data)).catch((e) => setErro(erroApi(e)));
    }, [periodo, podeRelatorios, ambiente, recarregar]);

    if (erro) return <Observacao tom="vermelho">{erro}</Observacao>;
    if (!painel) return <Carregando texto="Carregando indicadores..." />;

    const meses = dash ? Object.keys(dash.mensal).sort() : [];
    const grafico = {
        labels: meses.map((mes) => mes.split('-').reverse().join('/')),
        datasets: SERIES.map((serie) => ({
            label: serie.rotulo,
            backgroundColor: serie.cor,
            borderRadius: 4,
            data: meses.map((mes) => Number(dash.mensal[mes]?.[serie.chave]?.total || 0)),
        })),
    };

    return (
        <div className="space-y-6">
            <CabecalhoSecao titulo="Monitoramento" descricao="Situação das empresas, certificados e captura de documentos.">
                <button type="button" className={secondaryButtonClass} onClick={() => setRecarregar((n) => n + 1)}>
                    <ArrowPathIcon className="h-4 w-4" /> Atualizar
                </button>
            </CabecalhoSecao>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Indicador titulo="Empresas monitoradas" valor={`${painel.monitoramento_ativo} / ${painel.total_empresas}`} detalhe="com monitoramento ativo" icone={BuildingOffice2Icon} />
                <Indicador titulo="Certificados com pendência" valor={painel.certificados_vencidos + painel.certificados_vencendo + painel.sem_certificado}
                    detalhe={`${painel.certificados_vencidos} vencido(s) · ${painel.certificados_vencendo} vence(m) em 30 dias · ${painel.sem_certificado} sem certificado`}
                    icone={KeyIcon} alerta={painel.certificados_vencidos + painel.sem_certificado > 0} />
                <Indicador titulo="Captura com problema" valor={painel.empresas_com_erro} detalhe={`${painel.empresas_bloqueadas} bloqueada(s) temporariamente`} icone={ExclamationTriangleIcon} alerta={painel.empresas_com_erro > 0} />
                <Indicador titulo="Documentos capturados" valor={painel.documentos_hoje} detalhe={`hoje · ${painel.documentos_mes} no mês`} icone={DocumentArrowDownIcon} />
                <Indicador titulo="Sincronizadas" valor={painel.empresas_sincronizadas} detalhe={`${painel.empresas_aguardando} aguardando próxima consulta`} icone={ClockIcon} />
                <Indicador titulo="XMLs pendentes" valor={painel.xmls_pendentes} detalhe="somente resumo recebido" icone={NoSymbolIcon} />
                <Indicador titulo="Manifestações pendentes" valor={painel.manifestacoes_pendentes} detalhe="NF-e sem manifestação conclusiva" icone={HandRaisedIcon} />
            </section>

            {dash && (
                <section className="space-y-4">
                    <CabecalhoSecao titulo="Movimentação documentada" descricao="Somente documentos autorizados disponíveis na plataforma; cancelados e substituídos ficam fora dos totais.">
                        <div className="flex items-end gap-2">
                            <div><label className={labelClass}>De</label><input type="date" className={controlClass} value={periodo.inicio} onChange={(e) => setPeriodo({ ...periodo, inicio: e.target.value })} /></div>
                            <div><label className={labelClass}>Até</label><input type="date" className={controlClass} value={periodo.fim} onChange={(e) => setPeriodo({ ...periodo, fim: e.target.value })} /></div>
                        </div>
                    </CabecalhoSecao>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <Indicador titulo="Compras" valor={moeda(dash.totais.compras_documentadas)} detalhe="NF-e de entrada" />
                        <Indicador titulo="Vendas" valor={moeda(dash.totais.vendas_documentadas)} detalhe="NF-e de saída disponíveis" />
                        <Indicador titulo="Serviços prestados" valor={moeda(dash.totais.servicos_prestados)} detalhe="NFS-e emitidas" />
                        <Indicador titulo="Serviços tomados" valor={moeda(dash.totais.servicos_tomados)} detalhe="NFS-e recebidas" />
                    </div>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                        <div className={`${cardClass} p-4`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <h3 className="text-sm font-semibold">Evolução mensal</h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {dash.totais.documentos} documento(s) · {dash.totais.cancelados} cancelado(s) · {dash.totais.substituidos} substituído(s)
                                </span>
                            </div>
                            {meses.length === 0
                                ? <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum documento no período selecionado.</p>
                                : <div className="mt-3 h-72"><Bar data={grafico} options={{ maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } } } }} /></div>}
                        </div>
                        <div className="space-y-3">
                            <Indicador titulo="Receita estimada pelos documentos" valor={moeda(dash.totais.receita_estimada_documentada)} detalhe="não substitui a receita apurada ou declarada" />
                            <Indicador titulo="Sem movimentação capturada" valor={dash.totais.empresas_sem_movimentacao_capturada} detalhe="empresas ativas sem documentos no período — não significa ausência de faturamento" />
                        </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Ranking titulo="Principais fornecedores" itens={dash.principais_fornecedores} campo="emitente" />
                        <Ranking titulo="Principais clientes" itens={dash.principais_clientes} campo="destinatario" />
                    </div>
                    <Observacao>{dash.aviso_cobertura}</Observacao>
                </section>
            )}

            <section className="space-y-3">
                <CabecalhoSecao titulo="Integrações governamentais" descricao="Uma integração só é considerada funcional após validação com certificado real em cada ambiente." />
                <Tabela colunas={[{ titulo: 'Serviço' }, { titulo: 'Homologação' }, { titulo: 'Produção' }, { titulo: 'Observação', className: 'hidden lg:table-cell' }]}>
                    {integracoes.map((item) => (
                        <tr key={item.fonte} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className={`${tdClass} font-medium`}>{item.nome}</td>
                            <td className={tdClass}><Selo valor={item.homologacao === 'validada' ? 'completo' : 'pendente'} texto={item.homologacao} /></td>
                            <td className={tdClass}><Selo valor={item.producao === 'validada' ? 'completo' : 'pendente'} texto={item.producao} /></td>
                            <td className={`${tdClass} hidden text-xs text-gray-500 dark:text-gray-400 lg:table-cell`}>{item.observacao}</td>
                        </tr>
                    ))}
                </Tabela>
            </section>
        </div>
    );
};

export default VisaoGeral;
