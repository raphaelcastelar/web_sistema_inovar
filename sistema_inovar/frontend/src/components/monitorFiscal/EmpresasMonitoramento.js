import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowPathIcon, BoltIcon, ClockIcon, Cog6ToothIcon, KeyIcon, PauseCircleIcon, PlayCircleIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import {
    CentralCarregando, CentralVazio, EmpresaFiltros, EmpresaIdentidade, controlClass, labelClass, primaryButtonClass,
    rowActionClass, secondaryButtonClass, useEmpresaFiltros,
} from '../centralShared';
import {
    API, CabecalhoSecao, Feedback, Modal, NOME_AMBIENTE, Observacao, ROTULOS_SERVICO, Selo, Tabela, checkboxClass, nomeTitular,
    erroApi, formatarData, tdClass,
} from './shared';

const FONTES = [['monitorar_nfe', 'NF-e'], ['monitorar_nfse', 'NFS-e'], ['monitorar_cte', 'CT-e'], ['monitorar_mdfe', 'MDF-e']];
const SITUACOES_PROBLEMA = ['erro', 'certificado_invalido', 'indisponivel', 'bloqueado'];

const Interruptor = ({ ativo, onChange, rotulo, descricao, desabilitado }) => (
    <label className={`flex items-start justify-between gap-4 rounded-md border border-gray-200 p-3 dark:border-gray-700 ${desabilitado ? 'opacity-60' : 'cursor-pointer'}`}>
        <span><span className="block text-sm font-semibold">{rotulo}</span>{descricao && <span className="text-xs text-gray-500 dark:text-gray-400">{descricao}</span>}</span>
        <input type="checkbox" className={`${checkboxClass} mt-1`} checked={!!ativo} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)} />
    </label>
);

const ConfiguracaoModal = ({ empresa, monitor, certificados, pode, ambientesPermitidos, ambientePadrao, onFechar, onSalvo }) => {
    const cfg = monitor?.configuracao || {};
    const [form, setForm] = useState({
        ativo: !!cfg.ativo, ambiente: cfg.ambiente || ambientePadrao, certificado: cfg.certificado || '',
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
    const [salvando, setSalvando] = useState(false);
    const alterar = (patch) => setForm((atual) => ({ ...atual, ...patch }));
    const raiz = String(empresa.cnpj || '').replace(/\D/g, '').slice(0, 8);
    const compativeis = certificados.filter((c) => c.ativo && c.cnpj.slice(0, 8) === raiz);
    const ambienteFixo = ambientesPermitidos.length === 1;

    const salvar = async () => {
        const dados = { ...form, dias_alerta_certificado: form.dias_alerta_certificado.split(',').map((d) => parseInt(d, 10)).filter(Boolean) };
        dados.certificado = form.certificado ? Number(form.certificado) : null;
        dados.ambiente = Number(ambienteFixo ? ambientesPermitidos[0] : form.ambiente);
        if (!pode('ativar_monitoramento')) ['ativo', 'ambiente', 'monitorar_nfe', 'monitorar_nfse', 'monitorar_cte', 'monitorar_mdfe', 'monitorar_eventos'].forEach((k) => delete dados[k]);
        if (!pode('configurar_ciencia_automatica')) { delete dados.ciencia_automatica; delete dados.ciencia_autorizacao_descricao; }
        if (!pode('configurar_integracoes')) ['inscricao_estadual', 'inscricao_municipal', 'codigo_ibge_municipio', 'codigo_uf'].forEach((k) => delete dados[k]);
        if (!pode('gerenciar_certificados')) delete dados.certificado;
        if (!pode('gerenciar_alertas')) ['alertas_fiscais', 'alertas_certificado', 'dias_alerta_certificado'].forEach((k) => delete dados[k]);
        setSalvando(true);
        try {
            await axiosInstance.patch(`${API}/empresas/${empresa.id}/configuracao/`, dados);
            onSalvo();
        } catch (e) { setErro(erroApi(e)); }
        setSalvando(false);
    };

    const texto = (campo, rotulo, placeholder) => (
        <label className="block"><span className={labelClass}>{rotulo}</span>
            <input className={controlClass} value={form[campo]} placeholder={placeholder} onChange={(e) => alterar({ [campo]: e.target.value })} /></label>
    );

    return (
        <Modal aberto onFechar={onFechar} largura="max-w-3xl" sobretitulo="Configuração do monitoramento" titulo={empresa.nome}
            subtitulo={`${empresa.cnpj} · ${empresa.cidade || '—'}/${empresa.uf || '—'} · ${empresa.regime_tributario || 'Regime não informado'}`}
            rodape={<>
                <button type="button" className={secondaryButtonClass} onClick={onFechar}>Cancelar</button>
                <button type="button" className={primaryButtonClass} onClick={salvar} disabled={salvando}>
                    {salvando && <ArrowPathIcon className="h-4 w-4 animate-spin" />} Salvar configuração
                </button>
            </>}>
            <div className="space-y-5">
                {erro && <Observacao tom="vermelho">{erro}</Observacao>}

                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Monitoramento</h3>
                    <Interruptor ativo={form.ativo} onChange={(v) => alterar({ ativo: v })} rotulo="Monitoramento fiscal ativo"
                        descricao="Desativado, a empresa não é consultada, mas o histórico capturado é mantido." desabilitado={!pode('ativar_monitoramento')} />
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block"><span className={labelClass}>Ambiente fiscal (SEFAZ)</span>
                            {ambienteFixo ? (
                                <p className={`${controlClass} flex items-center`}>{NOME_AMBIENTE[ambientesPermitidos[0]]} <span className="ml-2 text-xs text-gray-500">(definido pela instalação)</span></p>
                            ) : (
                                <select className={controlClass} value={form.ambiente} onChange={(e) => alterar({ ambiente: e.target.value })}>
                                    {ambientesPermitidos.map((a) => <option key={a} value={a}>{NOME_AMBIENTE[a]}</option>)}
                                </select>
                            )}
                        </label>
                        <label className="block"><span className={labelClass}>Certificado digital</span>
                            <select className={controlClass} value={form.certificado} onChange={(e) => alterar({ certificado: e.target.value })} disabled={!pode('gerenciar_certificados')}>
                                <option value="">Sem certificado</option>
                                {compativeis.map((c) => <option key={c.id} value={c.id}>{nomeTitular(c.titular)} · até {formatarData(c.valido_ate)}</option>)}
                            </select>
                        </label>
                    </div>
                    {compativeis.length === 0 && (
                        <Observacao>Nenhum certificado com o mesmo CNPJ raiz desta empresa. Cadastre o A1 da própria empresa na aba Certificados — o certificado do escritório não consulta documentos de clientes.</Observacao>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                        {[...FONTES, ['monitorar_eventos', 'Eventos']].map(([campo, rotulo]) => (
                            <label key={campo} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${form[campo] ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800/60' : 'border-gray-200 text-gray-500 dark:border-gray-700'}`}>
                                <input type="checkbox" className={checkboxClass} checked={!!form[campo]} onChange={(e) => alterar({ [campo]: e.target.checked })} disabled={!pode('ativar_monitoramento')} />
                                {rotulo}
                            </label>
                        ))}
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Dados da integração</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {texto('codigo_uf', 'Código IBGE da UF', 'Ex.: 32 (ES)')}
                        {texto('codigo_ibge_municipio', 'Código IBGE do município', 'Ex.: 3205309')}
                        {texto('inscricao_estadual', 'Inscrição estadual')}
                        {texto('inscricao_municipal', 'Inscrição municipal')}
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Ciência da Operação automática</h3>
                    <Interruptor ativo={form.ciencia_automatica} onChange={(v) => alterar({ ciencia_automatica: v })} rotulo="Registrar Ciência automaticamente"
                        descricao="Somente com autorização expressa do contribuinte. Confirmação, Desconhecimento e Operação não Realizada nunca são automáticas."
                        desabilitado={!pode('configurar_ciencia_automatica')} />
                    {form.ciencia_automatica && (
                        <label className="block"><span className={labelClass}>Registro da autorização</span>
                            <textarea className={`${controlClass} h-20 py-2`} placeholder="Quem autorizou, cargo e documento de autorização"
                                value={form.ciencia_autorizacao_descricao} onChange={(e) => alterar({ ciencia_autorizacao_descricao: e.target.value })} /></label>
                    )}
                    {cfg.ciencia_autorizada_em && <p className="text-xs text-gray-500">Autorização registrada em {formatarData(cfg.ciencia_autorizada_em, true)}.</p>}
                </section>

                <section className="space-y-3">
                    <h3 className="text-sm font-semibold">Alertas</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Interruptor ativo={form.alertas_fiscais} onChange={(v) => alterar({ alertas_fiscais: v })} rotulo="Alertas fiscais" desabilitado={!pode('gerenciar_alertas')} />
                        <Interruptor ativo={form.alertas_certificado} onChange={(v) => alterar({ alertas_certificado: v })} rotulo="Vencimento do certificado" desabilitado={!pode('gerenciar_alertas')} />
                    </div>
                    {texto('dias_alerta_certificado', 'Avisar com quantos dias de antecedência', '30, 15, 7, 1')}
                </section>
            </div>
        </Modal>
    );
};

const HistoricoModal = ({ controle, onFechar }) => {
    const [execucoes, setExecucoes] = useState(null);
    useEffect(() => { axiosInstance.get(`${API}/controles/${controle.id}/execucoes/`).then(({ data }) => setExecucoes(data)).catch(() => setExecucoes([])); }, [controle.id]);
    return (
        <Modal aberto onFechar={onFechar} largura="max-w-4xl" sobretitulo={`${controle.fonte_display} · ${NOME_AMBIENTE[controle.ambiente]}`} titulo="Histórico de sincronização"
            subtitulo={`Último NSU ${Number(controle.ult_nsu)} · maior NSU ${controle.max_nsu ? Number(controle.max_nsu) : '—'} · ${controle.documentos_recuperados} documento(s) · ${controle.total_erros} erro(s)`}>
            <div className="space-y-3">
                {controle.inconsistencia && <Observacao tom="vermelho">{controle.inconsistencia}</Observacao>}
                {controle.lacunas_nsu?.length > 0 && <Observacao tom="ambar">NSUs faltantes na sequência: {controle.lacunas_nsu.slice(0, 30).map(Number).join(', ')}{controle.lacunas_nsu.length > 30 ? '…' : ''}</Observacao>}
                {controle.ultima_mensagem && <Observacao>Última resposta: {controle.ultimo_cstat && `${controle.ultimo_cstat} · `}{controle.ultima_mensagem}</Observacao>}
                <Tabela colunas={[{ titulo: 'Início' }, { titulo: 'Origem' }, { titulo: 'NSU' }, { titulo: 'Documentos' }, { titulo: 'Retorno' }]}
                    vazio={execucoes && execucoes.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">Nenhuma sincronização executada ainda.</p>}>
                    {(execucoes || []).map((e) => (
                        <tr key={e.id}>
                            <td className={`${tdClass} whitespace-nowrap text-xs`}>{formatarData(e.iniciado_em, true)}</td>
                            <td className={`${tdClass} text-xs`}>{e.origem}</td>
                            <td className={`${tdClass} text-xs tabular-nums`}>{Number(e.nsu_inicial)} → {Number(e.nsu_final)}</td>
                            <td className={`${tdClass} text-xs tabular-nums`}>{e.documentos} em {e.lotes} lote(s)</td>
                            <td className={`${tdClass} text-xs`}><Selo valor={e.sucesso ? 'completo' : 'erro'} texto={e.cstat || (e.sucesso ? 'ok' : 'falha')} /> <span className="text-gray-500">{e.mensagem}</span></td>
                        </tr>
                    ))}
                </Tabela>
            </div>
        </Modal>
    );
};

const ServicosEmpresa = ({ monitor, onHistorico }) => {
    const controles = (monitor?.controles || []).filter((ct) => ct.situacao !== 'desativado');
    if (!monitor?.configuracao?.ativo) return <span className="text-xs text-gray-400">Monitoramento desativado</span>;
    if (!controles.length) return <span className="text-xs text-gray-400">Nenhum serviço habilitado</span>;
    return (
        <div className="space-y-1.5">
            {controles.map((ct) => (
                <button type="button" key={ct.id} onClick={() => onHistorico(ct)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800">
                    <span className="w-11 font-semibold text-gray-700 dark:text-gray-200">{ROTULOS_SERVICO[ct.fonte]}</span>
                    <Selo valor={ct.situacao} texto={ct.situacao_display} />
                    <span className="hidden truncate text-gray-500 2xl:inline">
                        {ct.bloqueado_ate ? `até ${formatarData(ct.bloqueado_ate, true)}` : ct.proxima_consulta_em ? `próxima ${formatarData(ct.proxima_consulta_em, true)}` : `${ct.documentos_recuperados} doc.`}
                    </span>
                </button>
            ))}
        </div>
    );
};

const EmpresasMonitoramento = ({ pode, ambiente, ambientesPermitidos }) => {
    const [monitor, setMonitor] = useState({});
    const [certificados, setCertificados] = useState([]);
    const [editando, setEditando] = useState(null);
    const [historico, setHistorico] = useState(null);
    const [selecionadas, setSelecionadas] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [sincronizando, setSincronizando] = useState(null);
    const podeCertificados = pode('gerenciar_certificados');

    const carregarMonitor = useCallback(() => {
        axiosInstance.get(`${API}/empresas/`)
            .then(({ data }) => setMonitor(Object.fromEntries(data.map((item) => [item.id, item]))))
            .catch((e) => setFeedback({ tipo: 'erro', texto: erroApi(e) }));
    }, []);
    useEffect(() => { carregarMonitor(); }, [carregarMonitor]);
    useEffect(() => {
        if (podeCertificados) axiosInstance.get(`${API}/certificados/`).then(({ data }) => setCertificados(data)).catch(() => {});
    }, [podeCertificados]);

    const extraFilters = useMemo(() => [
        { key: 'mfAtivas', label: 'Monitoramento ativo', description: 'Somente empresas com o Monitor Fiscal ativo.', predicate: (e) => !!monitor[e.id]?.configuracao?.ativo },
        { key: 'mfSemCertificado', label: 'Sem certificado', description: 'Empresas sem certificado digital vinculado.', predicate: (e) => !monitor[e.id]?.configuracao?.certificado },
        { key: 'mfProblema', label: 'Com problema', description: 'Erro, bloqueio, indisponibilidade ou certificado inválido.', predicate: (e) => (monitor[e.id]?.controles || []).some((ct) => SITUACOES_PROBLEMA.includes(ct.situacao)) },
    ], [monitor]);
    const filtros = useEmpresaFiltros({ storageKey: 'monitorFiscalEmpresasFiltros', extraFilters });
    const { filteredEmpresas, loading, activeFilterCount, clearFilters } = filtros;

    const sincronizar = async (empresa) => {
        setSincronizando(empresa.id);
        try {
            const { data } = await axiosInstance.post(`${API}/empresas/${empresa.id}/sincronizar/`, {});
            const partes = data.resultados.map((r) => `${ROTULOS_SERVICO[r.fonte]}: ${r.mensagem || (r.sucesso ? 'concluído' : 'falha')}`);
            setFeedback({ tipo: data.resultados.some((r) => r.sucesso) ? 'ok' : 'erro', texto: `${empresa.nome} — ${partes.join(' | ') || 'nenhuma fonte habilitada.'}` });
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
        setSincronizando(null);
        carregarMonitor();
    };

    const lote = async (configuracao, texto) => {
        try {
            const { data } = await axiosInstance.post(`${API}/empresas/lote/`, { empresa_ids: selecionadas, configuracao });
            const falhas = data.resultados.filter((r) => !r.sucesso);
            setFeedback({ tipo: falhas.length ? 'erro' : 'ok', texto: falhas.length ? falhas.map((f) => `${f.nome}: ${typeof f.erro === 'string' ? f.erro : 'erro'}`).join(' | ') : texto });
            carregarMonitor();
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const sincronizarLote = async () => {
        try {
            const { data } = await axiosInstance.post(`${API}/sincronizar-lote/`, { empresa_ids: selecionadas });
            setFeedback({ tipo: 'ok', texto: data.mensagem });
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const todasSelecionadas = filteredEmpresas.length > 0 && filteredEmpresas.every((e) => selecionadas.includes(e.id));

    return (
        <div className="space-y-4">
            <CabecalhoSecao titulo="Empresas monitoradas" descricao={`Configuração, certificado e situação de cada serviço no ambiente de ${NOME_AMBIENTE[ambiente].toLowerCase()}. Clique em um serviço para ver o histórico.`}>
                <button type="button" className={secondaryButtonClass} onClick={() => { filtros.reload({ silent: true }); carregarMonitor(); }}>
                    <ArrowPathIcon className="h-4 w-4" /> Atualizar
                </button>
            </CabecalhoSecao>

            <EmpresaFiltros filtros={filtros} />
            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />

            <AnimatePresence initial={false}>
                {selecionadas.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <span className="text-sm text-gray-700 dark:text-gray-200"><span className="font-semibold tabular-nums">{selecionadas.length}</span> empresa(s) selecionada(s)</span>
                            <div className="flex flex-wrap gap-2">
                                {pode('ativar_monitoramento') && <>
                                    <button type="button" className={rowActionClass} onClick={() => lote({ ativo: true }, 'Monitoramento ativado.')}><PlayCircleIcon className="h-4 w-4 text-emerald-600" /> Ativar</button>
                                    <button type="button" className={rowActionClass} onClick={() => lote({ ativo: false }, 'Monitoramento desativado. O histórico foi mantido.')}><PauseCircleIcon className="h-4 w-4 text-amber-600" /> Desativar</button>
                                </>}
                                {pode('solicitar_sincronizacao') && <button type="button" className={primaryButtonClass} onClick={sincronizarLote}><BoltIcon className="h-4 w-4" /> Sincronizar</button>}
                                <button type="button" className={secondaryButtonClass} onClick={() => setSelecionadas([])}>Limpar seleção</button>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Consultas respeitam o intervalo obrigatório de 1 hora sem documentos e os bloqueios da SEFAZ; empresas em espera são consultadas quando permitido.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? <CentralCarregando /> : filteredEmpresas.length === 0 ? (
                <CentralVazio temFiltros={activeFilterCount > 0} onLimpar={clearFilters} />
            ) : (
                <Tabela
                    colunas={[
                        { titulo: <input type="checkbox" className={checkboxClass} checked={todasSelecionadas} onChange={(e) => setSelecionadas(e.target.checked ? filteredEmpresas.map((x) => x.id) : [])} aria-label="Selecionar todas" />, className: 'w-10' },
                        { titulo: 'Empresa' }, { titulo: 'Certificado', className: 'hidden lg:table-cell' }, { titulo: 'Serviços' }, { titulo: 'Ações', className: 'text-right' },
                    ]}
                    rodape={<span>Exibindo {filteredEmpresas.length} empresa(s) · ambiente fiscal: {NOME_AMBIENTE[ambiente]}</span>}
                >
                    {filteredEmpresas.map((empresa) => {
                        const dados = monitor[empresa.id];
                        const cfg = dados?.configuracao;
                        const cert = cfg?.certificado_info;
                        const selecionada = selecionadas.includes(empresa.id);
                        return (
                            <tr key={empresa.id} className={`transition-colors ${selecionada ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                                <td className="px-4 py-4 align-top">
                                    <input type="checkbox" className={`${checkboxClass} mt-1`} checked={selecionada} aria-label={`Selecionar ${empresa.nome}`}
                                        onChange={() => setSelecionadas(selecionada ? selecionadas.filter((i) => i !== empresa.id) : [...selecionadas, empresa.id])} />
                                </td>
                                <td className="min-w-64 px-4 py-4 align-top">
                                    <EmpresaIdentidade empresa={empresa} alerta={cfg?.ativo && (
                                        <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Monitorada
                                        </span>
                                    )} />
                                </td>
                                <td className="hidden px-4 py-4 align-top text-xs lg:table-cell">
                                    {cert ? (
                                        <div className="space-y-1">
                                            <p className="flex items-center gap-1.5 font-medium text-gray-800 dark:text-gray-100"><KeyIcon className="h-3.5 w-3.5" />{nomeTitular(cert.titular)}</p>
                                            <Selo valor={cert.vencido ? 'vencido' : cert.dias_para_vencer <= 30 ? 'vencendo' : 'vigente'} texto={cert.vencido ? 'Vencido' : `Válido até ${formatarData(cert.valido_ate)}`} />
                                        </div>
                                    ) : <span className="text-gray-400">Sem certificado</span>}
                                </td>
                                <td className="min-w-56 px-4 py-4 align-top"><ServicosEmpresa monitor={dados} onHistorico={setHistorico} /></td>
                                <td className="px-4 py-4 align-top">
                                    <div className="flex min-w-max flex-wrap justify-end gap-2">
                                        <button type="button" className={rowActionClass} onClick={() => setEditando(empresa)}><Cog6ToothIcon className="h-4 w-4" /> Configurar</button>
                                        {pode('solicitar_sincronizacao') && cfg?.ativo && (
                                            <button type="button" className={rowActionClass} disabled={sincronizando === empresa.id} onClick={() => sincronizar(empresa)}>
                                                {sincronizando === empresa.id ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <BoltIcon className="h-4 w-4 text-[#c49a61]" />}
                                                {sincronizando === empresa.id ? 'Consultando...' : 'Sincronizar'}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Tabela>
            )}

            {editando && (
                <ConfiguracaoModal empresa={editando} monitor={monitor[editando.id]} certificados={certificados} pode={pode}
                    ambientesPermitidos={ambientesPermitidos} ambientePadrao={ambiente} onFechar={() => setEditando(null)}
                    onSalvo={() => { setEditando(null); carregarMonitor(); setFeedback({ tipo: 'ok', texto: 'Configuração salva.' }); }} />
            )}
            {historico && <HistoricoModal controle={historico} onFechar={() => setHistorico(null)} />}
            <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"><ClockIcon className="h-4 w-4" /> A sincronização automática roda pelo agendador do servidor, respeitando os intervalos de cada empresa.</p>
        </div>
    );
};

export default EmpresasMonitoramento;
