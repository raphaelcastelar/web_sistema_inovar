import React, { useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';

const GerarProLaborePage = () => {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [formData, setFormData] = useState({
        empresa_nome: 'FOGAO CAIPIRA LTDA',
        empresa_endereco: 'Avenida Presidente Tancredo Neves',
        empresa_numero: '1054',
        empresa_bairro: 'Niteroi',
        empresa_municipio: 'Iuna',
        empresa_estado: 'ES',
        empresa_cep: '29.390-000',
        empresa_cnpj: '23.365.830/0001-18',
        colaborador_nome: 'ANA CLAUDIA BAPTISTA ARANTES VALE',
        colaborador_cpf: '103.597.126-73',
        referencia_mes_ano: '10/2025',
        data_assinatura: '05 de novembro de 2025',
        local_assinatura: 'Iuna - ES',
        valor_bruto: '5000,00',
        valor_inss: '550,00',
        valor_irrf: '212,10',
        valor_liquido: '4237,90',
        valor_liquido_extenso: 'quatro mil duzentos e trinta e sete reais e noventa centavos',
        nome_arquivo: '',
    });

    const inputClass =
        'w-full p-3 rounded-md border border-gray-300 dark:border-gray-600 ' +
        'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 ' +
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';

    const totalDescontosPreview = useMemo(() => {
        const toNumber = (v) => {
            const value = Number(String(v || '').replace(/\./g, '').replace(',', '.'));
            return Number.isFinite(value) ? value : 0;
        };
        const inss = toNumber(formData.valor_inss);
        const irrf = toNumber(formData.valor_irrf);
        return (inss + irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }, [formData.valor_inss, formData.valor_irrf]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ type: '', text: '' });

        try {
            const response = await axiosInstance.post('/api/gerar-pro-labore-docx/', formData, {
                responseType: 'blob',
            });

            const blob = new Blob(
                [response.data],
                { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
            );
            const disposition = response.headers['content-disposition'] || '';
            const fileNameFromHeader = disposition.match(/filename=\"?([^\";]+)\"?/i)?.[1];
            const fileName = fileNameFromHeader || 'recibo_pro_labore.docx';

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setMsg({ type: 'success', text: 'DOCX gerado e baixado com sucesso.' });
        } catch (error) {
            let errorMessage = 'Erro ao gerar documento.';

            if (error.response?.data instanceof Blob) {
                try {
                    const body = await error.response.data.text();
                    const parsed = JSON.parse(body);
                    errorMessage = parsed.error || errorMessage;
                } catch {
                    // fallback para mensagem padrão
                }
            }

            setMsg({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
            <h1 className="text-3xl font-bold mb-2 text-gray-900 dark:text-gray-100">Gerador de Pró-Labore (DOCX)</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Preencha os dados abaixo para gerar o recibo no formato Word.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Dados da Empresa</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input className={inputClass} name="empresa_nome" value={formData.empresa_nome} onChange={handleChange} placeholder="Razão social" />
                        <input className={inputClass} name="empresa_cnpj" value={formData.empresa_cnpj} onChange={handleChange} placeholder="CNPJ" />
                        <input className={inputClass} name="empresa_endereco" value={formData.empresa_endereco} onChange={handleChange} placeholder="Endereço" />
                        <input className={inputClass} name="empresa_numero" value={formData.empresa_numero} onChange={handleChange} placeholder="Número" />
                        <input className={inputClass} name="empresa_bairro" value={formData.empresa_bairro} onChange={handleChange} placeholder="Bairro" />
                        <input className={inputClass} name="empresa_municipio" value={formData.empresa_municipio} onChange={handleChange} placeholder="Município" />
                        <input className={inputClass} name="empresa_estado" value={formData.empresa_estado} onChange={handleChange} placeholder="UF" />
                        <input className={inputClass} name="empresa_cep" value={formData.empresa_cep} onChange={handleChange} placeholder="CEP" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Dados do Sócio</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input className={inputClass} name="colaborador_nome" value={formData.colaborador_nome} onChange={handleChange} placeholder="Nome completo" />
                        <input className={inputClass} name="colaborador_cpf" value={formData.colaborador_cpf} onChange={handleChange} placeholder="CPF" />
                        <input className={inputClass} name="referencia_mes_ano" value={formData.referencia_mes_ano} onChange={handleChange} placeholder="Referência (MM/AAAA)" />
                        <input className={inputClass} name="local_assinatura" value={formData.local_assinatura} onChange={handleChange} placeholder="Local de assinatura" />
                        <input className={inputClass} name="data_assinatura" value={formData.data_assinatura} onChange={handleChange} placeholder="Data por extenso" />
                        <input className={inputClass} name="nome_arquivo" value={formData.nome_arquivo} onChange={handleChange} placeholder="Nome do arquivo (opcional)" />
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 md:p-6">
                    <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Valores</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input className={inputClass} name="valor_bruto" value={formData.valor_bruto} onChange={handleChange} placeholder="Valor bruto (ex.: 5000,00)" />
                        <input className={inputClass} name="valor_inss" value={formData.valor_inss} onChange={handleChange} placeholder="INSS (ex.: 550,00)" />
                        <input className={inputClass} name="valor_irrf" value={formData.valor_irrf} onChange={handleChange} placeholder="IRRF (ex.: 212,10)" />
                        <input className={inputClass} name="valor_liquido" value={formData.valor_liquido} onChange={handleChange} placeholder="Líquido (opcional; pode ser calculado)" />
                    </div>
                    <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                        Total de descontos (pré-visualização): <strong>{totalDescontosPreview}</strong>
                    </p>
                    <textarea
                        className={`${inputClass} mt-4 min-h-24`}
                        name="valor_liquido_extenso"
                        value={formData.valor_liquido_extenso}
                        onChange={handleChange}
                        placeholder="Valor líquido por extenso"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className={`w-full p-3 rounded-lg font-semibold transition ${loading
                        ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                        }`}
                >
                    {loading ? 'Gerando...' : 'Gerar DOCX'}
                </button>

                {msg.text && (
                    <p className={`text-sm font-medium ${msg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                        {msg.text}
                    </p>
                )}
            </form>
        </div>
    );
};

export default GerarProLaborePage;
