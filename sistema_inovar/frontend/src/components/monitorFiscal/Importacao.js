import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, thClass } from '../centralShared';
import { API, Aviso, Indicador, Mensagem, Selo, erroApi } from './shared';

const Importacao = () => {
    const [arquivos, setArquivos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [empresaId, setEmpresaId] = useState('');
    const [resultado, setResultado] = useState(null);
    const [pendencias, setPendencias] = useState([]);
    const [mensagem, setMensagem] = useState(null);
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
        onDrop, accept: { 'application/xml': ['.xml'], 'text/xml': ['.xml'], 'application/zip': ['.zip'] },
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
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
        setEnviando(false);
    };

    const resolver = async (pendencia, descartar = false) => {
        try {
            await axiosInstance.post(`${API}/pendencias-vinculo/${pendencia.id}/resolver/`, descartar ? { descartar: true } : { empresa_id: vinculo[pendencia.id] });
            carregarPendencias();
            setMensagem({ tipo: 'ok', texto: descartar ? 'Pendência descartada.' : 'Documento vinculado.' });
        } catch (e) { setMensagem({ tipo: 'erro', texto: erroApi(e) }); }
    };

    const t = resultado?.totais;
    return (
        <div className="space-y-4">
            <Aviso tom="azul">Importe XMLs individuais, vários XMLs ou arquivos ZIP. A importação usa o mesmo processamento da captura automática (identificação, deduplicação e classificação). Documentos sem protocolo de autorização são rejeitados.</Aviso>
            <section className={`${cardClass} space-y-3 p-4`}>
                <div {...getRootProps()} className={`cursor-pointer rounded-md border-2 border-dashed p-8 text-center text-sm ${isDragActive ? 'border-slate-500' : 'border-gray-300 dark:border-gray-700'}`}>
                    <input {...getInputProps()} />
                    {arquivos.length ? `${arquivos.length} arquivo(s) selecionado(s)` : 'Arraste XMLs ou ZIP aqui, ou clique para selecionar'}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[260px]"><label className={labelClass}>Empresa (opcional)</label>
                        <select className={controlClass} value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
                            <option value="">Identificar automaticamente pelos participantes</option>
                            {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                        </select></div>
                    <button type="button" className={primaryButtonClass} disabled={!arquivos.length || enviando} onClick={enviar}>{enviando ? 'Processando...' : 'Importar'}</button>
                </div>
            </section>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            {t && (
                <section className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                        <Indicador titulo="Processados" valor={t.processados} /><Indicador titulo="Importados" valor={t.importados} />
                        <Indicador titulo="Atualizados" valor={t.atualizados} /><Indicador titulo="Duplicados" valor={t.duplicados} />
                        <Indicador titulo="Rejeitados" valor={t.rejeitados} tom={t.rejeitados ? 'alerta' : ''} /><Indicador titulo="Análise manual" valor={t.pendentes_vinculo} />
                    </div>
                    <div className={`${cardClass} max-h-96 overflow-auto`}>
                        <table className="min-w-full text-xs"><thead><tr>{['Arquivo', 'Situação', 'Empresa', 'Chave', 'Motivo'].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
                            <tbody>{resultado.resultados.map((r, i) => (
                                <tr key={i} className="border-t border-gray-100 dark:border-gray-800"><td className="px-4 py-1">{r.arquivo}</td><td className="px-4 py-1"><Selo valor={r.status === 'importado' ? 'completo' : r.status === 'rejeitado' ? 'erro' : 'pendente'} texto={r.status} /></td>
                                    <td className="px-4 py-1">{r.empresa}</td><td className="px-4 py-1 font-mono">{r.chave}</td><td className="px-4 py-1">{r.motivo}</td></tr>
                            ))}</tbody></table>
                    </div>
                </section>
            )}
            {pendencias.length > 0 && (
                <section className={`${cardClass} overflow-x-auto p-4`}>
                    <h2 className="mb-2 text-sm font-semibold">Documentos aguardando vínculo manual</h2>
                    <table className="min-w-full text-xs"><tbody>{pendencias.map((p) => (
                        <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="px-2 py-2">{p.nome_arquivo}</td><td className="px-2 py-2 font-mono">{p.chave}</td>
                            <td className="px-2 py-2">Participantes: {p.participantes.join(', ')}</td>
                            <td className="px-2 py-2"><select className={controlClass} value={vinculo[p.id] || ''} onChange={(e) => setVinculo({ ...vinculo, [p.id]: e.target.value })}>
                                <option value="">Escolha a empresa</option>{empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></td>
                            <td className="space-x-1 px-2 py-2 whitespace-nowrap">
                                <button type="button" className={rowActionClass} disabled={!vinculo[p.id]} onClick={() => resolver(p)}>Vincular</button>
                                <button type="button" className={rowActionClass} onClick={() => resolver(p, true)}>Descartar</button>
                            </td>
                        </tr>))}</tbody></table>
                </section>
            )}
        </div>
    );
};

export default Importacao;
