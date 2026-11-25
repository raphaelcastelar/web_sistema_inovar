import React, { useCallback, useEffect, useState } from 'react';
import axiosInstance from '../../api/axiosInstance';
import { cardClass, controlClass, labelClass, primaryButtonClass, rowActionClass, thClass } from '../centralShared';
import { API, Aviso, Mensagem, Selo, erroApi, formatarData, formatarDocumento } from './shared';

const Certificados = () => {
    const [lista, setLista] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [arquivo, setArquivo] = useState(null);
    const [senha, setSenha] = useState('');
    const [vincular, setVincular] = useState([]);
    const [mensagem, setMensagem] = useState(null);
    const [enviando, setEnviando] = useState(false);

    const carregar = useCallback(() => {
        axiosInstance.get(`${API}/certificados/`).then(({ data }) => setLista(data)).catch((e) => setMensagem({ tipo: 'erro', texto: erroApi(e) }));
    }, []);
    useEffect(() => {
        carregar();
        axiosInstance.get(`${API}/empresas/`).then(({ data }) => setEmpresas(data)).catch(() => {});
    }, [carregar]);

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
            setMensagem({ tipo: 'ok', texto: `Certificado de ${data.titular} cadastrado (válido até ${formatarData(data.valido_ate)}).` });
            setArquivo(null); setSenha(''); setVincular([]);
            evento.target.reset();
            carregar();
        } catch (e) {
            const dados = e?.response?.data;
            const extras = dados?.incompatibilidades?.map((i) => `${i.empresa}: ${i.motivo}`).join(' | ');
            setMensagem({ tipo: 'erro', texto: `${erroApi(e)} ${extras || ''}` });
        } finally {
            setSenha('');
            setEnviando(false);
        }
    };

    const desativar = async (cert) => {
        if (!window.confirm(`Desativar o certificado de ${cert.titular}? As empresas vinculadas deixarão de sincronizar até receberem outro certificado. Documentos e controles de NSU são preservados.`)) return;
        await axiosInstance.post(`${API}/certificados/${cert.id}/desativar/`);
        carregar();
    };

    return (
        <div className="space-y-4">
            <Aviso tom="azul">
                Utilize certificados A1 (PFX/P12) ICP-Brasil. O arquivo e a senha são armazenados criptografados e nunca são exibidos.
                Os serviços de distribuição autenticam pelo CNPJ raiz: um certificado só consulta estabelecimentos do mesmo CNPJ raiz.
            </Aviso>
            <form className={`${cardClass} grid gap-3 p-4 md:grid-cols-4`} onSubmit={enviar}>
                <div><label className={labelClass}>Arquivo PFX/P12</label>
                    <input type="file" accept=".pfx,.p12" className="text-sm" onChange={(e) => setArquivo(e.target.files[0])} /></div>
                <div><label className={labelClass}>Senha</label>
                    <input type="password" autoComplete="new-password" className={controlClass} value={senha} onChange={(e) => setSenha(e.target.value)} /></div>
                <div><label className={labelClass}>Vincular às empresas (opcional)</label>
                    <select multiple className={`${controlClass} h-24`} value={vincular.map(String)}
                        onChange={(e) => setVincular(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                        {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </select></div>
                <div className="flex items-end"><button type="submit" className={primaryButtonClass} disabled={!arquivo || enviando}>{enviando ? 'Validando...' : 'Validar e cadastrar'}</button></div>
            </form>
            <Mensagem mensagem={mensagem} onFechar={() => setMensagem(null)} />
            <section className={`${cardClass} overflow-x-auto`}>
                <table className="min-w-full divide-y divide-gray-100 text-sm dark:divide-gray-800">
                    <thead><tr>{['Titular', 'CNPJ/CPF', 'Emissor', 'Validade', 'Situação', 'Validações', 'Empresas', ''].map((t) => <th key={t} className={thClass}>{t}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {lista.map((c) => (
                            <tr key={c.id} className="align-top">
                                <td className="px-4 py-2">{c.titular}</td>
                                <td className="px-4 py-2 text-xs">{formatarDocumento(c.cnpj || c.cpf)}</td>
                                <td className="px-4 py-2 text-xs">{c.emissor}</td>
                                <td className="px-4 py-2 text-xs">{formatarData(c.valido_de)} a {formatarData(c.valido_ate)}</td>
                                <td className="px-4 py-2">{!c.ativo ? <Selo valor="desativado" texto="Desativado" /> : c.vencido ? <Selo valor="erro" texto="Vencido" /> : <Selo valor={c.dias_para_vencer <= 30 ? 'pendente' : 'completo'} texto={`${c.dias_para_vencer} dias`} />}</td>
                                <td className="px-4 py-2 text-xs">{(c.alertas_validacao || []).join(' ') || 'Sem alertas'}</td>
                                <td className="px-4 py-2 text-xs">{c.empresas.map((e) => e.nome).join(', ') || '-'}</td>
                                <td className="px-4 py-2">{c.ativo && <button type="button" className={rowActionClass} onClick={() => desativar(c)}>Desativar</button>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
};

export default Certificados;
