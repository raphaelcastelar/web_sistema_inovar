import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, secondaryButtonClass, thClass } from '../centralShared';
import { API, Aviso, Mensagem, ROTULOS_FONTE, Selo, erroApi, formatarData } from './shared';

const FONTES = [
    ['monitorar_nfe', 'NF-e'], ['monitorar_nfse', 'NFS-e'], ['monitorar_cte', 'CT-e'], ['monitorar_mdfe', 'MDF-e'],
];

const Configuracao = ({ empresa, certificados, pode, onFechar, onSalvo }) => {
    const cfg = empresa.configuracao || {};
    const [form, setForm] = useState({
        ativo: !!cfg.ativo, ambiente: cfg.ambiente || 1, certificado: cfg.certificado || '',
        monitorar_nfe: cfg.monitorar_nfe ?? true, monitorar_nfse: cfg.monitorar_nfse ?? true,
        monitorar_cte: cfg.monitorar_cte ?? true, monitorar_mdfe: cfg.monitorar_mdfe ?? false,
        monitorar_eventos: cfg.monitorar_eventos ?? true,
        inscricao_estadual: cfg.inscricao_estadual || '', inscricao_municipal: cfg.inscricao_municipal || '',
        codigo_ibge_municipio: cfg.codigo_ibge_municipio || '', codigo_uf: cfg.codigo_uf || '',
        ciencia_automatica: !!cfg.ciencia_automatica, ciencia_autorizacao_descricao: cfg.ciencia_autorizacao_descricao || '',
        alertas_fiscais: cfg.alertas_fiscais ?? true, alertas_certificado: cfg.alertas_certificado ?? true,
        dias_alerta_certificado: (cfg.dias_alerta_certificado || [30, 15, 7, 1]).join(', '),
    });
    const [erro, setErro] = useState('');
    const raiz = String(empresa.cnpj || '').replace(/\D/g, '').slice(0, 8);
    const compativeis = certificados.filter((c) => c.ativo && c.cnpj.slice(0, 8) === raiz);

    const salvar = async () => {
        const dados = { ...form, dias_alerta_certificado: form.dias_alerta_certificado.split(',').map((d) => parseInt(d, 10)).filter(Boolean) };
        dados.certificado = form.certificado ? Number(form.certificado) : null;
        dados.ambiente = Number(form.ambiente);
        if (!pode('ativar_monitoramento')) ['ativo', 'ambiente', 'monitorar_nfe', 'monitorar_nfse', 'monitorar_cte', 'monitorar_mdfe', 'monitorar_eventos'].forEach((k) => delete dados[k]);
        if (!pode('configurar_ciencia_automatica')) { delete dados.ciencia_automatica; delete dados.ciencia_autorizacao_descricao; }
        if (!pode('configurar_integracoes')) ['inscricao_estadual', 'inscricao_municipal', 'codigo_ibge_municipio', 'codigo_uf'].forEach((k) => delete dados[k]);
        if (!pode('gerenciar_certificados')) delete dados.certificado;
        if (!pode('gerenciar_alertas')) ['alertas_fiscais', 'alertas_certificado', 'dias_alerta_certificado'].forEach((k) => delete dados[k]);
        try {
            await axiosInstance.patch(`${API}/empresas/${empresa.id}/configuracao/`, dados);
            onSalvo();
        } catch (e) { setErro(erroApi(e)); }
    };

    const caixa = (campo, texto) => (
        <label key={campo} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.checked })} /> {texto}
        </label>
    );
    const texto = (campo, rotulo) => (
        <div key={campo}><label className={labelClass}>{rotulo}</label>
            <input className={controlClass} value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} /></div>
    );

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onFechar}>
            <div className="h-full w-full max-w-xl space-y-4 overflow-y-auto bg-white p-6 dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold">{empresa.nome}</h2>
                <p className="text-xs text-gray-500">{empresa.cnpj} · {empresa.cidade}/{empresa.uf} · {empresa.regime_tributario || 'Regime não informado'}</p>
                {erro && <Aviso tom="vermelho">{erro}</Aviso>}
                <div className="space-y-2">
                    {caixa('ativo', 'Monitoramento fiscal ativo')}
                    <div><label className={labelClass}>Ambiente</label>
                        <select className={controlClass} value={form.ambiente} onChange={(e) => setForm({ ...form, ambiente: e.target.value })}>
                            <option value={1}>Produção</option><option value={2}>Homologação (testes)</option>
                        </select></div>
                    <div className="grid grid-cols-2 gap-2">{FONTES.map(([c, t]) => caixa(c, `Monitorar ${t}`))}{caixa('monitorar_eventos', 'Monitorar eventos')}</div>
                </div>
                <div><label className={labelClass}>Certificado digital (mesmo CNPJ raiz)</label>
                    <select className={controlClass} value={form.certificado} onChange={(e) => setForm({ ...form, certificado: e.target.value })}>
                        <option value="">Sem certificado</option>
                        {compativeis.map((c) => <option key={c.id} value={c.id}>{c.titular} - até {formatarData(c.valido_ate)}</option>)}
                    </select>
                    {compativeis.length === 0 && <p className="mt-1 text-xs text-gray-500">Nenhum certificado do mesmo CNPJ raiz. Certificado do escritório não consulta documentos de clientes nos serviços de distribuição.</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {texto('inscricao_estadual', 'Inscrição estadual')}{texto('inscricao_municipal', 'Inscrição municipal')}
                    {texto('codigo_ibge_municipio', 'Código IBGE município')}{texto('codigo_uf', 'Código IBGE da UF (cUFAutor)')}
                </div>
                <div className="space-y-2 rounded-md border border-amber-200 p-3 dark:border-amber-900">
                    {caixa('ciencia_automatica', 'Ciência da Operação automática')}
                    <p className="text-xs text-gray-500">Somente com autorização explícita do contribuinte. Confirmação, Desconhecimento e Operação não Realizada nunca são automáticas.</p>
                    {form.ciencia_automatica && (
                        <textarea className={`${controlClass} h-20 py-2`} placeholder="Quem autorizou, cargo e documento de autorização"
                            value={form.ciencia_autorizacao_descricao} onChange={(e) => setForm({ ...form, ciencia_autorizacao_descricao: e.target.value })} />
                    )}
                    {cfg.ciencia_autorizada_em && <p className="text-xs">Autorização registrada em {formatarData(cfg.ciencia_autorizada_em, true)}.</p>}
                </div>
                <div className="space-y-2">
                    {caixa('alertas_fiscais', 'Alertas fiscais')}{caixa('alertas_certificado', 'Alertas de vencimento do certificado')}
                    {texto('dias_alerta_certificado', 'Dias de antecedência (separados por vírgula)')}
                </div>
                <div className="flex gap-2">
                    <button type="button" className={primaryButtonClass} onClick={salvar}>Salvar</button>
                    <button type="button" className={secondaryButtonClass} onClick={onFechar}>Cancelar</button>
                </div>
            </div>
        </div>
    );
};

const Historico = ({ controle, onFechar }) => {
    const [execucoes, setExecucoes] = useState([]);
    useEffect(() => { axiosInstance.get(`${API}/controles/${controle.id}/execucoes/`).then(({ data }) => setExecucoes(data)); }, [controle.id]);
    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onFechar}>
            <div className="h-full w-full max-w-3xl space-y-3 overflow-y-auto bg-white p-6 dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-semibold">Histórico - {controle.fonte_display}</h2>
                <p className="text-xs text-gray-500">Último NSU {controle.ult_nsu} · maior NSU {controle.max_nsu || '-'} · {controle.total_erros} erro(s) acumulado(s)</p>
                {controle.inconsistencia && <Aviso tom="vermelho">{controle.inconsistencia}</Aviso>}
                {controle.lacunas_nsu?.length > 0 && <Aviso>NSUs faltantes: {controle.lacunas_nsu.slice(0, 30).join(', ')}{controle.lacunas_nsu.length > 30 ? '...' : ''}</Aviso>}
                <table className="min-w-full text-xs">
                    <thead><tr>{['Início', 'Origem', 'NSU', 'Lotes', 'Docs', 'cStat', 'Mensagem'].map((t) => <th key={t} className={thClass}>{t}</th>)}</tr></thead>
                    <tbody>{execucoes.map((e) => (
                        <tr key={e.id} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-4 py-1">{formatarData(e.iniciado_em, true)}</td><td className="px-4 py-1">{e.origem}</td>
                            <td className="px-4 py-1">{e.nsu_inicial} → {e.nsu_final}</td><td className="px-4 py-1">{e.lotes}</td>
                            <td className="px-4 py-1">{e.documentos}</td><td className="px-4 py-1">{e.cstat}</td><td className="px-4 py-1">{e.mensagem}</td>
                        </tr>))}</tbody>
                </table>
            </div>
        </div>
    );
};

const EmpresasMonitoramento = ({ pode }) => {
    const [empresas, setEmpresas] = useState([]);
    const [certificados, setCertificados] = useState([]);
    const [busca, setBusca] = useState('');
    const [editando, setEditando] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [selecionadas, setSelecionadas] = useState([]);
    const [mensagem, setMensagem] = useState(null);
    const [sincronizando, setSincronizando] = useState(null);

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/empresas/`, { params: busca ? { busca } : {} }).then(({ data }) => setEmpresas(data))
            .catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }));
    }, [busca]);
    useEffect(() => { carregar(); }, [carregar]);
    const podeCertificados = pode('gerenciar_certificados');
    useEffect(() => {
        if (podeCertificados) axiosInstance.get(`${API}/certificados/`).then(({ data }) => setCertificados(data)).catch(() => {});
    }, [podeCertificados]);

    const sincronizar = async (empresa) => {
        setSincronizando(empresa.id);
        try {
            const { data } = await axiosInstance.post(`${API}/empresas/${empresa.id}/sincronizar/`, {});
            setMensagem({ tipo: 'ok', texto: data.resultados.map((r) => `${ROTULOS_FONTE[r.fonte]}: ${r.mensagem || (r.sucesso ? 'ok' : 'falha')}`).join(' | ') || 'Nenhuma fonte habilitada.' });
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
        setSincronizando(null);
        carregar();
    };

    const lote = async (dados) => {
        try {
            const { data } = await axiosInstance.post(`${API}/empresas/lote/`, { empresa_ids: selecionadas, configuracao: dados });
            const falhas = data.resultados.filter((r) => !r.sucesso);
            setMensagem({ tipo: falhas.length ? 'erro' : 'ok', texto: falhas.length ? falhas.map((f) => `${f.nome}: ${f.erro}`).join(' | ') : 'Configuração aplicada.' });
            carregar();
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const sincronizarLote = async () => {
        try {
            const { data } = await axiosInstance.post(`${API}/sincronizar-lote/`, { empresa_ids: selecionadas });
            setMensagem({ tipo: 'ok', texto: data.mensagem });
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <div className="space-y-4">
            <div className={`${cardClass} flex flex-wrap items-end gap-3 p-4`}>
                <div className="min-w-[240px] flex-1"><label className={labelClass}>Buscar empresa</label>
                    <input className={controlClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CNPJ" /></div>
                {pode('ativar_monitoramento') && <>
                    <button type="button" className={secondaryButtonClass} disabled={!selecionadas.length} onClick={() => lote({ ativo: true })}>Ativar selecionadas</button>
                    <button type="button" className={secondaryButtonClass} disabled={!selecionadas.length} onClick={() => lote({ ativo: false })}>Desativar selecionadas</button>
                </>}
                {pode('solicitar_sincronizacao') && <button type="button" className={secondaryButtonClass} disabled={!selecionadas.length} onClick={sincronizarLote}>Sincronizar selecionadas</button>}
            </div>
            <Aviso tom="azul">Consultas manuais respeitam os mesmos intervalos obrigatórios e bloqueios da sincronização automática. Empresas desativadas mantêm o histórico capturado.</Aviso>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            <section className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead><tr>
                        <th className={thClass}><input type="checkbox" onChange={(e) => setSelecionadas(e.target.checked ? empresas.map((x) => x.id) : [])} /></th>
                        {['Empresa', 'Monitor', 'Certificado', 'Serviços', 'Ações'].map((t) => <th key={t} className={thClass}>{t}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {empresas.map((empresa) => {
                            const cfg = empresa.configuracao;
                            const cert = cfg?.certificado_info;
                            return (
                                <tr key={empresa.id} className="align-top">
                                    <td className="px-4 py-3"><input type="checkbox" checked={selecionadas.includes(empresa.id)} onChange={(e) => setSelecionadas(e.target.checked ? [...selecionadas, empresa.id] : selecionadas.filter((i) => i !== empresa.id))} /></td>
                                    <td className="px-4 py-3"><p className="font-medium">{empresa.nome}</p><p className="text-xs text-gray-500">{empresa.cnpj} · {empresa.cidade || '-'}/{empresa.uf || '-'}</p></td>
                                    <td className="px-4 py-3"><Selo valor={cfg?.ativo ? 'completo' : 'desativado'} texto={cfg?.ativo ? (cfg.ambiente === 2 ? 'Ativo (homologação)' : 'Ativo') : 'Inativo'} /></td>
                                    <td className="px-4 py-3 text-xs">{cert ? <><p>{cert.titular}</p><Selo valor={cert.vencido ? 'erro' : cert.dias_para_vencer <= 30 ? 'pendente' : 'completo'} texto={cert.vencido ? 'Vencido' : `Vence em ${cert.dias_para_vencer} dias`} /></> : <Selo valor="erro" texto="Sem certificado" />}</td>
                                    <td className="px-4 py-3">
                                        <div className="space-y-1">
                                            {empresa.controles.filter((ct) => ct.situacao !== 'desativado').map((ct) => (
                                                <button type="button" key={ct.id} className="flex w-full items-center justify-between gap-3 text-left text-xs" onClick={() => setHistorico(ct)}>
                                                    <span className="w-12 font-semibold">{ROTULOS_FONTE[ct.fonte]}</span>
                                                    <Selo valor={ct.situacao} texto={ct.situacao_display} />
                                                    <span className="text-gray-500">NSU {Number(ct.ult_nsu)} · {ct.documentos_recuperados} docs</span>
                                                    <span className="text-gray-500">{ct.bloqueado_ate ? `bloqueado até ${formatarData(ct.bloqueado_ate, true)}` : ct.proxima_consulta_em ? `próx. ${formatarData(ct.proxima_consulta_em, true)}` : ''}</span>
                                                </button>
                                            ))}
                                            {empresa.controles.some((ct) => ct.ultima_mensagem && ['erro', 'certificado_invalido', 'indisponivel', 'bloqueado'].includes(ct.situacao)) && (
                                                <p className="text-xs text-rose-600">{empresa.controles.filter((ct) => ['erro', 'certificado_invalido', 'indisponivel', 'bloqueado'].includes(ct.situacao)).map((ct) => ct.ultima_mensagem).join(' | ')}</p>
                                            )}
                                        </div>
                                    </td>
                                    <td className="space-y-1 px-4 py-3">
                                        <button type="button" className={rowActionClass} onClick={() => setEditando(empresa)}>Configurar</button>
                                        {pode('solicitar_sincronizacao') && cfg?.ativo && <button type="button" className={rowActionClass} disabled={sincronizando === empresa.id} onClick={() => sincronizar(empresa)}>{sincronizando === empresa.id ? 'Consultando...' : 'Sincronizar'}</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>
            {editando && <Configuracao empresa={editando} certificados={certificados} pode={pode} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); setMensagem({ tipo: 'ok', texto: 'Configuração salva.' }); }} />}
            {historico && <Historico controle={historico} onFechar={() => setHistorico(null)} />}
        </div>
    );
};

export default EmpresasMonitoramento;
