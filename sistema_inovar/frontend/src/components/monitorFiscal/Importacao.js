import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    ArrowPathIcon, ArrowUpTrayIcon, CheckCircleIcon, DocumentDuplicateIcon, LinkIcon, TrashIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, secondaryButtonClass } from '../centralShared';
import { API, CabecalhoSecao, Feedback, Indicador, Observacao, Selo, Tabela, erroApi, tdClass } from './shared';

const TOM_STATUS = { importado: 'completo', atualizado: 'ciencia', duplicado: 'pendente', rejeitado: 'erro', pendente_vinculo: 'pendente' };

const Importacao = () => {
    const [arquivos, setArquivos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [empresaId, setEmpresaId] = useState('');
    const [resultado, setResultado] = useState(null);
    const [pendencias, setPendencias] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [vinculo, setVinculo] = useState({});

    const carregarPendencias = useCallback(() => {
        axiosInstance.get(`${API}/pendencias-vinculo/`).then(({ data }) => setPendencias(data)).catch(() => {});
    }, []);
    useEffect(() => {
        axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {});
        carregarPendencias();
    }, [carregarPendencias]);

    const onDrop = useCallback((aceitos) => setArquivos((atual) => [...atual, ...aceitos]), []);
    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop, accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'], 'application/zip': ['.zip'], 'application/x-zip-compressed': ['.zip'] },
    });

    const enviar = async () => {
        const form = new FormData();
        arquivos.forEach((a) => form.append('arquivos', a));
        if (empresaId) form.append('empresa_id', empresaId);
        setEnviando(true);
        try {
            const { data } = await axiosInstance.post(`${API}/importacao/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setResultado(data);
            setArquivos([]);
            carregarPendencias();
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
        setEnviando(false);
    };

    const resolver = async (pendencia, descartar = false) => {
        try {
            await axiosInstance.post(`${API}/pendencias-vinculo/${pendencia.id}/resolver/`, descartar ? { descartar: true } : { empresa_id: vinculo[pendencia.id] });
            carregarPendencias();
            setFeedback({ tipo: 'ok', texto: descartar ? 'Pendência descartada.' : 'Documento vinculado à empresa.' });
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const tamanho = arquivos.reduce((soma, a) => soma + a.size, 0);
    const t = resultado?.totais;

    return (
        <div className="space-y-4">
            <CabecalhoSecao titulo="Importação de XMLs" descricao="Use para notas de saída, períodos anteriores aos 90 dias da SEFAZ ou documentos recebidos por outros meios. O processamento é o mesmo da captura automática." />

            <div className={`${cardClass} space-y-4 p-4`}>
                <div {...getRootProps()} className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${isDragActive ? 'border-slate-500 bg-slate-50 dark:bg-slate-800/40' : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/40'}`}>
                    <input {...getInputProps()} />
                    <ArrowUpTrayIcon className="h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-700 dark:text-gray-200">Arraste XMLs ou arquivos ZIP aqui, ou clique para escolher</p>
                    <p className="mt-1 text-xs text-gray-500">NF-e, NFS-e, CT-e, MDF-e e eventos · até 100 MB por envio</p>
                </div>
                {arquivos.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60">
                        <span><span className="font-semibold tabular-nums">{arquivos.length}</span> arquivo(s) · {(tamanho / 1024 / 1024).toFixed(1)} MB</span>
                        <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-300" onClick={() => setArquivos([])}><XMarkIcon className="h-4 w-4" /> Remover</button>
                    </div>
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="block flex-1"><span className={labelClass}>Empresa</span>
                        <select className={controlClass} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                            <option value="">Identificar automaticamente pelos participantes do XML</option>
                            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select></label>
                    <button type="button" className={primaryButtonClass} disabled={!arquivos.length || enviando} onClick={enviar}>
                        {enviando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ArrowUpTrayIcon className="h-4 w-4" />}
                        {enviando ? 'Processando...' : 'Importar'}
                    </button>
                </div>
                <Observacao>XMLs sem protocolo de autorização, malformados ou com conteúdo suspeito são rejeitados. Notas já existentes não são duplicadas: a nova origem é registrada no documento.</Observacao>
            </div>

            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />

            {t && (
                <section className="space-y-3">
                    <CabecalhoSecao titulo="Resultado da importação">
                        <button type="button" className={secondaryButtonClass} onClick={() => setResultado(null)}><XMarkIcon className="h-4 w-4" /> Fechar</button>
                    </CabecalhoSecao>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                        <Indicador titulo="Processados" valor={t.processados} />
                        <Indicador titulo="Importados" valor={t.importados} icone={CheckCircleIcon} />
                        <Indicador titulo="Atualizados" valor={t.atualizados} />
                        <Indicador titulo="Duplicados" valor={t.duplicados} icone={DocumentDuplicateIcon} />
                        <Indicador titulo="Rejeitados" valor={t.rejeitados} alerta={t.rejeitados > 0} />
                        <Indicador titulo="Análise manual" valor={t.pendentes_vinculo} icone={LinkIcon} />
                    </div>
                    <Tabela colunas={[{ titulo: 'Arquivo' }, { titulo: 'Resultado' }, { titulo: 'Empresa', className: 'hidden lg:table-cell' }, { titulo: 'Detalhe' }]}>
                        {resultado.resultados.map((r, i) => (
                            <tr key={i}>
                                <td className={`${tdClass} max-w-xs break-all text-xs`}>{r.arquivo}</td>
                                <td className={tdClass}><Selo valor={TOM_STATUS[r.status]} texto={r.status.replace('_', ' ')} /></td>
                                <td className={`${tdClass} hidden text-xs lg:table-cell`}>{r.empresa || '—'}</td>
                                <td className={`${tdClass} text-xs text-gray-500`}>{r.motivo || (r.chave && <span className="font-mono">{r.chave}</span>)}</td>
                            </tr>
                        ))}
                    </Tabela>
                </section>
            )}

            {pendencias.length > 0 && (
                <section className="space-y-3">
                    <CabecalhoSecao titulo="Aguardando vínculo manual" descricao="Documentos em que nenhuma empresa autorizada foi identificada entre os participantes." />
                    <Tabela colunas={[{ titulo: 'Arquivo' }, { titulo: 'Participantes', className: 'hidden lg:table-cell' }, { titulo: 'Vincular a' }, { titulo: '', className: 'text-right' }]}>
                        {pendencias.map((p) => (
                            <tr key={p.id}>
                                <td className={tdClass}><p className="text-sm font-medium">{p.nome_arquivo}</p><p className="break-all font-mono text-[11px] text-gray-500">{p.chave}</p></td>
                                <td className={`${tdClass} hidden text-xs tabular-nums lg:table-cell`}>{p.participantes.join(', ')}</td>
                                <td className={tdClass}>
                                    <select className={controlClass} value={vinculo[p.id] || ''} onChange={(e) => setVinculo({ ...vinculo, [p.id]: e.target.value })}>
                                        <option value="">Escolha a empresa</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                                    </select>
                                </td>
                                <td className={tdClass}>
                                    <div className="flex justify-end gap-2">
                                        <button type="button" className={rowActionClass} disabled={!vinculo[p.id]} onClick={() => resolver(p)}><LinkIcon className="h-4 w-4" /> Vincular</button>
                                        <button type="button" className={rowActionClass} onClick={() => resolver(p, true)}><TrashIcon className="h-4 w-4" /> Descartar</button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </Tabela>
                </section>
            )}
        </div>
    );
};

export default Importacao;
