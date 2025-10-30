import React, { useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance';

const Section = ({ title, children }) => {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg mb-4">
            <button
                onClick={() => setOpen(!open)}
                className="w-full p-3 bg-gray-100 dark:bg-gray-700 text-left font-semibold rounded-lg"
            >
                {title}
            </button>
            {open && <div className="p-4">{children}</div>}
        </div>
    );
};

const GerarBoletoPage = () => {
    // Reusable Tailwind classes for inputs to ensure transparent background and
    // high-contrast text for both light and dark themes.
    const inputClass = "w-full p-3 rounded border border-gray-300 dark:border-gray-600 bg-transparent text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500";
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');

    const [boletoData, setBoletoData] = useState({
        numeroConvenio: '',
        numeroCarteira: '',
        numeroVariacaoCarteira: '',
        codigoModalidade: '',
        dataEmissao: new Date().toISOString().split('T')[0],
        dataVencimento: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        valorOriginal: '',
        indicadorPix: 'N',

        desconto: { tipo: '', dataExpiracao: '', porcentagem: '', valor: '' },
        jurosMora: { tipo: '', porcentagem: '', valor: '' },
        multa: { tipo: '', data: '', porcentagem: '', valor: '' },
    });

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });

    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then(res => setEmpresas(res.data))
            .catch(() => setMsg({ type: 'error', text: 'Erro ao buscar empresas.' }));
    }, []);

    const update = (e) => setBoletoData({ ...boletoData, [e.target.name]: e.target.value });

    const updateNested = (section, e) =>
        setBoletoData({ ...boletoData, [section]: { ...boletoData[section], [e.target.name]: e.target.value } });

    const gerar = async () => {
        if (!selectedEmpresaId) return setMsg({ type: 'error', text: 'Selecione uma empresa.' });

        setLoading(true);
        setMsg({});

        try {
            const empresa = empresas.find(e => e.id == selectedEmpresaId);
            const pagador = {
                tipoInscricao: 2,
                numeroInscricao: empresa.cnpj.replace(/\D/g, ''),
                nome: empresa.nome,
                endereco: empresa.endereco || '',
                cep: empresa.cep || '',
                cidade: empresa.cidade || '',
                bairro: empresa.bairro || '',
                uf: empresa.uf || '',
            };

            const payload = { ...boletoData, pagador };

            const res = await axiosInstance.post('/api/gerar-boleto/', {
                empresa_id: selectedEmpresaId,
                boleto_data: payload
            }, { responseType: 'blob' });

            const blobURL = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = blobURL;
            a.download = 'boleto.pdf';
            a.click();

            setMsg({ type: 'success', text: 'Boleto gerado com sucesso!' });
        } catch {
            setMsg({ type: 'error', text: 'Erro ao gerar boleto.' });
        }

        setLoading(false);
    };

    return (
        <div className="p-6 md:p-8">
            <h1 className="text-3xl font-bold mb-6 text-gray-800 dark:text-gray-200">Gerar Boleto</h1>

            {/* Seleção da empresa */}
            <div className="mb-6">
                <label className="block mb-1">Empresa</label>
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
                <div className="grid grid-cols-2 gap-3">
                    <input name="numeroConvenio" placeholder="Número Convênio" onChange={update} className={inputClass} />
                    <input name="numeroCarteira" placeholder="Carteira" onChange={update} className={inputClass} />
                    <input name="numeroVariacaoCarteira" placeholder="Variação Carteira" onChange={update} className={inputClass} />
                    <input name="codigoModalidade" placeholder="Modalidade" onChange={update} className={inputClass} />
                    <input name="dataEmissao" type="date" onChange={update} className={inputClass} />
                    <input name="dataVencimento" type="date" onChange={update} className={inputClass} />
                    <input name="valorOriginal" type="number" step="0.01" placeholder="Valor" onChange={update} className={inputClass} />
                </div>
            </Section>

            {/* DESCONTOS */}
            <Section title="Desconto">
                <div className="grid grid-cols-2 gap-3">
                    <input name="tipo" placeholder="Tipo" onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                    <input name="dataExpiracao" type="date" onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                    <input name="porcentagem" type="number" step="0.01" placeholder="%" onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                    <input name="valor" type="number" step="0.01" placeholder="Valor" onChange={(e) => updateNested('desconto', e)} className={inputClass} />
                </div>
            </Section>

            {/* JUROS E MULTA */}
            <Section title="Juros e Multa">
                <div className="grid grid-cols-2 gap-3">
                    <input name="porcentagem" placeholder="Juros (%)" onChange={(e) => updateNested('jurosMora', e)} className={inputClass} />
                    <input name="porcentagem" placeholder="Multa (%)" onChange={(e) => updateNested('multa', e)} className={inputClass} />
                </div>
            </Section>

            {/* PIX */}
            <Section title="PIX">
                <select name="indicadorPix" value={boletoData.indicadorPix} onChange={update} className={inputClass}>
                    <option value="N">Não</option>
                    <option value="S">Sim</option>
                </select>
            </Section>

            <button onClick={gerar} disabled={loading} className="w-full p-3 bg-indigo-600 text-white rounded-md">
                {loading ? "Gerando..." : "Gerar Boleto"}
            </button>

            {msg.text && (
                <p className={`mt-4 ${msg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>{msg.text}</p>
            )}
        </div>
    );
};

export default GerarBoletoPage;
