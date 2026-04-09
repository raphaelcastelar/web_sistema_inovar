import React, { useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
    Bars3Icon,
    XMarkIcon,
    BuildingOffice2Icon,
    UserIcon,
    CurrencyDollarIcon,
    DocumentTextIcon,
} from '@heroicons/react/24/outline';

const emptyForm = {
    empresa_nome: '',
    empresa_endereco: '',
    empresa_numero: '',
    empresa_bairro: '',
    empresa_municipio: '',
    empresa_estado: '',
    empresa_cep: '',
    empresa_cnpj: '',
    colaborador_nome: '',
    colaborador_cpf: '',
    referencia_mes_ano: '',
    data_assinatura: '',
    local_assinatura: '',
    valor_bruto: '',
    valor_inss: '',
    valor_irrf: '',
    valor_liquido: '',
    valor_liquido_extenso: '',
    nome_arquivo: '',
};

const sections = [
    { id: 'empresa', label: 'Empresa', icon: BuildingOffice2Icon },
    { id: 'socio', label: 'Socio', icon: UserIcon },
    { id: 'valores', label: 'Valores', icon: CurrencyDollarIcon },
    { id: 'documento', label: 'Documento', icon: DocumentTextIcon },
];

const GerarProLaborePage = () => {
    const [mode, setMode] = useState('empresa');
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('empresa');
    const [loading, setLoading] = useState(false);
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [formData, setFormData] = useState(emptyForm);

    const inputClass =
        'w-full p-3 rounded-lg border border-gray-300 dark:border-gray-600 ' +
        'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ' +
        'placeholder-gray-400 dark:placeholder-gray-500 ' +
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition';

    const cardClass =
        'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-6 shadow-sm';

    const toNumber = (value) => {
        const v = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(v) ? v : 0;
    };

    const totalDescontosPreview = useMemo(() => {
        return (toNumber(formData.valor_inss) + toNumber(formData.valor_irrf)).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }, [formData.valor_inss, formData.valor_irrf]);

    useEffect(() => {
        axiosInstance.get('/api/empresas/')
            .then((res) => setEmpresas(Array.isArray(res.data) ? res.data : []))
            .catch(() => setMsg({ type: 'error', text: 'Nao foi possivel carregar empresas.' }));
    }, []);

    useEffect(() => {
        if (mode !== 'empresa' || !selectedEmpresaId) return;

        const loadEmpresa = async () => {
            try {
                const { data } = await axiosInstance.get(`/api/empresas/${selectedEmpresaId}/`);
                const enderecoRaw = (data.endereco || '').trim();
                let endereco = enderecoRaw;
                let numero = '';

                const match = enderecoRaw.match(/(.+?),\s*(?:n(?:u|ú)?m(?:ero)?\.?\s*)?(\d+)\s*$/i);
                if (match) {
                    endereco = match[1].trim();
                    numero = match[2].trim();
                }

                setFormData((prev) => ({
                    ...prev,
                    empresa_nome: data.nome || '',
                    empresa_cnpj: data.cnpj || '',
                    empresa_endereco: endereco || '',
                    empresa_numero: numero || '',
                    empresa_bairro: data.bairro || '',
                    empresa_municipio: data.cidade || '',
                    empresa_estado: data.uf || '',
                    empresa_cep: data.cep || '',
                }));
            } catch {
                setMsg({ type: 'error', text: 'Nao foi possivel carregar os dados desta empresa.' });
            }
        };

        loadEmpresa();
    }, [mode, selectedEmpresaId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSectionChange = (sectionId) => {
        setActiveSection(sectionId);
        setMenuOpen(false);
    };

    const handleModeChange = (nextMode) => {
        setMode(nextMode);
        setMsg({ type: '', text: '' });
        if (nextMode === 'avulso') {
            setSelectedEmpresaId('');
            setFormData((prev) => ({ ...prev, ...emptyForm }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMsg({ type: '', text: '' });

        try {
            const payload = {
                ...formData,
                ...(mode === 'empresa' && selectedEmpresaId ? { empresa_id: selectedEmpresaId } : {}),
            };

            const response = await axiosInstance.post('/api/gerar-pro-labore-docx/', payload, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data], {
                type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            });

            const disposition = response.headers['content-disposition'] || '';
            const fileNameFromHeader = disposition.match(/filename="?([^";]+)"?/i)?.[1];
            const fileName = fileNameFromHeader || 'recibo_pro_labore.docx';

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setMsg({ type: 'success', text: 'DOCX gerado com sucesso.' });
        } catch (error) {
            let errorMessage = 'Erro ao gerar documento.';
            if (error.response?.data instanceof Blob) {
                try {
                    const body = await error.response.data.text();
                    const parsed = JSON.parse(body);
                    errorMessage = parsed.error || errorMessage;
                } catch {
                    // noop
                }
            }
            setMsg({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 md:p-8 bg-gray-50 dark:bg-gray-900 min-h-screen transition-colors duration-300">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 md:p-6 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100">Gerador de Pro-labore</h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Escolha o modo com empresa cadastrada ou emissao avulsa.
                            </p>
                        </div>
                        <button
                            type="button"
                            className="md:hidden p-2 rounded-lg border border-gray-300 dark:border-gray-600"
                            onClick={() => setMenuOpen((prev) => !prev)}
                        >
                            {menuOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
                        </button>
                    </div>

                    <div className="mt-4 flex gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={() => handleModeChange('empresa')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                mode === 'empresa'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            Com empresa cadastrada
                        </button>
                        <button
                            type="button"
                            onClick={() => handleModeChange('avulso')}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                                mode === 'avulso'
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                            }`}
                        >
                            Avulso manual
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
                    <aside className={`${menuOpen ? 'block' : 'hidden'} md:block`}>
                        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-2 shadow-sm">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                const active = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => handleSectionChange(section.id)}
                                        className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition ${
                                            active
                                                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {section.label}
                                    </button>
                                );
                            })}
                        </div>
                    </aside>

                    <main className="space-y-5">
                        {activeSection === 'empresa' && (
                            <section className={cardClass}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Dados da Empresa</h2>

                                {mode === 'empresa' && (
                                    <div className="mb-4">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Empresa</label>
                                        <select
                                            value={selectedEmpresaId}
                                            onChange={(e) => setSelectedEmpresaId(e.target.value)}
                                            className={inputClass}
                                        >
                                            <option value="">Selecione...</option>
                                            {empresas.map((empresa) => (
                                                <option key={empresa.id} value={empresa.id}>{empresa.nome}</option>
                                            ))}
                                        </select>
                                        <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                                            Os dados serao puxados do cadastro da empresa selecionada.
                                        </p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input className={inputClass} name="empresa_nome" value={formData.empresa_nome} onChange={handleChange} placeholder="Razao social" />
                                    <input className={inputClass} name="empresa_cnpj" value={formData.empresa_cnpj} onChange={handleChange} placeholder="CNPJ" />
                                    <input className={inputClass} name="empresa_endereco" value={formData.empresa_endereco} onChange={handleChange} placeholder="Endereco" />
                                    <input className={inputClass} name="empresa_numero" value={formData.empresa_numero} onChange={handleChange} placeholder="Numero" />
                                    <input className={inputClass} name="empresa_bairro" value={formData.empresa_bairro} onChange={handleChange} placeholder="Bairro" />
                                    <input className={inputClass} name="empresa_municipio" value={formData.empresa_municipio} onChange={handleChange} placeholder="Municipio" />
                                    <input className={inputClass} name="empresa_estado" value={formData.empresa_estado} onChange={handleChange} placeholder="UF" />
                                    <input className={inputClass} name="empresa_cep" value={formData.empresa_cep} onChange={handleChange} placeholder="CEP" />
                                </div>
                            </section>
                        )}

                        {activeSection === 'socio' && (
                            <section className={cardClass}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Dados do Socio</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input className={inputClass} name="colaborador_nome" value={formData.colaborador_nome} onChange={handleChange} placeholder="Nome completo" />
                                    <input className={inputClass} name="colaborador_cpf" value={formData.colaborador_cpf} onChange={handleChange} placeholder="CPF" />
                                    <input className={inputClass} name="referencia_mes_ano" value={formData.referencia_mes_ano} onChange={handleChange} placeholder="Referencia (MM/AAAA)" />
                                    <input className={inputClass} name="local_assinatura" value={formData.local_assinatura} onChange={handleChange} placeholder="Local de assinatura" />
                                    <input className={inputClass} name="data_assinatura" value={formData.data_assinatura} onChange={handleChange} placeholder="Data por extenso" />
                                </div>
                            </section>
                        )}

                        {activeSection === 'valores' && (
                            <section className={cardClass}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Valores</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input className={inputClass} name="valor_bruto" value={formData.valor_bruto} onChange={handleChange} placeholder="Valor bruto" />
                                    <input className={inputClass} name="valor_inss" value={formData.valor_inss} onChange={handleChange} placeholder="INSS" />
                                    <input className={inputClass} name="valor_irrf" value={formData.valor_irrf} onChange={handleChange} placeholder="IRRF" />
                                    <input className={inputClass} name="valor_liquido" value={formData.valor_liquido} onChange={handleChange} placeholder="Liquido (opcional)" />
                                </div>
                                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                    Total de descontos: <strong>{totalDescontosPreview}</strong>
                                </p>
                                <textarea
                                    className={`${inputClass} mt-4 min-h-24`}
                                    name="valor_liquido_extenso"
                                    value={formData.valor_liquido_extenso}
                                    onChange={handleChange}
                                    placeholder="Valor liquido por extenso"
                                />
                            </section>
                        )}

                        {activeSection === 'documento' && (
                            <section className={cardClass}>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Finalizacao</h2>
                                <input
                                    className={inputClass}
                                    name="nome_arquivo"
                                    value={formData.nome_arquivo}
                                    onChange={handleChange}
                                    placeholder="Nome do arquivo (opcional)"
                                />

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`mt-5 w-full p-3 rounded-lg font-semibold transition ${
                                        loading
                                            ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                    }`}
                                >
                                    {loading ? 'Gerando...' : 'Gerar DOCX'}
                                </button>

                                {msg.text && (
                                    <p className={`mt-3 text-sm font-medium ${msg.type === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                                        {msg.text}
                                    </p>
                                )}
                            </section>
                        )}
                    </main>
                </form>
            </div>
        </div>
    );
};

export default GerarProLaborePage;
