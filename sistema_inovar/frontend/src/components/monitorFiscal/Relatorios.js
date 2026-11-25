import React, { useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, secondaryButtonClass, thClass } from '../centralShared';
import { API, Aviso, Mensagem, baixar, erroApi } from './shared';

const RELATORIOS = [
    ['documentos', 'Documentos por empresa'], ['compras_vendas', 'Compras e vendas documentadas'],
    ['servicos_prestados', 'Serviços prestados'], ['servicos_tomados', 'Serviços tomados'], ['transportes', 'Transportes'],
    ['fornecedores', 'Fornecedores'], ['clientes', 'Clientes'], ['produtos', 'Produtos'], ['ncm', 'NCM'], ['cfop', 'CFOP'],
    ['tributos', 'Tributos destacados'], ['cancelados', 'Documentos cancelados'], ['substituidos', 'Documentos substituídos'],
    ['manifestacoes', 'Manifestações'], ['xmls_indisponiveis', 'XMLs indisponíveis'], ['certificados', 'Certificados'],
    ['sincronizacoes', 'Sincronizações'], ['cobertura', 'Cobertura de captura por fonte'],
];

const Relatorios = () => {
    const [tipo, setTipo] = useState('documentos');
    const [empresas, setEmpresas] = useState([]);
    const [filtros, setFiltros] = useState({ empresa: '', emissao_inicio: '', emissao_fim: '', ambiente: '1' });
    const [dados, setDados] = useState(null);
    const [mensagem, setMensagem] = useState(null);

    useEffect(() => { axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {}); }, []);

    const params = () => {
        const p = {};
        Object.entries(filtros).forEach(([k, v]) => { if (v) p[k] = v; });
        return p;
    };

    const visualizar = async () => {
        try {
            const { data } = await axiosInstance.get(`${API}/relatorios/${tipo}/`, { params: params() });
            setDados(data);
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const exportar = (formato) => baixar(`${API}/relatorios/${tipo}/`, { ...params(), formato }, `monitor-fiscal-${tipo}.${formato}`)
        .catch(() => setMensagem({ tipo: 'erro', texto: 'Falha ao exportar o relatório.' }));

    return (
        <div className="space-y-4">
            <section className={`${cardClass} grid gap-3 p-4 md:grid-cols-6`}>
                <div className="md:col-span-2"><label className={labelClass}>Relatório</label>
                    <select className={controlClass} value={tipo} onChange={(e) => { setTipo(e.target.value); setDados(null); }}>
                        {RELATORIOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select></div>
                <div><label className={labelClass}>Empresa</label>
                    <select className={controlClass} value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })}>
                        <option value="">Todas autorizadas</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select></div>
                <div><label className={labelClass}>Emissão de</label><input type="date" className={controlClass} value={filtros.emissao_inicio} onChange={(e) => setFiltros({ ...filtros, emissao_inicio: e.target.value })} /></div>
                <div><label className={labelClass}>Emissão até</label><input type="date" className={controlClass} value={filtros.emissao_fim} onChange={(e) => setFiltros({ ...filtros, emissao_fim: e.target.value })} /></div>
                <div><label className={labelClass}>Ambiente</label>
                    <select className={controlClass} value={filtros.ambiente} onChange={(e) => setFiltros({ ...filtros, ambiente: e.target.value })}>
                        <option value="1">Produção</option><option value="2">Homologação</option>
                    </select></div>
                <div className="flex flex-wrap gap-2 md:col-span-6">
                    <button type="button" className={primaryButtonClass} onClick={visualizar}>Visualizar</button>
                    <button type="button" className={secondaryButtonClass} onClick={() => exportar('xlsx')}>Exportar planilha</button>
                    <button type="button" className={secondaryButtonClass} onClick={() => exportar('csv')}>Exportar CSV</button>
                </div>
            </section>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            {dados && (
                <section className="space-y-2">
                    <Aviso>{dados.aviso} Cancelados e substituídos são desconsiderados nos totais de movimentação.</Aviso>
                    <div className={`${cardClass} max-h-[600px] overflow-auto`}>
                        <table className="min-w-full text-xs">
                            <thead><tr>{dados.cabecalhos.map((c) => <th key={c} className={thClass}>{c}</th>)}</tr></thead>
                            <tbody>{dados.linhas.map((linha, i) => (
                                <tr key={i} className="border-t border-gray-100 dark:border-gray-800">{linha.map((v, j) => <td key={j} className="px-4 py-1">{v === null ? '' : String(v)}</td>)}</tr>
                            ))}</tbody>
                        </table>
                    </div>
                    <p className="text-xs text-gray-500">{dados.total} linha(s){dados.total > 1000 ? ' — exibindo as 1000 primeiras; exporte para obter todas.' : ''}</p>
                </section>
            )}
        </div>
    );
};

export default Relatorios;
