import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AdjustmentsHorizontalIcon, ArchiveBoxArrowDownIcon, ArrowPathIcon, CheckBadgeIcon, CodeBracketIcon,
    DocumentArrowDownIcon, DocumentMagnifyingGlassIcon, DocumentTextIcon, ExclamationTriangleIcon, FunnelIcon,
    HandRaisedIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import {
    cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, secondaryButtonClass,
} from '../centralShared';
import {
    API, CabecalhoSecao, Feedback, Modal, NOME_AMBIENTE, Observacao, Selo, Tabela, Vazio, baixar,
    checkboxClass, erroApi, formatarData, formatarDocumento, moeda, origens, tdClass,
} from './shared';

const filtrosIniciais = (ambiente, modoManifestacao) => ({
    empresa: '', tipo_documento: modoManifestacao ? 'NFE' : '', classificacao: '', situacao_fiscal: '', situacao_xml: '',
    situacao_manifestacao: modoManifestacao ? 'nao_manifestada,ciencia' : '', situacao_conferencia: '', origem: '',
    emissao_inicio: '', emissao_fim: '', captura_inicio: '', captura_fim: '', competencia: '', chave: '', numero: '',
    serie: '', emitente: '', destinatario: '', documento: '', municipio: '', valor_min: '', valor_max: '',
    estabelecimento: '', ambiente: String(ambiente), ordenacao: '-data_emissao',
});

const OPCOES = {
    tipo_documento: [['NFE', 'NF-e'], ['NFSE', 'NFS-e'], ['CTE', 'CT-e'], ['MDFE', 'MDF-e']],
    classificacao: [['entrada', 'Entrada'], ['saida', 'Saída'], ['servico_prestado', 'Serviço prestado'], ['servico_tomado', 'Serviço tomado'],
        ['intermediacao', 'Intermediação'], ['transporte_contratado', 'Transporte contratado'], ['transporte_prestado', 'Transporte prestado'],
        ['terceiro_autorizado', 'Terceiro autorizado'], ['outros', 'Outros']],
    situacao_fiscal: [['autorizado', 'Autorizado'], ['cancelado', 'Cancelado'], ['substituido', 'Substituído'], ['denegado', 'Denegado'], ['encerrado', 'Encerrado'], ['desconhecida', 'Desconhecida']],
    situacao_xml: [['completo', 'XML completo'], ['resumo', 'Somente resumo'], ['pendente', 'Pendente'], ['erro', 'Erro']],
    situacao_manifestacao: [['nao_manifestada,ciencia', 'Pendentes de conclusão'], ['nao_manifestada', 'Não manifestada'], ['ciencia', 'Ciência'], ['confirmada', 'Confirmada'],
        ['desconhecida', 'Desconhecida'], ['nao_realizada', 'Não realizada'], ['nao_aplicavel', 'Não aplicável']],
    situacao_conferencia: [['pendente', 'Pendente'], ['conferido', 'Conferido'], ['inconsistente', 'Com inconsistência'], ['em_analise', 'Aguardando análise']],
    origem: [['AN_NFE', 'SEFAZ · NF-e'], ['AN_CTE', 'SEFAZ · CT-e'], ['ADN_NFSE', 'ADN · NFS-e'], ['AN_MDFE', 'SVRS · MDF-e'], ['IMPORTACAO_MANUAL', 'Importação manual']],
    ambiente: [['1', 'Produção'], ['2', 'Homologação']],
    ordenacao: [['-data_emissao', 'Emissão mais recente'], ['data_emissao', 'Emissão mais antiga'], ['-valor_total', 'Maior valor'],
        ['valor_total', 'Menor valor'], ['-capturado_em', 'Captura mais recente'], ['emitente_nome', 'Emitente (A-Z)'], ['empresa__nome', 'Empresa (A-Z)']],
};

const EVENTOS = [
    ['210210', 'Ciência da Operação', 'Declara que conhece a nota, sem concluir. Libera o XML completo.'],
    ['210200', 'Confirmação da Operação', 'Confirma que a operação ocorreu e a mercadoria foi recebida.'],
    ['210220', 'Desconhecimento da Operação', 'Declara que a empresa não reconhece esta operação.'],
    ['210240', 'Operação não Realizada', 'A operação não aconteceu (exige justificativa).'],
];

const Campo = ({ rotulo, children }) => (<label className="block"><span className={labelClass}>{rotulo}</span>{children}</label>);

const Selecao = ({ nome, rotulo, filtros, alterar, semTodos }) => (
    <Campo rotulo={rotulo}>
        <select className={controlClass} value={filtros[nome]} onChange={(e) => alterar({ [nome]: e.target.value })}>
            {!semTodos && <option value="">Todos</option>}
            {OPCOES[nome].map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
    </Campo>
);

const Texto = ({ nome, rotulo, filtros, alterar, tipo = 'text', placeholder }) => (
    <Campo rotulo={rotulo}>
        <input type={tipo} className={controlClass} value={filtros[nome]} placeholder={placeholder} onChange={(e) => alterar({ [nome]: e.target.value })} />
    </Campo>
);

/* ------------------------------------------------------------------ *
 * Detalhe do documento
 * ------------------------------------------------------------------ */
const Secao = ({ titulo, children, acao }) => (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900/70">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{titulo}</h3>
            {acao}
        </div>
        <div className="p-4 text-sm">{children}</div>
    </section>
);

const Pares = ({ dados }) => {
    const validos = dados.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '—');
    if (!validos.length) return <p className="text-xs text-gray-500">Informação não disponível.</p>;
    return (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            {validos.map(([k, v]) => (
                <div key={k} className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-400">{k}</dt>
                    <dd className="mt-0.5 break-words text-gray-900 dark:text-gray-100">{v}</dd>
                </div>
            ))}
        </dl>
    );
};

const DetalheDocumento = ({ id, pode, ambientesPermitidos, onFechar, onAtualizado }) => {
    const [doc, setDoc] = useState(null);
    const [xml, setXml] = useState('');
    const [feedback, setFeedback] = useState(null);
    const [manif, setManif] = useState({ tipo_evento: '210210', justificativa: '' });
    const [confirmando, setConfirmando] = useState(false);
    const [enviando, setEnviando] = useState(false);
    const [observacao, setObservacao] = useState('');

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/documentos/${id}/`)
            .then(({ data }) => { setDoc(data); setObservacao(data.observacao_interna || ''); })
            .catch((e) => setFeedback({ tipo: 'erro', texto: erroApi(e) }));
    }, [id]);
    useEffect(() => { carregar(); }, [carregar]);

    const atualizar = async (dados, texto) => {
        try {
            const { data } = await axiosInstance.patch(`${API}/documentos/${id}/`, dados);
            setDoc(data);
            onAtualizado();
            setFeedback({ tipo: 'ok', texto });
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const manifestar = async () => {
        setEnviando(true);
        try {
            const { data } = await axiosInstance.post(`${API}/documentos/${id}/manifestar/`, { ...manif, confirmacao: true });
            setFeedback({ tipo: 'ok', texto: `Evento registrado na SEFAZ. Protocolo ${data.protocolo}.` });
        } catch (e) {
            const dados = e?.response?.data;
            setFeedback({ tipo: 'erro', texto: dados?.motivo ? `Rejeitado pela SEFAZ (${dados.cstat}): ${dados.motivo}` : erroApi(e) });
        } finally {
            setEnviando(false);
            setConfirmando(false);
            carregar();
            onAtualizado();
        }
    };

    const dados = doc?.dados || {};
    const trib = doc?.valores_tributarios;
    const resumo = doc?.situacao_xml === 'resumo';
    const participantes = (doc?.participantes?.lista || []).filter(Boolean);
    const podeManifestarAqui = doc && pode('realizar_manifestacao') && ambientesPermitidos.includes(doc.ambiente);
    const eventoEscolhido = EVENTOS.find(([v]) => v === manif.tipo_evento);

    return (
        <Modal
            aberto
            onFechar={onFechar}
            largura="max-w-5xl"
            sobretitulo={doc ? `${doc.tipo_documento_display} · ${doc.empresa_nome}` : 'Documento fiscal'}
            titulo={doc ? `Nº ${doc.numero || '—'}${doc.serie ? ` · série ${doc.serie}` : ''}` : 'Carregando...'}
            subtitulo={doc && (
                <div className="space-y-2">
                    <p className="break-all font-mono text-xs">{doc.chave}</p>
                    <div className="flex flex-wrap gap-1.5">
                        <Selo valor={doc.situacao_fiscal} texto={doc.situacao_fiscal_display} />
                        <Selo valor={doc.situacao_xml} texto={doc.situacao_xml_display} />
                        {doc.situacao_manifestacao !== 'nao_aplicavel' && <Selo valor={doc.situacao_manifestacao} texto={doc.situacao_manifestacao_display} />}
                        <Selo valor={doc.situacao_conferencia} texto={`Conferência: ${doc.situacao_conferencia_display}`} />
                        {doc.ambiente === 2 && <Selo tom="ambar" texto="Homologação · sem valor fiscal" />}
                    </div>
                </div>
            )}
            rodape={doc && (
                <>
                    {pode('baixar_documentos') && (
                        <>
                            <button type="button" className={secondaryButtonClass} onClick={() => axiosInstance.get(`${API}/documentos/${id}/xml/`, { params: { visualizar: 1 } }).then(({ data }) => setXml(data.xml))}>
                                <CodeBracketIcon className="h-4 w-4" /> Ver XML
                            </button>
                            {!resumo && (
                                <button type="button" className={secondaryButtonClass} onClick={() => baixar(`${API}/documentos/${id}/pdf/`, {}, `${doc.chave}.pdf`).catch(() => setFeedback({ tipo: 'erro', texto: 'Documento auxiliar indisponível.' }))}>
                                    <DocumentTextIcon className="h-4 w-4" /> PDF auxiliar
                                </button>
                            )}
                            <button type="button" className={primaryButtonClass} onClick={() => baixar(`${API}/documentos/${id}/xml/`, {}, `${doc.chave}.xml`)}>
                                <DocumentArrowDownIcon className="h-4 w-4" /> Baixar XML
                            </button>
                        </>
                    )}
                </>
            )}
        >
            {!doc ? <p className="text-sm text-gray-500">Carregando...</p> : (
                <div className="space-y-4">
                    <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />
                    {resumo && (
                        <Observacao tom="ambar">
                            Somente o resumo da NF-e está disponível. Ainda indisponíveis: {doc.informacoes_indisponiveis.join(', ')}.
                            A SEFAZ libera o XML completo ao destinatário depois da Ciência, Confirmação ou Operação não Realizada.
                        </Observacao>
                    )}

                    <div className="flex flex-wrap gap-2">
                        <button type="button" className={rowActionClass} onClick={() => atualizar({ situacao_conferencia: 'conferido' }, 'Documento marcado como conferido.')}>
                            <CheckBadgeIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Marcar como conferido
                        </button>
                        <button type="button" className={rowActionClass} onClick={() => atualizar({ situacao_conferencia: 'inconsistente' }, 'Documento marcado com inconsistência.')}>
                            <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Marcar inconsistência
                        </button>
                    </div>

                    <Secao titulo="Informações gerais">
                        <Pares dados={[
                            ['Emissão', formatarData(doc.data_emissao, true)], ['Competência', doc.competencia ? doc.competencia.slice(0, 7).split('-').reverse().join('/') : ''],
                            ['Autorização', formatarData(doc.data_autorizacao, true)], ['Protocolo', doc.protocolo],
                            ['Classificação', doc.classificacao_display], ['Valor total', moeda(doc.valor_total)],
                            ['Natureza da operação', dados.natureza_operacao], ['Município', doc.municipio_nome],
                            ['Origem da captura', origens(doc.fontes)], ['Ambiente', NOME_AMBIENTE[doc.ambiente]],
                        ]} />
                    </Secao>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Secao titulo="Emitente / Prestador">
                            <Pares dados={[['Nome', doc.emitente_nome], ['CNPJ/CPF', formatarDocumento(doc.emitente_documento)], ['Inscrição estadual', doc.emitente_ie]]} />
                        </Secao>
                        <Secao titulo="Destinatário / Tomador">
                            {resumo ? <p className="text-xs text-gray-500">Disponível após o XML completo.</p>
                                : <Pares dados={[['Nome', doc.destinatario_nome], ['CNPJ/CPF', formatarDocumento(doc.destinatario_documento)]]} />}
                        </Secao>
                    </div>

                    {participantes.length > 2 && (
                        <Secao titulo="Participantes">
                            <Pares dados={participantes.map((p) => [p.papel.replace('_', ' '), `${p.nome || ''} ${formatarDocumento(p.documento)}`.trim()])} />
                        </Secao>
                    )}
                    {doc.tipo_documento === 'NFSE' && (
                        <Secao titulo="Serviço">
                            <Pares dados={[['Código nacional', dados.codigo_servico], ['Código municipal', dados.codigo_servico_municipal],
                                ['Município de emissão', dados.municipio_emissao], ['Município de incidência', dados.municipio_incidencia], ['Descrição', dados.descricao_servico]]} />
                        </Secao>
                    )}
                    {doc.tipo_documento === 'CTE' && (
                        <Secao titulo="Transporte">
                            <Pares dados={[['Modal', dados.modal], ['CFOP', dados.cfop], ['Origem', dados.municipio_origem], ['Destino', dados.municipio_destino], ['Valor a receber', moeda(dados.valor_receber)]]} />
                        </Secao>
                    )}

                    {doc.itens.length > 0 && (
                        <Secao titulo={`Produtos (${doc.itens.length})`}>
                            <div className="-m-4 overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-100 text-xs dark:divide-gray-800">
                                    <thead><tr>{['#', 'Código', 'Descrição', 'NCM', 'CFOP', 'Quantidade', 'Unitário', 'Total'].map((t) => (
                                        <th key={t} className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">{t}</th>))}</tr></thead>
                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{doc.itens.map((i) => (
                                        <tr key={i.id}>
                                            <td className="px-4 py-2 tabular-nums">{i.numero_item}</td><td className="px-4 py-2">{i.codigo}</td>
                                            <td className="px-4 py-2">{i.descricao}</td><td className="px-4 py-2 tabular-nums">{i.ncm}</td>
                                            <td className="px-4 py-2 tabular-nums">{i.cfop}</td><td className="whitespace-nowrap px-4 py-2 tabular-nums">{Number(i.quantidade || 0).toLocaleString('pt-BR')} {i.unidade}</td>
                                            <td className="px-4 py-2 tabular-nums">{moeda(i.valor_unitario)}</td><td className="px-4 py-2 font-semibold tabular-nums">{moeda(i.valor_total)}</td>
                                        </tr>))}</tbody>
                                </table>
                            </div>
                        </Secao>
                    )}

                    {trib && Object.keys(trib).length > 0 && (
                        <Secao titulo="Tributos e totais">
                            <Pares dados={Object.entries(trib).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)])} />
                            {Object.entries(trib).filter(([, v]) => v && typeof v === 'object').map(([grupo, valores]) => (
                                <div key={grupo} className="mt-4"><p className="mb-2 text-xs font-semibold">{grupo}</p>
                                    <Pares dados={Object.entries(valores).map(([k, v]) => [k, String(v)])} /></div>
                            ))}
                        </Secao>
                    )}

                    {(dados.informacoes_complementares || dados.informacoes_fisco) && (
                        <Secao titulo="Informações adicionais"><p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{[dados.informacoes_complementares, dados.informacoes_fisco].filter(Boolean).join('\n\n')}</p></Secao>
                    )}
                    {((dados.referencias || []).length > 0 || (dados.documentos_relacionados || []).length > 0 || doc.chave_substituta) && (
                        <Secao titulo="Documentos relacionados">
                            <ul className="space-y-1 font-mono text-xs">{[...(dados.referencias || []), ...(dados.documentos_relacionados || [])].map((c) => <li key={c}>{c}</li>)}</ul>
                            {doc.chave_substituta && <p className="mt-2 text-xs">Substituída pela NFS-e <span className="font-mono">{doc.chave_substituta}</span></p>}
                        </Secao>
                    )}

                    <Secao titulo={`Eventos (${doc.eventos.length})`}>
                        {doc.eventos.length === 0 ? <p className="text-xs text-gray-500">Nenhum evento recebido para este documento.</p> : (
                            <ul className="divide-y divide-gray-100 dark:divide-gray-800">{doc.eventos.map((ev) => (
                                <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                    <span>
                                        <span className="font-medium">{ev.descricao || ev.tipo_evento}</span>
                                        <span className="block text-xs text-gray-500">{ev.tipo_evento} · sequência {ev.sequencia} · {formatarData(ev.data_evento, true)}{ev.protocolo && ` · protocolo ${ev.protocolo}`}{!ev.completo && ' · resumo'}</span>
                                    </span>
                                    {pode('baixar_documentos') && ev.completo && (
                                        <button type="button" className={rowActionClass} onClick={() => baixar(`${API}/documentos/${id}/eventos/${ev.id}/xml/`, {}, `evento-${ev.tipo_evento}.xml`)}>
                                            <DocumentArrowDownIcon className="h-4 w-4" /> XML
                                        </button>
                                    )}
                                </li>))}</ul>
                        )}
                    </Secao>

                    {doc.situacao_manifestacao !== 'nao_aplicavel' && (
                        <Secao titulo="Manifestação do destinatário">
                            {doc.manifestacoes.length > 0 && (
                                <ul className="mb-4 divide-y divide-gray-100 dark:divide-gray-800">{doc.manifestacoes.map((m) => (
                                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                                        <span><span className="font-semibold">{m.tipo_evento_display}</span> · {m.solicitado_por_nome} · {formatarData(m.criado_em, true)}
                                            {(m.cstat || m.motivo) && <span className="block text-gray-500">{m.cstat && `cStat ${m.cstat} · `}{m.motivo}{m.protocolo && ` · protocolo ${m.protocolo}`}</span>}</span>
                                        <Selo valor={m.situacao} texto={m.situacao} />
                                    </li>))}</ul>
                            )}
                            {podeManifestarAqui ? (
                                <div className="space-y-3">
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {EVENTOS.map(([valor, titulo, descricao]) => (
                                            <label key={valor} className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors ${manif.tipo_evento === valor ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800/60' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/40'}`}>
                                                <input type="radio" name="evento" className="mt-0.5" checked={manif.tipo_evento === valor} onChange={() => { setManif({ ...manif, tipo_evento: valor }); setConfirmando(false); }} />
                                                <span><span className="block text-sm font-semibold">{titulo}</span><span className="text-xs text-gray-500 dark:text-gray-400">{descricao}</span></span>
                                            </label>
                                        ))}
                                    </div>
                                    {manif.tipo_evento === '210240' && (
                                        <Campo rotulo="Justificativa (15 a 255 caracteres)">
                                            <input className={controlClass} value={manif.justificativa} onChange={(e) => setManif({ ...manif, justificativa: e.target.value })} />
                                        </Campo>
                                    )}
                                    {!confirmando ? (
                                        <button type="button" className={primaryButtonClass} onClick={() => setConfirmando(true)}>
                                            <HandRaisedIcon className="h-4 w-4" /> Manifestar
                                        </button>
                                    ) : (
                                        <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                                            <span>Transmitir <strong>{eventoEscolhido?.[1]}</strong> à SEFAZ ({NOME_AMBIENTE[doc.ambiente]})? O evento é oficial e não pode ser desfeito.</span>
                                            <span className="flex gap-2">
                                                <button type="button" className={secondaryButtonClass} onClick={() => setConfirmando(false)} disabled={enviando}>Cancelar</button>
                                                <button type="button" className={primaryButtonClass} onClick={manifestar} disabled={enviando}>
                                                    {enviando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <HandRaisedIcon className="h-4 w-4" />}
                                                    {enviando ? 'Transmitindo...' : 'Confirmar'}
                                                </button>
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {pode('realizar_manifestacao') ? 'Esta instalação não transmite eventos no ambiente deste documento.' : 'Você não tem permissão para realizar manifestações.'}
                                </p>
                            )}
                        </Secao>
                    )}

                    <Secao titulo="Observação interna" acao={
                        <button type="button" className="text-xs font-semibold text-slate-700 underline dark:text-slate-300" onClick={() => atualizar({ observacao_interna: observacao }, 'Observação salva.')}>Salvar</button>
                    }>
                        <textarea className={`${controlClass} h-20 py-2`} value={observacao} placeholder="Anotações da equipe (não alteram o documento fiscal)" onChange={(e) => setObservacao(e.target.value)} />
                    </Secao>

                    <Secao titulo="Histórico de captura">
                        <ul className="divide-y divide-gray-100 text-xs dark:divide-gray-800">{doc.recebimentos.map((r, i) => (
                            <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                                <span>{r.fonte}{r.nsu && ` · NSU ${Number(r.nsu)}`} · {r.tipo_conteudo}</span>
                                <span className="text-gray-500">{formatarData(r.recebido_em, true)}{r.erro && ` · ${r.erro}`}</span>
                            </li>))}</ul>
                    </Secao>

                    {xml && (
                        <Secao titulo="XML original" acao={<button type="button" onClick={() => setXml('')} className="text-xs font-semibold underline">Ocultar</button>}>
                            <pre className="max-h-96 overflow-auto rounded-md bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-700 dark:bg-gray-950 dark:text-gray-300">{xml}</pre>
                        </Secao>
                    )}
                </div>
            )}
        </Modal>
    );
};

/* ------------------------------------------------------------------ *
 * Listagem
 * ------------------------------------------------------------------ */
const Documentos = ({ pode, ambiente, ambientesPermitidos, modoManifestacao = false }) => {
    const inicial = filtrosIniciais(ambiente, modoManifestacao);
    const [filtros, setFiltros] = useState(inicial);
    const [aplicados, setAplicados] = useState(inicial);
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState({ results: [], count: 0 });
    const [empresas, setEmpresas] = useState([]);
    const [selecionados, setSelecionados] = useState([]);
    const [aberto, setAberto] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [feedback, setFeedback] = useState(null);
    const [avancado, setAvancado] = useState(false);
    const [exportando, setExportando] = useState(false);

    const alterar = (patch) => setFiltros((atual) => ({ ...atual, ...patch }));

    useEffect(() => {
        axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {});
    }, []);

    const parametros = useCallback(() => {
        const p = { page: pagina };
        Object.entries(aplicados).forEach(([k, v]) => { if (v !== '') p[k] = v; });
        return p;
    }, [aplicados, pagina]);

    const carregar = useCallback(() => {
        setCarregando(true);
        axiosInstance.get(`${API}/documentos/`, { params: parametros() })
            .then(({ data }) => setDados(data))
            .catch((e) => setFeedback({ tipo: 'erro', texto: erroApi(e) }))
            .finally(() => setCarregando(false));
    }, [parametros]);
    useEffect(() => { carregar(); }, [carregar]);

    const aplicar = () => { setPagina(1); setSelecionados([]); setAplicados(filtros); };
    const limpar = () => { setFiltros(inicial); setAplicados(inicial); setPagina(1); setSelecionados([]); };

    const exportar = async (somenteSelecionados) => {
        const p = parametros();
        delete p.page;
        if (somenteSelecionados) p.ids = selecionados.join(',');
        setExportando(true);
        try {
            await baixar(`${API}/documentos/exportar/`, p, 'documentos-fiscais.zip');
            setFeedback({ tipo: 'ok', texto: 'Exportação gerada. O ZIP é organizado por empresa, ano, mês, tipo e classificação.' });
        } catch { setFeedback({ tipo: 'erro', texto: 'Não foi possível exportar. Refine os filtros (limite de 20.000 documentos).' }); }
        setExportando(false);
    };

    const filtrosAtivos = Object.entries(aplicados).filter(([k, v]) => v !== '' && v !== inicial[k]).length;
    const totalPaginas = Math.max(1, Math.ceil(dados.count / 50));
    const props = { filtros, alterar };
    const todosSelecionados = dados.results.length > 0 && dados.results.every((d) => selecionados.includes(d.id));

    return (
        <div className="space-y-4">
            <CabecalhoSecao
                titulo={modoManifestacao ? 'Manifestações pendentes' : 'Documentos fiscais'}
                descricao={modoManifestacao
                    ? 'NF-e recebidas que ainda não têm manifestação conclusiva. Abra a nota para manifestar.'
                    : 'Todos os documentos capturados ou importados das empresas que você acompanha.'}
            >
                <button type="button" className={secondaryButtonClass} onClick={carregar}><ArrowPathIcon className="h-4 w-4" /> Atualizar</button>
            </CabecalhoSecao>

            <div className={`${cardClass} p-4`}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.6fr)_repeat(5,minmax(0,1fr))]">
                    <Campo rotulo="Empresa">
                        <select className={controlClass} value={filtros.empresa} onChange={(e) => alterar({ empresa: e.target.value })}>
                            <option value="">Todas as empresas</option>
                            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                    </Campo>
                    <Selecao nome="tipo_documento" rotulo="Tipo" {...props} />
                    <Selecao nome="classificacao" rotulo="Classificação" {...props} />
                    <Texto nome="emissao_inicio" rotulo="Emissão de" tipo="date" {...props} />
                    <Texto nome="emissao_fim" rotulo="Emissão até" tipo="date" {...props} />
                    <Selecao nome="ambiente" rotulo="Ambiente fiscal" semTodos {...props} />
                </div>
                <AnimatePresence initial={false}>
                    {avancado && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                            <div className="mt-3 grid gap-3 border-t border-gray-200 pt-3 dark:border-gray-800 md:grid-cols-3 xl:grid-cols-6">
                                <Texto nome="chave" rotulo="Chave de acesso" {...props} />
                                <Texto nome="numero" rotulo="Número" {...props} />
                                <Texto nome="serie" rotulo="Série" {...props} />
                                <Texto nome="emitente" rotulo="Emitente" placeholder="Nome ou CNPJ" {...props} />
                                <Texto nome="destinatario" rotulo="Destinatário" placeholder="Nome ou CNPJ" {...props} />
                                <Texto nome="documento" rotulo="CPF/CNPJ participante" {...props} />
                                <Selecao nome="situacao_fiscal" rotulo="Situação fiscal" {...props} />
                                <Selecao nome="situacao_xml" rotulo="Situação do XML" {...props} />
                                <Selecao nome="situacao_manifestacao" rotulo="Manifestação" {...props} />
                                <Selecao nome="situacao_conferencia" rotulo="Conferência" {...props} />
                                <Selecao nome="origem" rotulo="Origem" {...props} />
                                <Texto nome="competencia" rotulo="Competência" tipo="month" {...props} />
                                <Texto nome="captura_inicio" rotulo="Captura de" tipo="date" {...props} />
                                <Texto nome="captura_fim" rotulo="Captura até" tipo="date" {...props} />
                                <Texto nome="municipio" rotulo="Município" {...props} />
                                <Texto nome="estabelecimento" rotulo="CNPJ estabelecimento" {...props} />
                                <Texto nome="valor_min" rotulo="Valor mínimo" tipo="number" {...props} />
                                <Texto nome="valor_max" rotulo="Valor máximo" tipo="number" {...props} />
                                <Selecao nome="ordenacao" rotulo="Ordenação" semTodos {...props} />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                    <button type="button" className={primaryButtonClass} onClick={aplicar}><FunnelIcon className="h-4 w-4" /> Filtrar</button>
                    <button type="button" className={secondaryButtonClass} onClick={() => setAvancado(!avancado)}>
                        <AdjustmentsHorizontalIcon className="h-4 w-4" /> {avancado ? 'Menos filtros' : 'Mais filtros'}
                    </button>
                    {filtrosAtivos > 0 && <button type="button" className={secondaryButtonClass} onClick={limpar}><XMarkIcon className="h-4 w-4" /> Limpar</button>}
                    {pode('baixar_documentos') && (
                        <button type="button" className={`${secondaryButtonClass} ml-auto`} onClick={() => exportar(false)} disabled={exportando || !dados.count}>
                            {exportando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArchiveBoxArrowDownIcon className="h-4 w-4" />} Exportar resultado (ZIP)
                        </button>
                    )}
                </div>
            </div>

            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />
            {aplicados.ambiente === '2' && (
                <Observacao tom="ambar">Exibindo documentos do ambiente de homologação da SEFAZ (sem valor fiscal).</Observacao>
            )}

            <AnimatePresence initial={false}>
                {selecionados.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 lg:flex-row lg:items-center lg:justify-between">
                        <span className="text-sm text-gray-700 dark:text-gray-200"><span className="font-semibold tabular-nums">{selecionados.length}</span> documento(s) selecionado(s)</span>
                        <div className="flex flex-wrap gap-2">
                            {pode('baixar_documentos') && (
                                <button type="button" className={primaryButtonClass} onClick={() => exportar(true)} disabled={exportando}>
                                    <ArchiveBoxArrowDownIcon className="h-4 w-4" /> Exportar selecionados
                                </button>
                            )}
                            <button type="button" className={secondaryButtonClass} onClick={() => setSelecionados([])}>Limpar seleção</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <Tabela
                colunas={[
                    { titulo: <input type="checkbox" className={checkboxClass} checked={todosSelecionados} onChange={(e) => setSelecionados(e.target.checked ? dados.results.map((d) => d.id) : [])} aria-label="Selecionar página" />, className: 'w-10' },
                    { titulo: 'Documento' }, { titulo: 'Empresa', className: 'hidden xl:table-cell' }, { titulo: 'Emitente / Destinatário' },
                    { titulo: 'Emissão', className: 'hidden md:table-cell' }, { titulo: 'Valor', className: 'text-right' }, { titulo: 'Situação' },
                ]}
                vazio={!carregando && dados.results.length === 0 && (
                    <Vazio icone={DocumentMagnifyingGlassIcon} titulo="Nenhum documento encontrado"
                        texto={filtrosAtivos ? 'Nenhum documento atende aos filtros aplicados.' : 'Ainda não há documentos capturados ou importados neste ambiente fiscal.'}>
                        {filtrosAtivos > 0 && <button type="button" className={primaryButtonClass} onClick={limpar}>Limpar filtros</button>}
                    </Vazio>
                )}
                rodape={<>
                    <span>{dados.count} documento(s) · somente documentos disponíveis na plataforma</span>
                    <span className="flex items-center gap-2">
                        <button type="button" className={secondaryButtonClass} disabled={pagina <= 1 || carregando} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                        <span className="tabular-nums">{pagina} / {totalPaginas}</span>
                        <button type="button" className={secondaryButtonClass} disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(pagina + 1)}>Próxima</button>
                    </span>
                </>}
            >
                {carregando ? (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500"><ArrowPathIcon className="mr-2 inline h-5 w-5 animate-spin" />Carregando documentos...</td></tr>
                ) : dados.results.map((d) => {
                    const selecionado = selecionados.includes(d.id);
                    return (
                        <tr key={d.id} onClick={() => setAberto(d.id)}
                            className={`cursor-pointer transition-colors ${selecionado ? 'bg-slate-50 dark:bg-slate-800/40' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}>
                            <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" className={checkboxClass} checked={selecionado} aria-label={`Selecionar documento ${d.numero}`}
                                    onChange={(e) => setSelecionados(e.target.checked ? [...selecionados, d.id] : selecionados.filter((i) => i !== d.id))} />
                            </td>
                            <td className={tdClass}>
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white dark:bg-slate-100 dark:text-slate-950">{d.tipo_documento_display}</span>
                                    <span className="font-semibold tabular-nums">{d.numero || '—'}</span>
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{d.classificacao_display}{(d.fontes || []).includes('IMPORTACAO_MANUAL') ? ' · importado' : ''}</p>
                            </td>
                            <td className={`${tdClass} hidden text-xs xl:table-cell`}>{d.empresa_nome}</td>
                            <td className={`${tdClass} min-w-56`}>
                                <p className="truncate font-medium text-gray-900 dark:text-gray-100">{d.emitente_nome || formatarDocumento(d.emitente_documento)}</p>
                                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                    {d.situacao_xml === 'resumo' ? 'Resumo — detalhes após a manifestação' : `para ${d.destinatario_nome || formatarDocumento(d.destinatario_documento)}`}
                                </p>
                            </td>
                            <td className={`${tdClass} hidden whitespace-nowrap text-xs tabular-nums md:table-cell`}>{formatarData(d.data_emissao)}</td>
                            <td className={`${tdClass} whitespace-nowrap text-right font-semibold tabular-nums`}>{moeda(d.valor_total)}</td>
                            <td className={tdClass}>
                                <div className="flex flex-wrap gap-1">
                                    <Selo valor={d.situacao_fiscal} texto={d.situacao_fiscal_display} />
                                    {d.situacao_xml !== 'completo' && <Selo valor={d.situacao_xml} texto={d.situacao_xml_display} />}
                                    {['nao_manifestada', 'ciencia'].includes(d.situacao_manifestacao) && <Selo valor={d.situacao_manifestacao} texto={d.situacao_manifestacao_display} />}
                                    {d.situacao_conferencia === 'conferido' && <Selo valor="conferido" texto="Conferido" />}
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </Tabela>

            {aberto && <DetalheDocumento id={aberto} pode={pode} ambientesPermitidos={ambientesPermitidos} onFechar={() => setAberto(null)} onAtualizado={carregar} />}
        </div>
    );
};

export default Documentos;
