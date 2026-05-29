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
    socio_id: '',
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

const MESES_PT_BR = [
    'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const getReferenciaMesAnterior = (baseDate = new Date()) => {
    const anoAtual = baseDate.getFullYear();
    const mesAtual = baseDate.getMonth(); // 0-11
    const mesAnterior = mesAtual === 0 ? 11 : mesAtual - 1;
    const anoReferencia = mesAtual === 0 ? anoAtual - 1 : anoAtual;
    return `${String(mesAnterior + 1).padStart(2, '0')}-${anoReferencia}`;
};

const getDataAtualPorExtenso = (baseDate = new Date()) => {
    const dia = baseDate.getDate();
    const mes = MESES_PT_BR[baseDate.getMonth()];
    const ano = baseDate.getFullYear();
    return `${dia} de ${mes} de ${ano}`;
};

const montarLocalAssinatura = (cidade, uf) => {
    const cidadeLimpa = String(cidade || '').trim();
    const ufLimpa = String(uf || '').trim().toUpperCase();
    if (cidadeLimpa && ufLimpa) return `${cidadeLimpa}-${ufLimpa}`;
    return '';
};

const manterValorEditavel = (valorAtual, valorPadrao) => {
    const valorLimpo = String(valorAtual || '').trim();
    return valorLimpo ? valorAtual : valorPadrao;
};

const INSS_ALIQUOTA = 0.11;
const INSS_TETO_BASE = 8475.55;
const IR_FAIXA_ISENCAO_TOTAL = 5000;
const IR_FAIXA_REDUCAO = 7350;
const IR_REDUCAO_INTERCEPT = 978.62;
const IR_REDUCAO_SLOPE = 0.133145;

const roundCurrency = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

const formatCurrencyInput = (value) => roundCurrency(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const calcIrrfSemReducao = (baseCalculo) => {
    if (baseCalculo <= 2428.80) return 0;
    if (baseCalculo <= 2826.65) return roundCurrency(baseCalculo * 0.075 - 182.16);
    if (baseCalculo <= 3751.05) return roundCurrency(baseCalculo * 0.15 - 394.16);
    if (baseCalculo <= 4664.68) return roundCurrency(baseCalculo * 0.225 - 675.49);
    return roundCurrency(baseCalculo * 0.275 - 908.73);
};

const UNIDADES = ['zero', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const DEZ_A_DEZENOVE = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

const numeroAte999PorExtenso = (n) => {
    if (n === 0) return '';
    if (n < 10) return UNIDADES[n];
    if (n < 20) return DEZ_A_DEZENOVE[n - 10];
    if (n < 100) {
        const dezena = Math.floor(n / 10);
        const unidade = n % 10;
        return unidade ? `${DEZENAS[dezena]} e ${UNIDADES[unidade]}` : DEZENAS[dezena];
    }
    if (n === 100) return 'cem';
    const centena = Math.floor(n / 100);
    const resto = n % 100;
    return resto ? `${CENTENAS[centena]} e ${numeroAte999PorExtenso(resto)}` : CENTENAS[centena];
};

const numeroInteiroPorExtenso = (n) => {
    if (n === 0) return 'zero';

    const bilhoes = Math.floor(n / 1000000000);
    const milhoes = Math.floor((n % 1000000000) / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const centenas = n % 1000;
    const partes = [];

    if (bilhoes > 0) {
        partes.push(`${numeroAte999PorExtenso(bilhoes)} ${bilhoes === 1 ? 'bilhao' : 'bilhoes'}`);
    }
    if (milhoes > 0) {
        partes.push(`${numeroAte999PorExtenso(milhoes)} ${milhoes === 1 ? 'milhao' : 'milhoes'}`);
    }
    if (milhares > 0) {
        partes.push(milhares === 1 ? 'mil' : `${numeroAte999PorExtenso(milhares)} mil`);
    }
    if (centenas > 0) {
        partes.push(numeroAte999PorExtenso(centenas));
    }

    if (partes.length === 1) return partes[0];
    return `${partes.slice(0, -1).join(' e ')} e ${partes[partes.length - 1]}`;
};

const valorMonetarioPorExtenso = (valor) => {
    const valorNormalizado = Math.max(0, roundCurrency(Number(valor) || 0));
    const [inteiroStr, centavosStr] = valorNormalizado.toFixed(2).split('.');
    const inteiro = Number(inteiroStr);
    const centavos = Number(centavosStr);

    const partes = [];
    if (inteiro > 0) {
        partes.push(`${numeroInteiroPorExtenso(inteiro)} ${inteiro === 1 ? 'real' : 'reais'}`);
    }
    if (centavos > 0) {
        partes.push(`${numeroInteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
    }

    if (!partes.length) return 'zero real';
    if (partes.length === 1) return partes[0];
    return `${partes[0]} e ${partes[1]}`;
};

const calcularProLabore = (valorBruto) => {
    const bruto = Math.max(0, Number(valorBruto) || 0);
    const baseInss = Math.min(bruto, INSS_TETO_BASE);
    const inss = roundCurrency(baseInss * INSS_ALIQUOTA);

    const baseIrrf = Math.max(0, bruto - inss);
    const irrfSemReducao = Math.max(0, calcIrrfSemReducao(baseIrrf));
    let irrf = irrfSemReducao;

    if (baseIrrf <= IR_FAIXA_ISENCAO_TOTAL) {
        irrf = 0;
    } else if (baseIrrf <= IR_FAIXA_REDUCAO) {
        const reducao = Math.max(0, IR_REDUCAO_INTERCEPT - (IR_REDUCAO_SLOPE * baseIrrf));
        irrf = Math.max(0, irrfSemReducao - reducao);
    }

    irrf = roundCurrency(irrf);
    const liquido = roundCurrency(Math.max(0, bruto - inss - irrf));

    return { inss, irrf, liquido };
};

const GerarProLaborePage = () => {
    const [mode, setMode] = useState('empresa');
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('empresa');
    const [loading, setLoading] = useState(false);
    const [empresas, setEmpresas] = useState([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState('');
    const [sociosEmpresa, setSociosEmpresa] = useState([]);
    const [selectedSocioId, setSelectedSocioId] = useState('');
    const [msg, setMsg] = useState({ type: '', text: '' });
    const [formData, setFormData] = useState(emptyForm);
    const referenciaMesAnteriorAuto = useMemo(() => getReferenciaMesAnterior(), []);
    const dataAtualExtensoAuto = useMemo(() => getDataAtualPorExtenso(), []);

    const inputClass =
        'w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm ' +
        'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ' +
        'placeholder-gray-400 dark:placeholder-gray-500 ' +
        'focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-400 dark:border-gray-700 dark:focus:ring-slate-500/20 transition';

    const cardClass =
        'rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 md:p-6';

    const toNumber = (value) => {
        const v = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
        return Number.isFinite(v) ? v : 0;
    };

    const brutoInformado = String(formData.valor_bruto || '').trim() !== '';
    const calculoValores = useMemo(() => calcularProLabore(toNumber(formData.valor_bruto)), [formData.valor_bruto]);
    const valorLiquidoExtensoAuto = useMemo(
        () => (brutoInformado ? valorMonetarioPorExtenso(calculoValores.liquido) : ''),
        [brutoInformado, calculoValores.liquido]
    );

    const totalDescontosPreview = useMemo(() => {
        const totalDescontos = toNumber(formData.valor_inss) + toNumber(formData.valor_irrf);
        return totalDescontos.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
        });
    }, [formData.valor_inss, formData.valor_irrf]);

    useEffect(() => {
        setFormData((prev) => ({
            ...prev,
            valor_inss: brutoInformado ? formatCurrencyInput(calculoValores.inss) : '',
            valor_irrf: brutoInformado ? formatCurrencyInput(calculoValores.irrf) : '',
            valor_liquido: brutoInformado ? formatCurrencyInput(calculoValores.liquido) : '',
            valor_liquido_extenso: valorLiquidoExtensoAuto,
        }));
    }, [brutoInformado, calculoValores.inss, calculoValores.irrf, calculoValores.liquido, valorLiquidoExtensoAuto]);

    useEffect(() => {
        axiosInstance.get('/api/empresas/')
            .then((res) => setEmpresas(Array.isArray(res.data) ? res.data : []))
            .catch(() => setMsg({ type: 'error', text: 'Nao foi possivel carregar empresas.' }));
    }, []);

    useEffect(() => {
        setFormData((prev) => ({
            ...prev,
            referencia_mes_ano: referenciaMesAnteriorAuto,
            data_assinatura: dataAtualExtensoAuto,
        }));
    }, [referenciaMesAnteriorAuto, dataAtualExtensoAuto]);

    useEffect(() => {
        if (mode !== 'empresa' || !selectedEmpresaId) return;

        const loadEmpresa = async () => {
            try {
                const { data } = await axiosInstance.get(`/api/empresas/${selectedEmpresaId}/`);
                const enderecoRaw = (data.endereco || '').trim();
                let endereco = enderecoRaw;
                let numero = (data.numero || '').trim();

                if (!numero) {
                    const match = enderecoRaw.match(/(.+?),\s*(?:n(?:u|ú)?m(?:ero)?\.?\s*)?(\d+)\s*$/i);
                    if (match) {
                        endereco = match[1].trim();
                        numero = match[2].trim();
                    }
                }
                const socios = Array.isArray(data.socios) ? data.socios : [];
                const primeiroSocio = socios[0];
                const proximoSocioId = primeiroSocio ? String(primeiroSocio.id) : '';
                setSociosEmpresa(socios);
                setSelectedSocioId(proximoSocioId);

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
                    socio_id: proximoSocioId,
                    colaborador_nome: primeiroSocio?.nome || '',
                    colaborador_cpf: primeiroSocio?.cpf || '',
                    referencia_mes_ano: manterValorEditavel(prev.referencia_mes_ano, referenciaMesAnteriorAuto),
                    local_assinatura: manterValorEditavel(prev.local_assinatura, montarLocalAssinatura(data.cidade, data.uf)),
                    data_assinatura: manterValorEditavel(prev.data_assinatura, dataAtualExtensoAuto),
                }));
            } catch {
                setMsg({ type: 'error', text: 'Nao foi possivel carregar os dados desta empresa.' });
            }
        };

        loadEmpresa();
    }, [mode, selectedEmpresaId, referenciaMesAnteriorAuto, dataAtualExtensoAuto]);

    useEffect(() => {
        if (mode !== 'empresa') return;
        const socioSelecionado = sociosEmpresa.find((s) => String(s.id) === String(selectedSocioId));
        if (!socioSelecionado) return;

        setFormData((prev) => ({
            ...prev,
            socio_id: String(socioSelecionado.id),
            colaborador_nome: socioSelecionado.nome || '',
            colaborador_cpf: socioSelecionado.cpf || '',
        }));
    }, [mode, selectedSocioId, sociosEmpresa]);

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
            setSociosEmpresa([]);
            setSelectedSocioId('');
            setFormData((prev) => ({
                ...prev,
                ...emptyForm,
                referencia_mes_ano: referenciaMesAnteriorAuto,
                data_assinatura: dataAtualExtensoAuto,
            }));
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
                ...(mode === 'empresa' && selectedSocioId ? { socio_id: selectedSocioId } : {}),
            };

            const response = await axiosInstance.post('/api/gerar-pro-labore-pdf/', payload, {
                responseType: 'blob',
            });

            const blob = new Blob([response.data], {
                type: 'application/pdf',
            });

            const disposition = response.headers['content-disposition'] || '';
            const fileNameFromHeader = disposition.match(/filename="?([^";]+)"?/i)?.[1];
            const fileName = fileNameFromHeader || 'recibo_pro_labore.pdf';

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            setMsg({ type: 'success', text: 'PDF gerado com sucesso.' });
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
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Financeiro</p>
                        <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Gerador de Pro-labore</h1>
                        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                            Escolha o modo com empresa cadastrada ou emissao avulsa.
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
                        <button
                            type="button"
                            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-3 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 md:hidden"
                            onClick={() => setMenuOpen((prev) => !prev)}
                        >
                            {menuOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
                        </button>

                        <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1 dark:bg-slate-950">
                            <button
                                type="button"
                                onClick={() => handleModeChange('empresa')}
                                className={`rounded px-4 py-2 text-sm font-semibold transition ${
                                    mode === 'empresa'
                                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                                        : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                            >
                                Com empresa cadastrada
                            </button>
                            <button
                                type="button"
                                onClick={() => handleModeChange('avulso')}
                                className={`rounded px-4 py-2 text-sm font-semibold transition ${
                                    mode === 'avulso'
                                        ? 'bg-slate-900 text-white shadow-sm dark:bg-slate-100 dark:text-slate-950'
                                        : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                            >
                                Avulso manual
                            </button>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-5">
                    <aside className={`${menuOpen ? 'block' : 'hidden'} md:block`}>
                        <div className="rounded-lg border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-800 dark:bg-gray-900">
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
                                                ? 'bg-slate-100 text-slate-900 font-semibold dark:bg-slate-800 dark:text-slate-100'
                                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
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
                                <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">Dados da Empresa</h2>

                                {mode === 'empresa' && (
                                    <div className="mb-4">
                                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Empresa</label>
                                        <select
                                            value={selectedEmpresaId}
                                            onChange={(e) => {
                                                const nextEmpresaId = e.target.value;
                                                setSelectedEmpresaId(nextEmpresaId);
                                                if (!nextEmpresaId) {
                                                    setSociosEmpresa([]);
                                                    setSelectedSocioId('');
                                                    setFormData((prev) => ({
                                                        ...prev,
                                                        socio_id: '',
                                                        colaborador_nome: '',
                                                        colaborador_cpf: '',
                                                        local_assinatura: '',
                                                        referencia_mes_ano: referenciaMesAnteriorAuto,
                                                        data_assinatura: dataAtualExtensoAuto,
                                                    }));
                                                }
                                            }}
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
                                <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">Dados do Socio</h2>

                                {mode === 'empresa' && (
                                    <div className="mb-4">
                                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Socio</label>
                                        <select
                                            value={selectedSocioId}
                                            onChange={(e) => setSelectedSocioId(e.target.value)}
                                            className={inputClass}
                                            disabled={!selectedEmpresaId || sociosEmpresa.length === 0}
                                        >
                                            <option value="">
                                                {selectedEmpresaId
                                                    ? (sociosEmpresa.length ? 'Selecione...' : 'Empresa sem socios cadastrados')
                                                    : 'Selecione uma empresa primeiro'}
                                            </option>
                                            {sociosEmpresa.map((socio) => (
                                                <option key={socio.id} value={socio.id}>
                                                    {socio.nome}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                                            Ao selecionar um socio, nome e CPF sao preenchidos automaticamente.
                                        </p>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome completo</span>
                                        <input className={inputClass} name="colaborador_nome" value={formData.colaborador_nome} onChange={handleChange} placeholder="Nome completo" />
                                    </label>
                                    <label className="block">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">CPF</span>
                                        <input className={inputClass} name="colaborador_cpf" value={formData.colaborador_cpf} onChange={handleChange} placeholder="CPF" />
                                    </label>
                                    <label className="block">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Referencia do pro-labore</span>
                                        <input className={inputClass} name="referencia_mes_ano" value={formData.referencia_mes_ano} onChange={handleChange} placeholder="MM-AAAA" />
                                    </label>
                                    <label className="block">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Local da assinatura</span>
                                        <input className={inputClass} name="local_assinatura" value={formData.local_assinatura} onChange={handleChange} placeholder="Cidade-UF" />
                                    </label>
                                    <label className="block md:col-span-2">
                                        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data da assinatura</span>
                                        <input className={inputClass} name="data_assinatura" value={formData.data_assinatura} onChange={handleChange} placeholder="Ex.: 21 de abril de 2026" />
                                    </label>
                                </div>
                            </section>
                        )}

                        {activeSection === 'valores' && (
                            <section className={cardClass}>
                                <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">Valores</h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <input className={inputClass} name="valor_bruto" value={formData.valor_bruto} onChange={handleChange} placeholder="Valor bruto" />
                                    <input
                                        className={inputClass}
                                        name="valor_inss"
                                        value={formData.valor_inss}
                                        onChange={handleChange}
                                        placeholder="INSS"
                                    />
                                    <input
                                        className={inputClass}
                                        name="valor_irrf"
                                        value={formData.valor_irrf}
                                        onChange={handleChange}
                                        placeholder="IRRF"
                                    />
                                    <input
                                        className={inputClass}
                                        name="valor_liquido"
                                        value={formData.valor_liquido}
                                        onChange={handleChange}
                                        placeholder="Liquido"
                                    />
                                </div>
                                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                                    Total de descontos: <strong>{totalDescontosPreview}</strong>
                                </p>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                    Regra aplicada: INSS de 11% com teto (R$ 8.475,55) e IRRF com reducao mensal da tabela 2026.
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
                                <h2 className="mb-4 text-lg font-semibold text-gray-950 dark:text-white">Finalizacao</h2>
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
                                    className={`mt-5 w-full rounded-md p-3 font-semibold transition ${
                                        loading
                                            ? 'bg-gray-400 text-gray-100 cursor-not-allowed'
                                            : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white'
                                    }`}
                                >
                                    {loading ? 'Gerando...' : 'Gerar PDF'}
                                </button>

                                {msg.text && (
                                    <p className={`mt-3 text-sm font-medium ${msg.type === 'error' ? 'text-rose-500' : 'text-emerald-500'}`}>
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
