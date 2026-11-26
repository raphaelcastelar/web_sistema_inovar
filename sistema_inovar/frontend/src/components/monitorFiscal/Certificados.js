import React, { useCallback, useEffect, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
    ArrowPathIcon, KeyIcon, LockClosedIcon, NoSymbolIcon, ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass } from '../centralShared';
import {
    API, CabecalhoSecao, Feedback, Observacao, Selo, Tabela, Vazio, checkboxClass, erroApi, formatarData, formatarDocumento, nomeTitular, tdClass,
} from './shared';

const Certificados = () => {
    const [lista, setLista] = useState(null);
    const [empresas, setEmpresas] = useState([]);
    const [arquivo, setArquivo] = useState(null);
    const [senha, setSenha] = useState('');
    const [vincular, setVincular] = useState([]);
    const [feedback, setFeedback] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [busca, setBusca] = useState('');
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    const empresasFiltradas = termo ? empresas.filter((e) => e.nome.toLowerCase().includes(termo) || (digitos && String(e.cnpj).replace(/\D/g, '').includes(digitos))).slice(0, 30) : [];

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/certificados/`).then(({ data }) => setLista(data)).catch((e) => { setLista([]); setFeedback({ tipo: 'erro', texto: erroApi(e) }); });
    }, []);
    useEffect(() => {
        carregar();
        axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {});
    }, [carregar]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        multiple: false,
        accept: { 'application/x-pkcs12': ['.pfx', '.p12'] },
        onDrop: (aceitos) => aceitos[0] && setArquivo(aceitos[0]),
    });

    const enviar = async (evento) => {
        evento.preventDefault();
        if (!arquivo) return;
        const form = new FormData();
        form.append('arquivo', arquivo);
        form.append('senha', senha);
        vincular.forEach((id) => form.append('empresa_ids', id));
        setEnviando(true);
        try {
            const { data } = await axiosInstance.post(`${API}/certificados/`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setFeedback({ tipo: 'ok', texto: `Certificado de ${data.titular} validado e cadastrado (válido até ${formatarData(data.valido_ate)}).` });
            setArquivo(null); setVincular([]); setBusca('');
            carregar();
        } catch (e) {
            const extras = e?.response?.data?.incompatibilidades?.map((i) => `${i.empresa}: ${i.motivo}`).join(' | ');
            setFeedback({ tipo: 'erro', texto: `${erroApi(e)} ${extras || ''}` });
        } finally {
            setSenha('');
            setEnviando(false);
        }
    };

    const desativar = async (cert) => {
        if (!window.confirm(`Desativar o certificado de ${cert.titular}? As empresas vinculadas deixam de sincronizar até receberem outro certificado. Documentos e controles de NSU são preservados.`)) return;
        try {
            await axiosInstance.post(`${API}/certificados/${cert.id}/desativar/`);
            setFeedback({ tipo: 'ok', texto: 'Certificado desativado.' });
            carregar();
        } catch (e) { setFeedback({ tipo: 'erro', texto: erroApi(e) }); }
    };

    return (
        <div className="space-y-4">
            <CabecalhoSecao titulo="Certificados digitais" descricao="Certificados A1 (PFX/P12) ICP-Brasil usados para autenticar nos serviços da SEFAZ e do ADN." />

            <form onSubmit={enviar} className={`${cardClass} grid gap-4 p-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]`}>
                <div {...getRootProps()} className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors ${isDragActive ? 'border-slate-500 bg-slate-50 dark:bg-slate-800/40' : 'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/40'}`}>
                    <input {...getInputProps()} />
                    <KeyIcon className="h-8 w-8 text-gray-400" />
                    {arquivo
                        ? <p className="mt-2 text-sm font-semibold">{arquivo.name}</p>
                        : <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Arraste o arquivo <strong>.pfx</strong> ou <strong>.p12</strong>, ou clique para escolher</p>}
                    <p className="mt-1 text-xs text-gray-500">O arquivo e a senha são guardados criptografados e nunca são exibidos.</p>
                </div>
                <div className="space-y-3">
                    <label className="block"><span className={labelClass}>Senha do certificado</span>
                        <input type="password" autoComplete="new-password" className={controlClass} value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
                    <div>
                        <span className={labelClass}>Vincular às empresas (opcional)</span>
                        <input className={controlClass} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar empresa por nome ou CNPJ" />
                        {busca.trim() && (
                            <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-1 dark:border-gray-700">
                                {empresasFiltradas.length === 0 && <p className="px-2 py-1 text-xs text-gray-500">Nenhuma empresa encontrada.</p>}
                                {empresasFiltradas.map((e) => (
                                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-50 dark:hover:bg-gray-800">
                                        <input type="checkbox" className={checkboxClass} checked={vincular.includes(String(e.id))}
                                            onChange={(ev) => setVincular(ev.target.checked ? [...vincular, String(e.id)] : vincular.filter((v) => v !== String(e.id)))} />
                                        <span className="font-medium">{e.nome}</span><span className="tabular-nums text-gray-500">{e.cnpj}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                        {vincular.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {vincular.map((id) => {
                                    const empresa = empresas.find((e) => String(e.id) === id);
                                    return <button key={id} type="button" onClick={() => setVincular(vincular.filter((v) => v !== id))}
                                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{empresa?.nome} ×</button>;
                                })}
                            </div>
                        )}
                        <p className="mt-1 text-[11px] text-gray-500">Somente empresas do mesmo CNPJ raiz do certificado são aceitas.</p>
                    </div>
                    <button type="submit" className={primaryButtonClass} disabled={!arquivo || enviando}>
                        {enviando ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <ShieldCheckIcon className="h-4 w-4" />}
                        {enviando ? 'Validando...' : 'Validar e cadastrar'}
                    </button>
                </div>
            </form>

            <Observacao>
                Os serviços de distribuição autenticam pelo CNPJ raiz: cada certificado só consulta estabelecimentos do próprio CNPJ raiz.
                Procuração eletrônica da Receita não vale para a SEFAZ.
            </Observacao>
            <Feedback feedback={feedback} onFechar={() => setFeedback(null)} />

            <Tabela
                colunas={[{ titulo: 'Titular' }, { titulo: 'Validade' }, { titulo: 'Situação' }, { titulo: 'Empresas', className: 'hidden lg:table-cell' }, { titulo: '', className: 'text-right' }]}
                vazio={lista && lista.length === 0 && <Vazio icone={LockClosedIcon} titulo="Nenhum certificado cadastrado" texto="Cadastre o certificado A1 de uma empresa para iniciar a captura automática." />}
                rodape={lista && <span>{lista.length} certificado(s)</span>}
            >
                {!lista ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500"><ArrowPathIcon className="mr-2 inline h-5 w-5 animate-spin" />Carregando...</td></tr>
                ) : lista.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                        <td className={tdClass}>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{nomeTitular(c.titular)}</p>
                            <p className="text-xs tabular-nums text-gray-500">{formatarDocumento(c.cnpj || c.cpf)} · {c.emissor}</p>
                            {(c.alertas_validacao || []).length > 0 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{c.alertas_validacao.join(' ')}</p>}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-xs tabular-nums`}>{formatarData(c.valido_de)} a {formatarData(c.valido_ate)}</td>
                        <td className={tdClass}>
                            {!c.ativo ? <Selo texto="Desativado" />
                                : c.vencido ? <Selo valor="vencido" texto="Vencido" />
                                    : <Selo valor={c.dias_para_vencer <= 30 ? 'vencendo' : 'vigente'} texto={`${c.dias_para_vencer} dias restantes`} />}
                        </td>
                        <td className={`${tdClass} hidden text-xs lg:table-cell`}>{c.empresas.map((e) => e.nome).join(', ') || <span className="text-gray-400">Nenhuma</span>}</td>
                        <td className={`${tdClass} text-right`}>
                            {c.ativo && <button type="button" className={rowActionClass} onClick={() => desativar(c)}><NoSymbolIcon className="h-4 w-4" /> Desativar</button>}
                        </td>
                    </tr>
                ))}
            </Tabela>
        </div>
    );
};

export default Certificados;
