import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, secondaryButtonClass, thClass } from '../centralShared';
import { API, Aviso, Mensagem, ROTULOS_FONTE, Selo, baixar, erroApi, formatarData, formatarDocumento, moeda } from './shared';

const FILTROS_INICIAIS = {
    empresa: '', tipo_documento: '', classificacao: '', situacao_fiscal: '', situacao_xml: '', situacao_manifestacao: '',
    situacao_conferencia: '', origem: '', emissao_inicio: '', emissao_fim: '', captura_inicio: '', captura_fim: '',
    competencia: '', chave: '', numero: '', serie: '', emitente: '', destinatario: '', documento: '', municipio: '',
    valor_min: '', valor_max: '', estabelecimento: '', ambiente: '1', ordenacao: '-data_emissao',
};

const OPCOES = {
    tipo_documento: [['NFE', 'NF-e'], ['NFSE', 'NFS-e'], ['CTE', 'CT-e'], ['MDFE', 'MDF-e']],
    classificacao: [['entrada', 'Entrada'], ['saida', 'Saída'], ['servico_prestado', 'Serviço prestado'], ['servico_tomado', 'Serviço tomado'],
        ['intermediacao', 'Intermediação'], ['transporte_contratado', 'Transporte contratado'], ['transporte_prestado', 'Transporte prestado'],
        ['terceiro_autorizado', 'Terceiro autorizado'], ['outros', 'Outros']],
    situacao_fiscal: [['autorizado', 'Autorizado'], ['cancelado', 'Cancelado'], ['substituido', 'Substituído'], ['denegado', 'Denegado'], ['encerrado', 'Encerrado'], ['desconhecida', 'Desconhecida']],
    situacao_xml: [['completo', 'XML completo'], ['resumo', 'Somente resumo'], ['pendente', 'Pendente'], ['erro', 'Erro']],
    situacao_manifestacao: [['nao_manifestada,ciencia', 'Pendentes de conclusão'], ['nao_manifestada', 'Não manifestada'], ['ciencia', 'Ciência'], ['confirmada', 'Confirmada'], ['desconhecida', 'Desconhecida'], ['nao_realizada', 'Não realizada'], ['nao_aplicavel', 'Não aplicável']],
    situacao_conferencia: [['pendente', 'Pendente'], ['conferido', 'Conferido'], ['inconsistente', 'Com inconsistência'], ['em_analise', 'Aguardando análise']],
    origem: Object.entries(ROTULOS_FONTE),
    ambiente: [['1', 'Produção'], ['2', 'Homologação']],
};

const EVENTOS = [
    ['210210', 'Ciência da Operação'],
    ['210200', 'Confirmação da Operação'],
    ['210220', 'Desconhecimento da Operação'],
    ['210240', 'Operação não Realizada'],
];

const Campo = ({ rotulo, children }) => (<div><label className={labelClass}>{rotulo}</label>{children}</div>);

const Selecao = ({ nome, filtros, setFiltros, rotulo }) => (
    <Campo rotulo={rotulo}>
        <select className={controlClass} value={filtros[nome]} onChange={(e) => setFiltros({ ...filtros, [nome]: e.target.value })}>
            {nome !== 'ambiente' && <option value="">Todos</option>}
            {OPCOES[nome].map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
    </Campo>
);

const Texto = ({ nome, filtros, setFiltros, rotulo, tipo = 'text', placeholder }) => (
    <Campo rotulo={rotulo}>
        <input type={tipo} className={controlClass} value={filtros[nome]} placeholder={placeholder}
            onChange={(e) => setFiltros({ ...filtros, [nome]: e.target.value })} />
    </Campo>
);

const Secao = ({ titulo, children }) => (
    <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{titulo}</h3>
        <div className="text-sm text-gray-800 dark:text-gray-200">{children}</div>
    </section>
);

const Linhas = ({ dados }) => (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {dados.filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-gray-100 py-1 dark:border-gray-800">
                <dt className="text-gray-500 dark:text-gray-400">{k}</dt><dd className="text-right">{v}</dd>
            </div>
        ))}
    </dl>
);

const Detalhe = ({ id, pode, onFechar, onAtualizado }) => {
    const [doc, setDoc] = useState(null);
    const [xml, setXml] = useState('');
    const [mensagem, setMensagem] = useState(null);
    const [manif, setManif] = useState({ tipo_evento: '210210', justificativa: '' });
    const [enviando, setEnviando] = useState(false);
    const [observacao, setObservacao] = useState('');

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/documentos/${id}/`).then(({ data }) => { setDoc(data); setObservacao(data.observacao_interna || ''); })
            .catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }));
    }, [id]);
    useEffect(() => { carregar(); }, [carregar]);

    const atualizar = async (dados) => {
        try {
            const { data } = await axiosInstance.patch(`${API}/documentos/${id}/`, dados);
            setDoc(data);
            onAtualizado();
            setMensagem({ tipo: 'ok', texto: 'Documento atualizado.' });
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const manifestar = async () => {
        const rotulo = EVENTOS.find(([v]) => v === manif.tipo_evento)?.[1];
        if (!window.confirm(`Transmitir "${rotulo}" para a NF-e ${doc.numero}? O evento é registrado na SEFAZ e não pode ser desfeito.`)) return;
        setEnviando(true);
        try {
            const { data } = await axiosInstance.post(`${API}/documentos/${id}/manifestar/`, { ...manif, confirmacao: true });
            setMensagem({ tipo: 'ok', texto: `Evento registrado. Protocolo ${data.protocolo}.` });
        } catch (e) {
            const dados = e?.response?.data;
            setMensagem({ tipo: 'erro', texto: dados?.motivo ? `Rejeitado (${dados.cstat}): ${dados.motivo}` : erroApi(e) });
        } finally {
            setEnviando(false);
            carregar();
            onAtualizado();
        }
    };

    if (!doc) return null;
    const dados = doc.dados || {};
    const trib = doc.valores_tributarios;
    const resumo = doc.situacao_xml === 'resumo';
    const participantes = (doc.participantes?.lista || []).filter(Boolean);

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onFechar}>
            <div className="h-full w-full max-w-4xl space-y-5 overflow-y-auto bg-white p-6 shadow-xl dark:bg-gray-950" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs text-gray-500">{doc.empresa_nome}</p>
                        <h2 className="text-lg font-semibold">{doc.tipo_documento_display} nº {doc.numero || '-'} {doc.serie ? `/ série ${doc.serie}` : ''}</h2>
                        <p className="break-all font-mono text-xs text-gray-500">{doc.chave}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <Selo valor={doc.situacao_fiscal} texto={doc.situacao_fiscal_display} />
                            <Selo valor={doc.situacao_xml} texto={doc.situacao_xml_display} />
                            {doc.situacao_manifestacao !== 'nao_aplicavel' && <Selo valor={doc.situacao_manifestacao} texto={doc.situacao_manifestacao_display} />}
                            <Selo valor={doc.situacao_conferencia} texto={`Conferência: ${doc.situacao_conferencia_display}`} />
                            {doc.ambiente === 2 && <Selo valor="erro" texto="HOMOLOGAÇÃO" />}
                        </div>
                    </div>
                    <button type="button" className={secondaryButtonClass} onClick={onFechar}>Fechar</button>
                </div>
                <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
                {resumo && (
                    <Aviso>Somente o resumo está disponível. Indisponíveis até o recebimento do XML completo: {doc.informacoes_indisponiveis.join(', ')}.
                        Para NF-e, o XML completo é liberado ao destinatário após a Ciência, Confirmação ou Operação não Realizada.</Aviso>
                )}

                <div className="flex flex-wrap gap-2">
                    {pode('baixar_documentos') && <>
                        <button type="button" className={rowActionClass} onClick={() => baixar(`${API}/documentos/${id}/xml/`, {}, `${doc.chave}.xml`)}>Baixar XML</button>
                        <button type="button" className={rowActionClass} onClick={() => axiosInstance.get(`${API}/documentos/${id}/xml/`, { params: { visualizar: 1 } }).then(({ data }) => setXml(data.xml))}>Ver XML original</button>
                        {!resumo && <button type="button" className={rowActionClass} onClick={() => baixar(`${API}/documentos/${id}/pdf/`, {}, `${doc.chave}.pdf`).catch(() => setMensagem({ tipo: 'erro', texto: 'Documento auxiliar indisponível.' }))}>PDF auxiliar (simplificado)</button>}
                    </>}
                    <button type="button" className={rowActionClass} onClick={() => atualizar({ situacao_conferencia: 'conferido' })}>Marcar como conferido</button>
                    <button type="button" className={rowActionClass} onClick={() => atualizar({ situacao_conferencia: 'inconsistente' })}>Marcar inconsistência</button>
                </div>

                <Secao titulo="Informações gerais">
                    <Linhas dados={[['Emissão', formatarData(doc.data_emissao, true)], ['Competência', doc.competencia ? doc.competencia.slice(0, 7) : ''],
                        ['Autorização', formatarData(doc.data_autorizacao, true)], ['Protocolo', doc.protocolo], ['Classificação', doc.classificacao_display],
                        ['Valor total', moeda(doc.valor_total)], ['Natureza da operação', dados.natureza_operacao], ['Município', doc.municipio_nome],
                        ['Origens', (doc.fontes || []).map((f) => ROTULOS_FONTE[f] || f).join(', ')], ['Leiaute', `${doc.schema} ${doc.versao_leiaute}`]]} />
                </Secao>
                <Secao titulo="Emitente / Prestador"><Linhas dados={[['Nome', doc.emitente_nome], ['CNPJ/CPF', formatarDocumento(doc.emitente_documento)], ['IE', doc.emitente_ie]]} /></Secao>
                {!resumo && <Secao titulo="Destinatário / Tomador"><Linhas dados={[['Nome', doc.destinatario_nome], ['CNPJ/CPF', formatarDocumento(doc.destinatario_documento)]]} /></Secao>}
                {participantes.length > 2 && (
                    <Secao titulo="Participantes">
                        <Linhas dados={participantes.map((p) => [p.papel, `${p.nome || ''} ${formatarDocumento(p.documento)}`])} />
                    </Secao>
                )}
                {doc.tipo_documento === 'NFSE' && (
                    <Secao titulo="Serviço">
                        <Linhas dados={[['Código nacional', dados.codigo_servico], ['Código municipal', dados.codigo_servico_municipal], ['Descrição', dados.descricao_servico],
                            ['Município de emissão', dados.municipio_emissao], ['Município de incidência', dados.municipio_incidencia]]} />
                    </Secao>
                )}
                {doc.tipo_documento === 'CTE' && (
                    <Secao titulo="Transporte">
                        <Linhas dados={[['Modal', dados.modal], ['CFOP', dados.cfop], ['Origem', dados.municipio_origem], ['Destino', dados.municipio_destino], ['Valor a receber', moeda(dados.valor_receber)]]} />
                    </Secao>
                )}
                {doc.itens.length > 0 && (
                    <Secao titulo="Produtos">
                        <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                                <thead><tr>{['#', 'Código', 'Descrição', 'NCM', 'CFOP', 'Qtd', 'Unit.', 'Total'].map((t) => <th key={t} className={thClass}>{t}</th>)}</tr></thead>
                                <tbody>{doc.itens.map((i) => (
                                    <tr key={i.id} className="border-t border-gray-100 dark:border-gray-800">
                                        <td className="px-4 py-1">{i.numero_item}</td><td className="px-4 py-1">{i.codigo}</td><td className="px-4 py-1">{i.descricao}</td>
                                        <td className="px-4 py-1">{i.ncm}</td><td className="px-4 py-1">{i.cfop}</td><td className="px-4 py-1">{i.quantidade} {i.unidade}</td>
                                        <td className="px-4 py-1">{i.valor_unitario}</td><td className="px-4 py-1">{moeda(i.valor_total)}</td>
                                    </tr>))}</tbody>
                            </table>
                        </div>
                    </Secao>
                )}
                {trib && Object.keys(trib).length > 0 && (
                    <Secao titulo="Tributos e totais">
                        <Linhas dados={Object.entries(trib).filter(([, v]) => typeof v !== 'object').map(([k, v]) => [k, String(v)])} />
                        {Object.entries(trib).filter(([, v]) => v && typeof v === 'object').map(([grupo, valores]) => (
                            <div key={grupo} className="mt-2"><p className="text-xs font-semibold">{grupo}</p>
                                <Linhas dados={Object.entries(valores).map(([k, v]) => [k, String(v)])} /></div>
                        ))}
                    </Secao>
                )}
                {(dados.informacoes_complementares || dados.informacoes_fisco) && (
                    <Secao titulo="Informações adicionais"><p className="whitespace-pre-wrap text-xs">{dados.informacoes_complementares}{'\n'}{dados.informacoes_fisco}</p></Secao>
                )}
                {(dados.referencias?.length > 0 || dados.documentos_relacionados?.length > 0 || doc.chave_substituta) && (
                    <Secao titulo="Documentos relacionados">
                        <ul className="font-mono text-xs">{[...(dados.referencias || []), ...(dados.documentos_relacionados || [])].map((c) => <li key={c}>{c}</li>)}</ul>
                        {doc.chave_substituta && <p className="text-xs">Substituído pela NFS-e {doc.chave_substituta}</p>}
                    </Secao>
                )}
                <Secao titulo="Eventos">
                    {doc.eventos.length === 0 ? <p className="text-xs text-gray-500">Nenhum evento recebido.</p> : (
                        <table className="min-w-full text-xs"><tbody>{doc.eventos.map((ev) => (
                            <tr key={ev.id} className="border-t border-gray-100 dark:border-gray-800">
                                <td className="py-1">{ev.tipo_evento} - {ev.descricao}</td><td>seq. {ev.sequencia}</td>
                                <td>{formatarData(ev.data_evento, true)}</td><td>{ev.protocolo}</td><td>{ev.completo ? 'completo' : 'resumo'}</td>
                                <td>{pode('baixar_documentos') && <button type="button" className="font-semibold underline" onClick={() => baixar(`${API}/documentos/${id}/eventos/${ev.id}/xml/`, {}, `evento-${ev.tipo_evento}.xml`)}>XML</button>}</td>
                            </tr>))}</tbody></table>
                    )}
                </Secao>
                {doc.situacao_manifestacao !== 'nao_aplicavel' && (
                    <Secao titulo="Manifestação do destinatário">
                        {doc.manifestacoes.map((m) => (
                            <p key={m.id} className="text-xs">{m.tipo_evento_display}: <Selo valor={m.situacao} texto={m.situacao} /> {m.cstat && `cStat ${m.cstat}`} {m.motivo} {m.protocolo && `- protocolo ${m.protocolo}`} ({m.solicitado_por_nome})</p>
                        ))}
                        {pode('realizar_manifestacao') && doc.ambiente && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                                <select className={controlClass} value={manif.tipo_evento} onChange={(e) => setManif({ ...manif, tipo_evento: e.target.value })}>
                                    {EVENTOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                                </select>
                                {manif.tipo_evento === '210240' && (
                                    <input className={controlClass} placeholder="Justificativa (15 a 255 caracteres)" value={manif.justificativa}
                                        onChange={(e) => setManif({ ...manif, justificativa: e.target.value })} />
                                )}
                                <button type="button" className={primaryButtonClass} disabled={enviando} onClick={manifestar}>{enviando ? 'Transmitindo...' : 'Transmitir manifestação'}</button>
                            </div>
                        )}
                    </Secao>
                )}
                <Secao titulo="Observação interna">
                    <textarea className={`${controlClass} h-20 py-2`} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                    <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => atualizar({ observacao_interna: observacao })}>Salvar observação</button>
                </Secao>
                <Secao titulo="Histórico de captura">
                    <table className="min-w-full text-xs"><tbody>{doc.recebimentos.map((r, i) => (
                        <tr key={i} className="border-t border-gray-100 dark:border-gray-800"><td className="py-1">{r.fonte}</td><td>NSU {r.nsu || '-'}</td><td>{r.tipo_conteudo}</td><td>{formatarData(r.recebido_em, true)}</td><td>{r.erro}</td></tr>
                    ))}</tbody></table>
                </Secao>
                {xml && (
                    <Secao titulo="XML original"><pre className="max-h-96 overflow-auto rounded bg-gray-50 p-3 text-[11px] dark:bg-gray-900">{xml}</pre></Secao>
                )}
            </div>
        </div>
    );
};

const Documentos = ({ pode, modoManifestacao = false }) => {
    const inicial = modoManifestacao ? { ...FILTROS_INICIAIS, tipo_documento: 'NFE', situacao_manifestacao: 'nao_manifestada,ciencia' } : FILTROS_INICIAIS;
    const [filtros, setFiltros] = useState(inicial);
    const [aplicados, setAplicados] = useState(inicial);
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState({ results: [], count: 0 });
    const [empresas, setEmpresas] = useState([]);
    const [selecionados, setSelecionados] = useState([]);
    const [aberto, setAberto] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [mensagem, setMensagem] = useState(null);
    const [avancado, setAvancado] = useState(false);

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
            .catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }))
            .finally(() => setCarregando(false));
    }, [parametros]);
    useEffect(() => { carregar(); }, [carregar]);

    const exportar = async (somenteSelecionados) => {
        const p = parametros();
        delete p.page;
        if (somenteSelecionados) p.ids = selecionados.join(',');
        try { await baixar(`${API}/documentos/exportar/`, p, 'documentos-fiscais.zip'); } catch (e) { setMensagem({ tipo: 'erro', texto: 'Falha na exportação. Refine os filtros.' }); }
    };

    const totalPaginas = Math.max(1, Math.ceil(dados.count / 50));
    const props = { filtros, setFiltros };

    return (
        <div className="space-y-4">
            <section className={`${cardClass} space-y-3 p-4`}>
                <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                    <Campo rotulo="Empresa">
                        <select className={controlClass} value={filtros.empresa} onChange={(e) => setFiltros({ ...filtros, empresa: e.target.value })}>
                            <option value="">Todas as empresas autorizadas</option>
                            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select>
                    </Campo>
                    <Selecao nome="tipo_documento" rotulo="Tipo" {...props} />
                    <Selecao nome="classificacao" rotulo="Classificação" {...props} />
                    <Texto nome="emissao_inicio" rotulo="Emissão de" tipo="date" {...props} />
                    <Texto nome="emissao_fim" rotulo="Emissão até" tipo="date" {...props} />
                    <Texto nome="chave" rotulo="Chave de acesso" {...props} />
                </div>
                {avancado && (
                    <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
                        <Selecao nome="situacao_fiscal" rotulo="Situação fiscal" {...props} />
                        <Selecao nome="situacao_xml" rotulo="Situação do XML" {...props} />
                        <Selecao nome="situacao_manifestacao" rotulo="Manifestação" {...props} />
                        <Selecao nome="situacao_conferencia" rotulo="Conferência" {...props} />
                        <Selecao nome="origem" rotulo="Origem" {...props} />
                        <Selecao nome="ambiente" rotulo="Ambiente" {...props} />
                        <Texto nome="competencia" rotulo="Competência" tipo="month" {...props} />
                        <Texto nome="captura_inicio" rotulo="Captura de" tipo="date" {...props} />
                        <Texto nome="captura_fim" rotulo="Captura até" tipo="date" {...props} />
                        <Texto nome="numero" rotulo="Número" {...props} />
                        <Texto nome="serie" rotulo="Série" {...props} />
                        <Texto nome="emitente" rotulo="Emitente (nome/CNPJ)" {...props} />
                        <Texto nome="destinatario" rotulo="Destinatário (nome/CNPJ)" {...props} />
                        <Texto nome="documento" rotulo="CPF/CNPJ participante" {...props} />
                        <Texto nome="estabelecimento" rotulo="CNPJ estabelecimento" {...props} />
                        <Texto nome="municipio" rotulo="Município" {...props} />
                        <Texto nome="valor_min" rotulo="Valor mínimo" tipo="number" {...props} />
                        <Texto nome="valor_max" rotulo="Valor máximo" tipo="number" {...props} />
                        <Campo rotulo="Ordenação">
                            <select className={controlClass} value={filtros.ordenacao} onChange={(e) => setFiltros({ ...filtros, ordenacao: e.target.value })}>
                                <option value="-data_emissao">Emissão (recente)</option><option value="data_emissao">Emissão (antiga)</option>
                                <option value="-valor_total">Maior valor</option><option value="valor_total">Menor valor</option>
                                <option value="-capturado_em">Captura (recente)</option><option value="emitente_nome">Emitente</option>
                                <option value="empresa__nome">Empresa</option>
                            </select>
                        </Campo>
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    <button type="button" className={primaryButtonClass} onClick={() => { setPagina(1); setAplicados(filtros); }}>Filtrar</button>
                    <button type="button" className={secondaryButtonClass} onClick={() => { setFiltros(inicial); setAplicados(inicial); setPagina(1); }}>Limpar</button>
                    <button type="button" className={secondaryButtonClass} onClick={() => setAvancado(!avancado)}>{avancado ? 'Menos filtros' : 'Mais filtros'}</button>
                    {pode('baixar_documentos') && <>
                        <button type="button" className={secondaryButtonClass} onClick={() => exportar(false)}>Exportar XMLs filtrados (ZIP)</button>
                        <button type="button" className={secondaryButtonClass} disabled={!selecionados.length} onClick={() => exportar(true)}>Exportar selecionados ({selecionados.length})</button>
                    </>}
                </div>
            </section>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            {aplicados.ambiente === '2' && <Aviso tom="vermelho">Exibindo documentos de HOMOLOGAÇÃO (sem validade fiscal).</Aviso>}
            <section className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead>
                        <tr>
                            <th className={thClass}><input type="checkbox" checked={dados.results.length > 0 && dados.results.every((d) => selecionados.includes(d.id))}
                                onChange={(e) => setSelecionados(e.target.checked ? dados.results.map((d) => d.id) : [])} /></th>
                            {['Empresa', 'Tipo', 'Número', 'Emitente', 'Destinatário', 'Emissão', 'Valor', 'Classificação', 'Situação', 'XML', 'Manifestação', 'Origem'].map((t) => <th key={t} className={thClass}>{t}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {carregando && <tr><td colSpan={13} className="px-4 py-6 text-center text-gray-500">Carregando...</td></tr>}
                        {!carregando && dados.results.length === 0 && <tr><td colSpan={13} className="px-4 py-6 text-center text-gray-500">Nenhum documento encontrado com os filtros aplicados.</td></tr>}
                        {!carregando && dados.results.map((d) => (
                            <tr key={d.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50" onClick={() => setAberto(d.id)}>
                                <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                                    <input type="checkbox" checked={selecionados.includes(d.id)} onChange={(e) => setSelecionados(e.target.checked ? [...selecionados, d.id] : selecionados.filter((i) => i !== d.id))} />
                                </td>
                                <td className="px-4 py-2 text-xs">{d.empresa_nome}</td>
                                <td className="px-4 py-2">{d.tipo_documento_display}</td>
                                <td className="px-4 py-2">{d.numero}</td>
                                <td className="px-4 py-2 text-xs">{d.emitente_nome || formatarDocumento(d.emitente_documento)}</td>
                                <td className="px-4 py-2 text-xs">{d.destinatario_nome || formatarDocumento(d.destinatario_documento)}</td>
                                <td className="px-4 py-2 text-xs">{formatarData(d.data_emissao)}</td>
                                <td className="whitespace-nowrap px-4 py-2">{moeda(d.valor_total)}</td>
                                <td className="px-4 py-2 text-xs">{d.classificacao_display}</td>
                                <td className="px-4 py-2"><Selo valor={d.situacao_fiscal} texto={d.situacao_fiscal_display} /></td>
                                <td className="px-4 py-2"><Selo valor={d.situacao_xml} texto={d.situacao_xml_display} /></td>
                                <td className="px-4 py-2">{d.situacao_manifestacao !== 'nao_aplicavel' && <Selo valor={d.situacao_manifestacao} texto={d.situacao_manifestacao_display} />}</td>
                                <td className="px-4 py-2 text-xs">{(d.fontes || []).map((f) => ROTULOS_FONTE[f] || f).join(', ')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="flex items-center justify-between px-4 py-3 text-xs text-gray-500">
                    <span>{dados.count} documento(s). Exibe somente documentos disponíveis na plataforma.</span>
                    <div className="flex items-center gap-2">
                        <button type="button" className={secondaryButtonClass} disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
                        <span>{pagina} / {totalPaginas}</span>
                        <button type="button" className={secondaryButtonClass} disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>Próxima</button>
                    </div>
                </div>
            </section>
            {aberto && <Detalhe id={aberto} pode={pode} onFechar={() => setAberto(null)} onAtualizado={carregar} />}
        </div>
    );
};

export default Documentos;
