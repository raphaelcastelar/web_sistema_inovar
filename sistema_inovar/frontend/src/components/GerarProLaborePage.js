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

const GerarProLaborePage = () => {
    const [mode, setMode] = useState('empresa');
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('empresa');
    const [loading, setLoading] = useState(false);
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
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

    const sections = [
        { id: 'empresa', label: 'Dados da Empresa', icon: BuildingOffice2Icon },
        { id: 'socio', label: 'Socio e Referencia', icon: UserIcon },
        { id: 'valores', label: 'Valores', icon: CurrencyDollarIcon },
        { id: 'finalizacao', label: 'Finalizacao', icon: DocumentTextIcon },
    ];

    const inputClass =
        'w-full px-3 py-2.5 rounded-xl border border-slate-300/70 dark:border-slate-600/70 ' +
        'bg-white/95 dark:bg-slate-900/70 text-slate-900 dark:text-slate-100 ' +
        'placeholder:text-slate-400 dark:placeholder:text-slate-500 ' +
        'focus:outline-none focus:ring-2 focus:ring-cyan-500/70 focus:border-cyan-400 transition';

    const totalDescontosPreview = useMemo(() => {
        const toNumber = (v) => {
            const value = Number(String(v || '').replace(/\./g, '').replace(',', '.'));
            return Number.isFinite(value) ? value : 0;
        };
        const inss = toNumber(formData.valor_inss);
        const irrf = toNumber(formData.valor_irrf);
        return (inss + irrf).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }, [formData.valor_inss, formData.valor_irrf]);

    useEffect(() => {
        axiosInstance.get('/api/empresas/?all=true')
            .then((res) => setEmpresas(res.data || []))
            .catch(() => setMsg({ type: 'error', text: 'Nao foi possivel carregar as empresas.' }));
    }, []);

    useEffect(() => {
        if (mode !== 'empresa' || !selectedEmpresaId) return;

        const empresa = empresas.find((item) => String(item.id) === String(selectedEmpresaId));
        if (!empresa) return;

        const enderecoRaw = (empresa.endereco || '').trim();
        let endereco = enderecoRaw;
        let numero = '';
        const match = enderecoRaw.match(/(.+?),\s*(?:n(?:u|u)?m(?:ero)?\.?\s*)?(\d+)\s*$/i);
        if (match) {
            endereco = match[1].trim();
            numero = match[2].trim();
        }

        setFormData((prev) => ({
            ...prev,
            empresa_nome: empresa.nome || prev.empresa_nome,
            empresa_cnpj: empresa.cnpj || prev.empresa_cnpj,
            empresa_endereco: endereco || prev.empresa_endereco,
            empresa_numero: numero || prev.empresa_numero,
            empresa_bairro: empresa.bairro || prev.empresa_bairro,
            empresa_municipio: empresa.cidade || prev.empresa_municipio,
            empresa_estado: empresa.uf || prev.empresa_estado,
            empresa_cep: empresa.cep || prev.empresa_cep,
        }));
    }, [mode, selectedEmpresaId, empresas]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const switchMode = (nextMode) => {
        setMode(nextMode);
        setMsg({ type: '', text: '' });
        if (nextMode === 'avulso') {
            setSelectedEmpresaId('');
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

            const blob = new Blob(
                [response.data],
                { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
            );

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

            setMsg({ type: 'success', text: 'DOCX gerado e baixado com sucesso.' });
        } catch (error) {
            let errorMessage = 'Erro ao gerar documento.';

            if (error.response?.data instanceof Blob) {
                try {
                    const body = await error.response.data.text();
                    const parsed = JSON.parse(body);
                    errorMessage = parsed.error || errorMessage;
                } catch {
                    // fallback
                }
            }

            setMsg({ type: 'error', text: errorMessage });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-screen bg-slate-950 text-slate-100 overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.25),transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.25),transparent_42%)] pointer-events-none" />
            <div className="relative p-4 md:p-8">
                <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-5 md:p-6 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pro-labore Studio</h1>
                            <p className="text-sm text-slate-300 mt-1">
                                Use dados da empresa do banco ou gere um recibo avulso totalmente manual.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setMenuOpen((prev) => !prev)}
                            className="md:hidden p-2 rounded-lg border border-white/15 bg-white/10 hover:bg-white/20 transition"
                        >
                            {menuOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
                        </button>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => switchMode('empresa')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                                mode === 'empresa'
                                    ? 'bg-cyan-400 text-slate-900'
                                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                            }`}
                        >
                            Com empresa do banco
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode('avulso')}
                            className={`px-4 py-2 rounded-full text-sm font-medium transition ${
                                mode === 'avulso'
                                    ? 'bg-cyan-400 text-slate-900'
                                    : 'bg-white/10 text-slate-200 hover:bg-white/20'
                            }`}
                        >
                            Avulso (manual)
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-5">
                    <aside className={`${menuOpen ? 'block' : 'hidden'} md:block`}>
                        <div className="sticky top-4 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-3 space-y-2">
                            {sections.map((section) => {
                                const Icon = section.icon;
                                const active = activeSection === section.id;
                                return (
                                    <button
                                        key={section.id}
                                        type="button"
                                        onClick={() => {
                                            setActiveSection(section.id);
                                            setMenuOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                                            active
                                                ? 'bg-cyan-400 text-slate-900 font-semibold'
                                                : 'bg-white/5 hover:bg-white/15 text-slate-200'
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
                            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 md:p-6 shadow-xl">
                                <h2 className="text-lg font-semibold mb-4">Dados da Empresa</h2>
                                {mode === 'empresa' && (
                                    <div className="mb-4">
                                        <label className="block text-sm text-slate-300 mb-1">Empresa no banco</label>
                                        <select
                                            value={selectedEmpresaId}
                                            onChange={(e) => setSelectedEmpresaId(e.target.value)}
                                            className={inputClass}
                                        >
                                            <option value="">Selecione...</option>
                                            {empresas.map((empresa) => (
                                                <option key={empresa.id} value={empresa.id}>
                                                    {empresa.nome}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs text-slate-400 mt-1">
                                            O que existir no cadastro e preenchido automaticamente.
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
                            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 md:p-6 shadow-xl">
                                <h2 className="text-lg font-semibold mb-4">Socio e Referencia</h2>
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
                            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 md:p-6 shadow-xl">
                                <h2 className="text-lg font-semibold mb-4">Valores</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input className={inputClass} name="valor_bruto" value={formData.valor_bruto} onChange={handleChange} placeholder="Valor bruto (ex.: 5000,00)" />
                                    <input className={inputClass} name="valor_inss" value={formData.valor_inss} onChange={handleChange} placeholder="INSS (ex.: 550,00)" />
                                    <input className={inputClass} name="valor_irrf" value={formData.valor_irrf} onChange={handleChange} placeholder="IRRF (ex.: 212,10)" />
                                    <input className={inputClass} name="valor_liquido" value={formData.valor_liquido} onChange={handleChange} placeholder="Liquido (opcional; pode ser calculado)" />
                                </div>
                                <p className="mt-3 text-sm text-slate-300">
                                    Total de descontos (pre-visualizacao): <strong>{totalDescontosPreview}</strong>
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

                        {activeSection === 'finalizacao' && (
                            <section className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 md:p-6 shadow-xl">
                                <h2 className="text-lg font-semibold mb-4">Finalizacao</h2>
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
                                    className={`mt-5 w-full p-3 rounded-xl font-semibold transition ${
                                        loading
                                            ? 'bg-slate-500 text-slate-200 cursor-not-allowed'
                                            : 'bg-cyan-400 hover:bg-cyan-300 text-slate-900'
                                    }`}
                                >
                                    {loading ? 'Gerando...' : 'Gerar DOCX'}
                                </button>

                                {msg.text && (
                                    <p className={`text-sm font-medium mt-3 ${msg.type === 'error' ? 'text-rose-300' : 'text-emerald-300'}`}>
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
