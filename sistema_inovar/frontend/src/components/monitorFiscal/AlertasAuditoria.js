import React, { useCallback, useEffect, useState } from 'react';
import {
    AdjustmentsHorizontalIcon, ArrowPathIcon, BellAlertIcon, CheckCircleIcon, ClipboardDocumentCheckIcon, EyeIcon,
    PlayIcon, ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import {
    chipClass, chipOff, chipOn, controlClass, labelClass, primaryButtonClass, rowActionClass, secondaryButtonClass,
} from '../centralShared';
import {
    API, CabecalhoSecao, Feedback, Modal, Observacao, Selo, Tabela, Vazio, checkboxClass, erroApi, formatarData, tdClass,
} from './shared';

const SITUACAO_ALERTA = { novo: 'Novo', lido: 'Lido', analisado: 'Analisado', resolvido: 'Resolvido' };
const SITUACAO_OCORRENCIA = { aberta: 'Aberta', justificada: 'Justificada', resolvida: 'Resolvida' };
const VISOES = [
    ['importantes', 'Importantes', { situacao: 'novo,lido,analisado', prioridade: 'normal,alta,critica' }],
    ['documentos', 'Novos documentos', { situacao: 'novo,lido', prioridade: 'baixa' }],
    ['resolvidos', 'Resolvidos', { situacao: 'resolvido' }],
    ['todos', 'Todos', {}],
];
const PRIORIDADE = { baixa: ['informativa', 'Baixa'], normal: ['lido', 'Normal'], alta: ['atencao', 'Alta'], critica: ['critica', 'Crítica'] };
const SEVERIDADE = { informativa: 'Informativa', atencao: 'Atenção', critica: 'Crítica' };

const Preferencias = ({ onFechar, onSalvo }) => {
    const [pref, setPref] = useState(null);
    const [erro, setErro] = useState('');
    useEffect(() => { axiosInstance.get(`${API}/alertas/preferencias/`).then(({ data }) => setPref(data)).catch((e) => setErro(erroApi(e))); }, []);
    const todos = pref ? pref.tipos_disponiveis.map(([v]) => v) : [];
    const ativos = pref && pref.tipos_ativos.length ? pref.tipos_ativos : todos;

    const salvar = async () => {
        try {
            await axiosInstance.put(`${API}/alertas/preferencias/`, { ...pref, tipos_ativos: ativos.length === todos.length ? [] : ativos });
            onSalvo();
        } catch (e) { setErro(erroApi(e)); }
    };

    return (
        <Modal aberto onFechar={onFechar} sobretitulo="Alertas" titulo="Minhas notificações" largura="max-w-3xl"
            subtitulo="Defina quais alertas do Monitor Fiscal chegam às suas notificações do sistema."
            rodape={<><button type="button" className={secondaryButtonClass} onClick={onFechar}>Cancelar</button><button type="button" className={primaryButtonClass} onClick={salvar} disabled={!pref}>Salvar</button></>}>
            {erro && <Observacao tom="vermelho">{erro}</Observacao>}
            {pref && (
                <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block"><span className={labelClass}>Frequência</span>
                            <select className={controlClass} value={pref.frequencia} onChange={(e) => setPref({ ...pref, frequencia: e.target.value })}>
                                <option value="imediata">Notificação imediata</option><option value="diaria">Somente no painel</option><option value="desativada">Desativada</option>
                            </select></label>
                        <label className="block"><span className={labelClass}>Prioridade mínima</span>
                            <select className={controlClass} value={pref.prioridade_minima} onChange={(e) => setPref({ ...pref, prioridade_minima: e.target.value })}>
                                {Object.entries(PRIORIDADE).map(([v, [, t]]) => <option key={v} value={v}>{t}</option>)}
                            </select></label>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {pref.tipos_disponiveis.map(([valor, texto]) => (
                            <label key={valor} className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                                <input type="checkbox" className={checkboxClass} checked={ativos.includes(valor)}
                                    onChange={(e) => setPref({ ...pref, tipos_ativos: e.target.checked ? [...ativos, valor] : ativos.filter((x) => x !== valor) })} />
                                {texto}
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
};

const Alertas = ({ pode }) => {
    const [visao, setVisao] = useState('importantes');
    const [dados, setDados] = useState(null);
    const [preferencias, setPreferencias] = useState(false);
    const [feedback, setFeedback] = useState(null);

    const carregar = useCallback(() => {
        const params = VISOES.find(([v]) => v === visao)[2];
        axiosInstance.get(`${API}/alertas/`, { params }).then(({ data }) => setDados(data))
            .catch((e) => { setDados({ results: [], count: 0 }); setFeedback({ tipo: 'erro', texto: erroApi(e) }); });
    }, [visao]);
    useEffect(() => { carregar(); }, [carregar]);

    const atualizar = async (alerta, nova) => {
        try { await axiosInstance.patch(`${API}/alertas/${alerta.id}/`, { situacao: nova }); carregar(); }
        catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                {VISOES.map(([v, t]) => (
                    <button key={v} type="button" className={`${chipClass} ${visao === v ? chipOn : chipOff}`} onClick={() => setVisao(v)}>{t}</button>
                ))}
                {pode('gerenciar_alertas') && (
                    <button type="button" className={`${secondaryButtonClass} ml-auto`} onClick={() => setPreferencias(true)}><AdjustmentsHorizontalIcon className="h-4 w-4" /> Minhas notificações</button>
                )}
            </div>
            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />
            <Tabela
                colunas={[{ titulo: 'Alerta' }, { titulo: 'Empresa', className: 'hidden lg:table-cell' }, { titulo: 'Prioridade' }, { titulo: 'Situação' }, { titulo: '', className: 'text-right' }]}
                vazio={dados && dados.results.length === 0 && <Vazio icone={BellAlertIcon} titulo="Nenhum alerta" texto="Novos documentos, cancelamentos, falhas de captura e certificados a vencer aparecem aqui." />}
                rodape={dados && <span>{dados.count} alerta(s)</span>}
            >
                {!dados ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500"><ArrowPathIcon className="mr-2 inline h-5 w-5 animate-spin" />Carregando...</td></tr>
                    : dados.results.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className={`${tdClass} max-w-[34rem]`}>
                                <p className={`text-gray-900 dark:text-gray-100 ${a.situacao === 'novo' ? 'font-semibold' : 'font-medium'}`}>{a.titulo}</p>
                                <p className="mt-0.5 truncate text-xs text-gray-500" title={a.mensagem}>{formatarData(a.criado_em, true)}{a.mensagem && ` · ${a.mensagem}`}</p>
                            </td>
                            <td className={`${tdClass} hidden text-xs lg:table-cell`}>{a.empresa_nome || '—'}</td>
                            <td className={tdClass}><Selo valor={PRIORIDADE[a.prioridade]?.[0]} texto={PRIORIDADE[a.prioridade]?.[1]} /></td>
                            <td className={tdClass}><Selo valor={a.situacao} texto={SITUACAO_ALERTA[a.situacao]} /></td>
                            <td className={tdClass}>
                                {pode('gerenciar_alertas') && a.situacao !== 'resolvido' && (
                                    <div className="flex min-w-max justify-end gap-2">
                                        {a.situacao === 'novo'
                                            ? <button type="button" className={rowActionClass} onClick={() => atualizar(a, 'lido')} title="Marcar como lido"><EyeIcon className="h-4 w-4" /> Lido</button>
                                            : <button type="button" className={rowActionClass} onClick={() => atualizar(a, 'analisado')} disabled={a.situacao === 'analisado'} title="Marcar como analisado"><ClipboardDocumentCheckIcon className="h-4 w-4" /> Analisado</button>}
                                        <button type="button" className={rowActionClass} onClick={() => atualizar(a, 'resolvido')}><CheckCircleIcon className="h-4 w-4 text-emerald-600" /> Resolver</button>
                                    </div>
                                )}
                            </td>
                        </tr>
                    ))}
            </Tabela>
            {preferencias && <Preferencias onFechar={() => setPreferencias(false)} onSalvo={() => { setPreferencias(false); setFeedback({ tipo: 'ok', texto: 'Preferências salvas.' }); }} />}
        </section>
    );
};

const Auditoria = () => {
    const [dados, setDados] = useState(null);
    const [filtro, setFiltro] = useState({ situacao: 'aberta', severidade: '' });
    const [feedback, setFeedback] = useState(null);
    const [executando, setExecutando] = useState(false);
    const [justificando, setJustificando] = useState(null);
    const [justificativa, setJustificativa] = useState('');

    const carregar = useCallback(() => {
        const params = {};
        Object.entries(filtro).forEach(([k, v]) => { if (v) params[k] = v; });
        axiosInstance.get(`${API}/auditoria/`, { params }).then(({ data }) => setDados(data))
            .catch((e) => { setDados({ results: [], count: 0 }); setFeedback({ tipo: 'erro', texto: erroApi(e) }); });
    }, [filtro]);
    useEffect(() => { carregar(); }, [carregar]);

    const executar = async () => {
        setExecutando(true);
        try {
            const { data } = await axiosInstance.post(`${API}/auditoria/`, {});
            setFeedback({ tipo: 'ok', texto: `Verificação concluída: ${data.ocorrencias_criadas} nova(s) ocorrência(s).` });
            carregar();
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
        setExecutando(false);
    };

    const tratar = async (o, situacao, texto = '') => {
        try {
            await axiosInstance.patch(`${API}/auditoria/${o.id}/`, { situacao, justificativa: texto });
            setJustificando(null); setJustificativa('');
            carregar();
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
                {[['aberta', 'Abertas'], ['justificada', 'Justificadas'], ['resolvida', 'Resolvidas'], ['', 'Todas']].map(([v, t]) => (
                    <button key={t} type="button" className={`${chipClass} ${filtro.situacao === v ? chipOn : chipOff}`} onClick={() => setFiltro({ ...filtro, situacao: v })}>{t}</button>
                ))}
                <select className={`${controlClass} w-48`} value={filtro.severidade} onChange={(e) => setFiltro({ ...filtro, severidade: e.target.value })} aria-label="Severidade">
                    <option value="">Todas as severidades</option>{Object.entries(SEVERIDADE).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <button type="button" className={`${secondaryButtonClass} ml-auto`} onClick={executar} disabled={executando}>
                    {executando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <PlayIcon className="h-4 w-4" />} Executar verificações
                </button>
            </div>
            <Observacao>As ocorrências apontam pontos para análise do contador. Nenhuma regra automática afirma que uma operação é irregular.</Observacao>
            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />
            <Tabela
                colunas={[{ titulo: 'Severidade' }, { titulo: 'Ocorrência' }, { titulo: 'Empresa', className: 'hidden lg:table-cell' }, { titulo: 'Situação' }, { titulo: '', className: 'text-right' }]}
                vazio={dados && dados.results.length === 0 && <Vazio icone={ShieldExclamationIcon} titulo="Nenhuma ocorrência" texto="Execute as verificações para analisar os documentos capturados." />}
                rodape={dados && <span>{dados.count} ocorrência(s)</span>}
            >
                {!dados ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500"><ArrowPathIcon className="mr-2 inline h-5 w-5 animate-spin" />Carregando...</td></tr>
                    : dados.results.map((o) => (
                        <tr key={o.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <td className={tdClass}><Selo valor={o.severidade} texto={SEVERIDADE[o.severidade]} /></td>
                            <td className={tdClass}>
                                <p className="text-gray-900 dark:text-gray-100">{o.descricao}</p>
                                {o.justificativa && <p className="mt-1 text-xs text-gray-500">Justificativa: {o.justificativa}</p>}
                            </td>
                            <td className={`${tdClass} hidden text-xs lg:table-cell`}>{o.empresa_nome}</td>
                            <td className={tdClass}><Selo valor={o.situacao} texto={SITUACAO_OCORRENCIA[o.situacao]} /></td>
                            <td className={tdClass}>
                                <div className="flex justify-end gap-2">
                                    {o.situacao === 'aberta' ? <>
                                        <button type="button" className={rowActionClass} onClick={() => setJustificando(o)}>Justificar</button>
                                        <button type="button" className={rowActionClass} onClick={() => tratar(o, 'resolvida')}><CheckCircleIcon className="h-4 w-4 text-emerald-600" /> Resolver</button>
                                    </> : <button type="button" className={rowActionClass} onClick={() => tratar(o, 'aberta')}>Reabrir</button>}
                                </div>
                            </td>
                        </tr>
                    ))}
            </Tabela>
            {justificando && (
                <Modal aberto onFechar={() => setJustificando(null)} sobretitulo="Auditoria fiscal" titulo="Justificar ocorrência" subtitulo={justificando.descricao}
                    rodape={<><button type="button" className={secondaryButtonClass} onClick={() => setJustificando(null)}>Cancelar</button>
                        <button type="button" className={primaryButtonClass} disabled={justificativa.trim().length < 5} onClick={() => tratar(justificando, 'justificada', justificativa)}>Salvar justificativa</button></>}>
                    <label className="block"><span className={labelClass}>Análise do contador</span>
                        <textarea className={`${controlClass} h-28 py-2`} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Descreva por que a ocorrência está correta ou como foi tratada" /></label>
                </Modal>
            )}
        </section>
    );
};

const AlertasAuditoria = ({ pode }) => {
    const [aba, setAba] = useState('alertas');
    const podeAuditoria = pode('consultar_relatorios');
    return (
        <div className="space-y-4">
            <CabecalhoSecao titulo="Alertas e auditoria" descricao="Acompanhe os eventos relevantes e as inconsistências encontradas nos documentos.">
                <div className="flex gap-2">
                    <button type="button" className={`${chipClass} ${aba === 'alertas' ? chipOn : chipOff}`} onClick={() => setAba('alertas')}><BellAlertIcon className="h-4 w-4" /> Alertas</button>
                    {podeAuditoria && <button type="button" className={`${chipClass} ${aba === 'auditoria' ? chipOn : chipOff}`} onClick={() => setAba('auditoria')}><ShieldExclamationIcon className="h-4 w-4" /> Auditoria fiscal</button>}
                </div>
            </CabecalhoSecao>
            {aba === 'alertas' || !podeAuditoria ? <Alertas pode={pode} /> : <Auditoria />}
        </div>
    );
};

export default AlertasAuditoria;
