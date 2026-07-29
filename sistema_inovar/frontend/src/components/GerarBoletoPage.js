import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';
import { normalizeCnpj } from '../utils/cnpj';

const Section = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-gray-300 dark:border-gray-700 rounded-lg mb-4 bg-white dark:bg-gray-800 shadow-sm">
            <button
                onClick={() => setOpen(!open)}
                className="w-full p-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-left font-semibold text-gray-800 dark:text-gray-100 rounded-t-lg transition"
            >
                {title}
                <span className="float-right">{open ? '▲' : '▼'}</span>
            </button>
            {open && <div className="p-4 border-t border-gray-200 dark:border-gray-700">{children}</div>}
        </div>
    );
};

const GerarBoletoPage = () => {
    const inputClass =
        "w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 " +
        "bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 " +
        "placeholder-gray-500 dark:placeholder-gray-400 " +
        "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 " +
        "transition";

    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

    const [boletoData, setBoletoData] = useState({
        // nomes mapeados para o que a view espera
        numeroConvenio: '',
        carteira: '',                   // "carteira" (ex: 17)
        numeroVariacaoCarteira: '',     // opcional
        codigoModalidade: 1,
        dataEmissao: new Date().toISOString().split('T')[0], // iso yyyy-mm-dd (backend faz conversão)
        dataVencimento: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        valorOriginal: '',              // string, será convertido para float
        quantidade: '',                 // string/number
        indicadorPix: 'N',              // 'S' ou 'N'
        // nested charges
        desconto: { tipo: 0, dataExpiracao: '', porcentagem: 0.0, valor: 0.0 },
        segundoDesconto: { tipo: 0, dataExpiracao: '', porcentagem: 0.0, valor: 0.0 },
        terceiroDesconto: { tipo: 0, dataExpiracao: '', porcentagem: 0.0, valor: 0.0 },
        multa: { tipo: 0, data: '', porcentagem: 0.0, valor: 0.0 },
        jurosMora: { tipo: 0, porcentagem: 0.0, valor: 0.0 },
        beneficiarioFinal: { tipoInscricao: 0, numeroInscricao: '', nome: '' },
        // pagador será preenchido a partir da empresa, mas pode ser editado
        pagador: { tipoInscricao: 2, numeroInscricao: '', nome: '', endereco: '', cep: '', cidade: '', bairro: '', uf: '', telefone: '', email: '' },
        mensagemBloquetoOcorrencia: 'Boleto gerado via sistema',
        numeroTituloBeneficiario: '',   // opcional (nosso numero cliente)
    });

    const [pagadorEditable, setPagadorEditable] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isDisabled, setIsDisabled] = useState(false); // Novo estado para desativar botão
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [showPreview, setShowPreview] = useState(true);

    useEffect(() => {
        axiosInstance.get('/api/empresas/')
            .then(res => setEmpresas(res.data))
            .catch(() => setMsg({ type: 'error', text: 'Erro ao buscar empresas.' }));
    }, []);

    // Atualizadores
    const update = (e) => {
        const { name, value } = e.target;
        setBoletoData(prev => ({ ...prev, [name]: value }));
    };

    const updateNested = (section, e) => {
        const { name, value } = e.target;
        setBoletoData(prev => ({ ...prev, [section]: { ...prev[section], [name]: value } }));
    };

    // Atualizar pagador (quando user escolhe empresa, preenche por padrão)
    useEffect(() => {
        if (!selectedEmpresaId) return;
        setIsDisabled(false); // Reativa o botão se trocar de empresa
        const empresa = empresas.find(e => String(e.id) === String(selectedEmpresaId));
        if (!empresa) return;
        // preenche pagador apenas se ainda não tiver sido editado
        setBoletoData(prev => {
            // se o user já editou o pagador, não sobrescreve
            if (pagadorEditable) return prev;
            return {
                ...prev,
                pagador: {
                    tipoInscricao: 2,
                    numeroInscricao: normalizeCnpj(empresa.cnpj),
                    nome: empresa.nome || '',
                    endereco: empresa.endereco || '',
                    cep: (empresa.cep || '').toString(),
                    cidade: empresa.cidade || '',
                    bairro: empresa.bairro || '',
                    uf: empresa.uf || '',
                    telefone: (empresa.telefone || '').toString().replace(/\D/g, ''),
                    email: empresa.email || '',
                }
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmpresaId, empresas]);

    // Monta o payload final com conversões de tipo
    const buildPayload = () => {
        // parse numbers safely
        const parseFloatSafe = (v) => {
            if (v === '' || v === null || v === undefined) return 0.0;
            const n = Number(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : 0.0;
        };

        const parseIntSafe = (v) => {
            if (v === '' || v === null || v === undefined) return 0;
            const n = parseInt(String(v).replace(/\D/g, ''), 10);
            return Number.isFinite(n) ? n : 0;
        };

        // normalize nested charge field generator
        const normalizeCharge = (obj = {}) => ({
            tipo: parseIntSafe(obj.tipo),
            porcentagem: parseFloatSafe(obj.porcentagem),
            valor: parseFloatSafe(obj.valor),
            // incluir dataExpiracao se presente
            ...(obj.dataExpiracao ? { dataExpiracao: obj.dataExpiracao } : {}),
            ...(obj.data ? { data: obj.data } : {}),
        });

        const payload = {
            // campos principais (strings/numbers conforme view espera)
            numeroConvenio: boletoData.numeroConvenio ? parseIntSafe(boletoData.numeroConvenio) : undefined,
            carteira: boletoData.carteira ? parseIntSafe(boletoData.carteira) : undefined,
            variacaoCarteira: boletoData.numeroVariacaoCarteira ? boletoData.numeroVariacaoCarteira : undefined, // opcional
            codigoModalidade: boletoData.codigoModalidade ? parseIntSafe(boletoData.codigoModalidade) : 1,
            dataEmissao: boletoData.dataEmissao,      // backend convert_date_format irá tratar
            dataVencimento: boletoData.dataVencimento,
            valorOriginal: parseFloatSafe(boletoData.valorOriginal),
            valorAbatimento: 0.0,
            quantidadeDiasProtesto: 0,
            quantidadeDiasNegativacao: 0,
            orgaoNegativador: 0,
            quantidade: boletoData.quantidade || '', // envia string ou vazio
            indicadorAceiteTituloVencido: "N",
            numeroDiasLimiteRecebimento: 0,
            codigoAceite: "N",
            codigoTipoTitulo: 2,
            descricaoTipoTitulo: "DM",
            indicadorPermissaoRecebimentoParcial: "N",
            numeroTituloBeneficiario: boletoData.numeroTituloBeneficiario || undefined,
            campoUtilizacaoBeneficiario: boletoData.campoUtilizacaoBeneficiario || undefined,
            mensagemBloquetoOcorrencia: boletoData.mensagemBloquetoOcorrencia || '',
            indicadorPix: boletoData.indicadorPix || 'N',
            // pagador (objeto)
            pagador: {
                tipoInscricao: boletoData.pagador.tipoInscricao || 2,
                numeroInscricao: boletoData.pagador.numeroInscricao || '',
                nome: boletoData.pagador.nome || '',
                endereco: boletoData.pagador.endereco || '',
                cep: boletoData.pagador.cep || '',
                cidade: boletoData.pagador.cidade || '',
                bairro: boletoData.pagador.bairro || '',
                uf: boletoData.pagador.uf || '',
                telefone: boletoData.pagador.telefone || '',
                email: boletoData.pagador.email || '',
            },
            // charges
            desconto: normalizeCharge(boletoData.desconto),
            segundoDesconto: normalizeCharge(boletoData.segundoDesconto),
            terceiroDesconto: normalizeCharge(boletoData.terceiroDesconto),
            multa: normalizeCharge(boletoData.multa),
            jurosMora: normalizeCharge(boletoData.jurosMora),
            beneficiarioFinal: boletoData.beneficiarioFinal || { tipoInscricao: 0, numeroInscricao: 0, nome: '' }
        };

        // strip undefined to avoid sending unnecessary fields
        Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

        return payload;
    };

    const gerar = async () => {
        setMsg({}); // limpa
        if (!selectedEmpresaId) return setMsg({ type: 'error', text: 'Selecione uma empresa.' });

        // validações simples
        if (!boletoData.valorOriginal || Number(boletoData.valorOriginal) <= 0) {
            return setMsg({ type: 'error', text: 'Informe um valorOriginal maior que zero.' });
        }
        setLoading(true);
        setIsDisabled(true); // Desativa imediatamente ao clicar

        try {
            const payload = buildPayload();
            const body = {
                empresa_id: selectedEmpresaId,
                boleto_data: payload
            };

            // debug: opcional mostrar preview
            console.debug('Payload enviar:', body);

            const res = await axiosInstance.post('/api/gerar-boleto/', body);
            setMsg({
                type: 'success',
                text: res?.data?.message || 'Boleto gerado com sucesso, salvo na pasta da empresa e enviado no WhatsApp.'
            });
        } catch (err) {
            // tenta extrair mensagem do response
            console.error(err);
            const errorText = err?.response?.data?.error || err?.response?.data?.message || 'Erro ao gerar boleto. Verifique logs.';
            setMsg({ type: 'error', text: errorText });
            setIsDisabled(false); // Reativa o botão apenas em caso de erro
        } finally {
            setLoading(false);
        }
    };

    const payloadPreview = buildPayload();

    return (
        <div className="p-6 md:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
            <h1 className="text-3xl font-bold mb-6 text-gray-900 dark:text-gray-100">Gerar Boleto</h1>

            {/* Seleção da empresa */}
            <div className="mb-6">
                <label className="block mb-2 font-medium text-gray-700 dark:text-gray-300">Empresa</label>
                <select
                    value={selectedEmpresaId}
                    onChange={(e) => setSelectedEmpresaId(e.target.value)}
                    className={inputClass}
                >
                    <option value="">Selecione...</option>
                    {empresas.map(e => (
                        <option key={e.id} value={e.id}>{e.nome}</option>
                    ))}
                </select>
            </div>

            {/* DADOS DO TÍTULO */}
            <Section title="Dados do Título">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input name="numeroConvenio" placeholder="Número Convênio" value={boletoData.numeroConvenio} onChange={update} className={inputClass} />
                    <input name="carteira" placeholder="Carteira (ex: 17)" value={boletoData.carteira} onChange={update} className={inputClass} />
                    <input name="numeroVariacaoCarteira" placeholder="Variação Carteira (opcional)" value={boletoData.numeroVariacaoCarteira} onChange={update} className={inputClass} />
                    <input name="codigoModalidade" placeholder="Modalidade" value={boletoData.codigoModalidade} onChange={update} className={inputClass} />
                    <label className="text-sm text-gray-600 dark:text-gray-300">Data Emissão</label>
                    <input name="dataEmissao" type="date" value={boletoData.dataEmissao} onChange={update} className={inputClass} />
                    <label className="text-sm text-gray-600 dark:text-gray-300">Data Vencimento</label>
                    <input name="dataVencimento" type="date" value={boletoData.dataVencimento} onChange={update} className={inputClass} />
                    <input name="valorOriginal" type="number" step="0.01" placeholder="Valor (ex: 150.00)" value={boletoData.valorOriginal} onChange={update} className={inputClass} />
                    <input name="numeroTituloBeneficiario" placeholder="Número Título Beneficiário (opcional)" value={boletoData.numeroTituloBeneficiario} onChange={update} className={inputClass} />
                    <input name="quantidade" placeholder="Quantidade (ex: 1)" value={boletoData.quantidade} onChange={update} className={inputClass} />
                </div>
            </Section>

            {/* DESCONTO */}
            <Section title="Desconto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <select name="tipo" value={boletoData.desconto.tipo} onChange={(e) => updateNested('desconto', e)} className={inputClass}>
                        <option value={0}>Sem desconto</option>
                        <option value={1}>Porcentagem</option>
                        <option value={2}>Valor fixo</option>
                    </select>
                    <input name="dataExpiracao" type="date" value={boletoData.desconto.dataExpiracao} onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                    <input name="porcentagem" type="number" step="0.01" placeholder="%" value={boletoData.desconto.porcentagem} onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                    <input name="valor" type="number" step="0.01" placeholder="Valor" value={boletoData.desconto.valor} onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                </div>
            </Section>

            {/* JUROS E MULTA */}
            <Section title="Juros e Multa">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input name="porcentagem" placeholder="Juros (%)" value={boletoData.jurosMora.porcentagem} onChange={(e) => updateNested('jurosMora', e)} className={inputClass} />
                    <input name="porcentagem" placeholder="Multa (%)" value={boletoData.multa.porcentagem} onChange={(e) => updateNested('multa', e)} className={inputClass} />
                    <input name="data" type="date" placeholder="Data Multa" value={boletoData.multa.data} onChange={(e) => updateNested('multa', e)} className={inputClass} />
                </div>
            </Section>

            {/* PIX */}
            <Section title="PIX">
                <select name="indicadorPix" value={boletoData.indicadorPix} onChange={update} className={inputClass}>
                    <option value="N">Não</option>
                    <option value="S">Sim</option>
                </select>
            </Section>

            {/* PAGADOR (editable) */}
            <Section title="Pagador (opcional)">
                <div className="mb-2">
                    <label className="inline-flex items-center">
                        <input type="checkbox" className="mr-2" checked={pagadorEditable} onChange={() => setPagadorEditable(!pagadorEditable)} />
                        Editar dados do pagador manualmente
                    </label>
                </div>
                {pagadorEditable && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input name="numeroInscricao" placeholder="CPF/CNPJ" value={boletoData.pagador.numeroInscricao} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="nome" placeholder="Nome" value={boletoData.pagador.nome} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="endereco" placeholder="Endereço" value={boletoData.pagador.endereco} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="cep" placeholder="CEP" value={boletoData.pagador.cep} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="cidade" placeholder="Cidade" value={boletoData.pagador.cidade} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="uf" placeholder="UF" value={boletoData.pagador.uf} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="telefone" placeholder="Telefone" value={boletoData.pagador.telefone} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                        <input name="email" placeholder="Email" value={boletoData.pagador.email} onChange={(e) => updateNested('pagador', e)} className={inputClass} />
                    </div>
                )}
            </Section>

            {/* Preview do payload */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold text-lg text-gray-800 dark:text-gray-100">Preview do payload</h2>
                    <button onClick={() => setShowPreview(prev => !prev)} className="text-sm text-indigo-600 dark:text-indigo-400">
                        {showPreview ? 'Ocultar' : 'Ver'}
                    </button>
                </div>
                {showPreview && (
                    <pre className="p-3 bg-white dark:bg-gray-800 rounded-md text-xs overflow-auto" style={{ maxHeight: 280 }}>
                        {JSON.stringify(payloadPreview, null, 2)}
                    </pre>
                )}
            </div>

            <button
                onClick={gerar}
                disabled={loading || isDisabled}
                className={`w-full p-3 font-semibold rounded-lg transition ${loading || isDisabled
                        ? 'bg-gray-400 cursor-not-allowed text-gray-200'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
            >
                {loading ? "Gerando..." : (isDisabled ? "Boleto Gerado" : "Gerar Boleto")}
            </button>

            {msg.text && (
                <p className={`mt-4 font-medium ${msg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                    {msg.text}
                </p>
            )}
        </div>
    );
};

export default GerarBoletoPage;
