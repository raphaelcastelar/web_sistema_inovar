import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, chipClass, chipOff, chipOn, controlClass, primaryButtonClass, rowActionClass, secondaryButtonClass, thClass } from '../centralShared';
import { API, Aviso, Mensagem, Selo, erroApi, formatarData } from './shared';

const Alertas = ({ pode }) => {
    const [situacao, setSituacao] = useState('novo,lido');
    const [dados, setDados] = useState({ results: [] });
    const [preferencias, setPreferencias] = useState(null);
    const [mensagem, setMensagem] = useState(null);

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/alertas/`, { params: situacao ? { situacao } : {} }).then(({ data }) => setDados(data))
            .catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }));
    }, [situacao]);
    useEffect(() => { carregar(); }, [carregar]);

    const atualizar = async (alerta, nova) => {
        await axiosInstance.patch(`${API}/alertas/${alerta.id}/`, { situacao: nova });
        carregar();
    };

    const abrirPreferencias = async () => {
        const { data } = await axiosInstance.get(`${API}/alertas/preferencias/`);
        setPreferencias(data);
    };

    const salvarPreferencias = async () => {
        try {
            await axiosInstance.put(`${API}/alertas/preferencias/`, preferencias);
            setMensagem({ tipo: 'ok', texto: 'Preferências salvas.' });
            setPreferencias(null);
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {[['novo,lido', 'Abertos'], ['analisado', 'Analisados'], ['resolvido', 'Resolvidos'], ['', 'Todos']].map(([v, t]) => (
                    <button key={t} type="button" className={`${chipClass} ${situacao === v ? chipOn : chipOff}`} onClick={() => setSituacao(v)}>{t}</button>
                ))}
                {pode('gerenciar_alertas') && <button type="button" className={secondaryButtonClass} onClick={abrirPreferencias}>Minhas preferências de notificação</button>}
            </div>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            {preferencias && (
                <div className={`${cardClass} space-y-3 p-4 text-sm`}>
                    <div className="grid gap-1 md:grid-cols-3">
                        {preferencias.tipos_disponiveis.map(([valor, texto]) => (
                            <label key={valor} className="flex items-center gap-2"><input type="checkbox" checked={preferencias.tipos_ativos.length === 0 || preferencias.tipos_ativos.includes(valor)}
                                onChange={(e) => {
                                    const base = preferencias.tipos_ativos.length === 0 ? preferencias.tipos_disponiveis.map(([v]) => v) : preferencias.tipos_ativos;
                                    setPreferencias({ ...preferencias, tipos_ativos: e.target.checked ? [...base, valor] : base.filter((x) => x !== valor) });
                                }} />{texto}</label>
                        ))}
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <select className={controlClass} value={preferencias.prioridade_minima} onChange={(e) => setPreferencias({ ...preferencias, prioridade_minima: e.target.value })}>
                            <option value="baixa">Prioridade mínima: baixa</option><option value="normal">normal</option><option value="alta">alta</option><option value="critica">crítica</option>
                        </select>
                        <select className={controlClass} value={preferencias.frequencia} onChange={(e) => setPreferencias({ ...preferencias, frequencia: e.target.value })}>
                            <option value="imediata">Notificação imediata</option><option value="diaria">Resumo diário (somente painel)</option><option value="desativada">Desativada</option>
                        </select>
                        <button type="button" className={primaryButtonClass} onClick={salvarPreferencias}>Salvar</button>
                    </div>
                </div>
            )}
            <div className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead><tr>{['Data', 'Empresa', 'Alerta', 'Prioridade', 'Situação', ''].map((t) => <th key={t} className={thClass}>{t}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dados.results.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Nenhum alerta.</td></tr>}
                        {dados.results.map((a) => (
                            <tr key={a.id}>
                                <td className="px-4 py-2 text-xs">{formatarData(a.criado_em, true)}</td>
                                <td className="px-4 py-2 text-xs">{a.empresa_nome}</td>
                                <td className="px-4 py-2"><p>{a.titulo}</p><p className="text-xs text-gray-500">{a.mensagem}</p></td>
                                <td className="px-4 py-2"><Selo valor={a.prioridade === 'critica' ? 'critica' : a.prioridade === 'alta' ? 'atencao' : 'informativa'} texto={a.prioridade} /></td>
                                <td className="px-4 py-2"><Selo valor={a.situacao} texto={a.situacao} /></td>
                                <td className="space-x-1 whitespace-nowrap px-4 py-2">
                                    {pode('gerenciar_alertas') && ['lido', 'analisado', 'resolvido'].filter((s) => s !== a.situacao).map((s) => (
                                        <button key={s} type="button" className={rowActionClass} onClick={() => atualizar(a, s)}>{s}</button>
                                    ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const Auditoria = ({ pode }) => {
    const [dados, setDados] = useState({ results: [] });
    const [filtro, setFiltro] = useState({ situacao: 'aberta', severidade: '' });
    const [mensagem, setMensagem] = useState(null);

    const carregar = useCallback(() => {
        const params = {};
        Object.entries(filtro).forEach(([k, v]) => { if (v) params[k] = v; });
        axiosInstance.get(`${API}/auditoria/`, { params }).then(({ data }) => setDados(data)).catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }));
    }, [filtro]);
    const podeRelatorios = pode('consultar_relatorios');
    useEffect(() => { if (podeRelatorios) carregar(); }, [carregar, podeRelatorios]);

    if (!podeRelatorios) return null;

    const executar = async () => {
        const { data } = await axiosInstance.post(`${API}/auditoria/`, {});
        setMensagem({ tipo: 'ok', texto: `${data.ocorrencias_criadas} nova(s) ocorrência(s).` });
        carregar();
    };

    const tratar = async (o, situacao) => {
        const justificativa = situacao === 'justificada' ? window.prompt('Justificativa da análise:') : '';
        if (situacao === 'justificada' && !justificativa) return;
        try {
            await axiosInstance.patch(`${API}/auditoria/${o.id}/`, { situacao, justificativa });
            carregar();
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <section className="space-y-3">
            <Aviso>As ocorrências indicam pontos para análise. Nenhuma regra automatizada afirma que uma operação é irregular ou fraudulenta.</Aviso>
            <div className="flex flex-wrap gap-2">
                <select className={`${controlClass} w-48`} value={filtro.situacao} onChange={(e) => setFiltro({ ...filtro, situacao: e.target.value })}>
                    <option value="">Todas</option><option value="aberta">Abertas</option><option value="justificada">Justificadas</option><option value="resolvida">Resolvidas</option>
                </select>
                <select className={`${controlClass} w-48`} value={filtro.severidade} onChange={(e) => setFiltro({ ...filtro, severidade: e.target.value })}>
                    <option value="">Todas as severidades</option><option value="critica">Crítica</option><option value="atencao">Atenção</option><option value="informativa">Informativa</option>
                </select>
                <button type="button" className={secondaryButtonClass} onClick={executar}>Executar verificações agora</button>
            </div>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            <div className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead><tr>{['Severidade', 'Empresa', 'Ocorrência', 'Situação', ''].map((t) => <th key={t} className={thClass}>{t}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {dados.results.map((o) => (
                            <tr key={o.id}>
                                <td className="px-4 py-2"><Selo valor={o.severidade} texto={o.severidade} /></td>
                                <td className="px-4 py-2 text-xs">{o.empresa_nome}</td>
                                <td className="px-4 py-2"><p>{o.descricao}</p>{o.justificativa && <p className="text-xs text-gray-500">Justificativa: {o.justificativa}</p>}</td>
                                <td className="px-4 py-2"><Selo valor={o.situacao} texto={o.situacao} /></td>
                                <td className="space-x-1 whitespace-nowrap px-4 py-2">
                                    {o.situacao === 'aberta' ? <>
                                        <button type="button" className={rowActionClass} onClick={() => tratar(o, 'justificada')}>Justificar</button>
                                        <button type="button" className={rowActionClass} onClick={() => tratar(o, 'resolvida')}>Resolver</button>
                                    </> : <button type="button" className={rowActionClass} onClick={() => tratar(o, 'aberta')}>Reabrir</button>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

const AlertasAuditoria = ({ pode }) => {
    const [aba, setAba] = useState('alertas');
    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <button type="button" className={`${chipClass} ${aba === 'alertas' ? chipOn : chipOff}`} onClick={() => setAba('alertas')}>Alertas</button>
                {pode('consultar_relatorios') && <button type="button" className={`${chipClass} ${aba === 'auditoria' ? chipOn : chipOff}`} onClick={() => setAba('auditoria')}>Auditoria fiscal</button>}
            </div>
            {aba === 'alertas' ? <Alertas pode={pode} /> : <Auditoria pode={pode} />}
        </div>
    );
};

export default AlertasAuditoria;
