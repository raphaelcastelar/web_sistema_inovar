import React, { useEffect, useMemo, useState } from 'react';
import axiosInstance from '../api/axiosInstance';
import {
    BanknotesIcon,
    BriefcaseIcon,
    BuildingStorefrontIcon,
    ChartBarSquareIcon,
    Cog6ToothIcon,
    CurrencyDollarIcon,
    InformationCircleIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    CloudArrowUpIcon,
    DocumentArrowDownIcon,
    BuildingOffice2Icon,
    XMarkIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';

const CONFIG_STORAGE_KEY = 'proposta_comercial_configuracao_v1';

const atividadesBase = [
    {
        id: 'servico',
        label: 'Servico',
        icon: BriefcaseIcon,
        honorarios: {
            zerada: 200,
            ate50: 300,
            ate100: 400,
            ate200: 500,
            ate300: 600,
            acima300: null,
        },
    },
    {
        id: 'comercio',
        label: 'Comercio',
        icon: BuildingStorefrontIcon,
        honorarios: {
            zerada: 200,
            ate50: 350,
            ate100: 450,
            ate200: 600,
            ate300: 800,
            acima300: null,
        },
    },
    {
        id: 'industria',
        label: 'Industria',
        icon: ChartBarSquareIcon,
        honorarios: {
            zerada: 200,
            ate50: 450,
            ate100: 550,
            ate200: 700,
            ate300: 900,
            acima300: null,
        },
    },
];

const faixasFaturamento = [
    { id: 'zerada', label: 'Zerada' },
    { id: 'ate50', label: 'Ate 50 mil' },
    { id: 'ate100', label: '51 mil ate 100 mil' },
    { id: 'ate200', label: '101 mil ate 200 mil' },
    { id: 'ate300', label: '201 mil ate 300 mil' },
    { id: 'acima300', label: '301 mil +' },
];

const configuracaoPadrao = {
    atividades: atividadesBase.map((atividade) => ({
        id: atividade.id,
        honorarios: { ...atividade.honorarios },
    })),
    percentuaisAtividade: {
        1: 0,
        multiplas: 20,
    },
    folha: {
        ate3: 50,
        quatroA14: 175,
    },
};

const cloneConfiguracaoPadrao = () => ({
    atividades: configuracaoPadrao.atividades.map((atividade) => ({
        id: atividade.id,
        honorarios: { ...atividade.honorarios },
    })),
    percentuaisAtividade: { ...configuracaoPadrao.percentuaisAtividade },
    folha: { ...configuracaoPadrao.folha },
});

const carregarConfiguracao = () => {
    try {
        const configuracaoSalva = JSON.parse(window.localStorage.getItem(CONFIG_STORAGE_KEY));
        if (!configuracaoSalva) return cloneConfiguracaoPadrao();

        return {
            atividades: configuracaoPadrao.atividades.map((atividadePadrao) => {
                const atividadeSalva = configuracaoSalva.atividades?.find((item) => item.id === atividadePadrao.id);
                return {
                    id: atividadePadrao.id,
                    honorarios: {
                        ...atividadePadrao.honorarios,
                        ...(atividadeSalva?.honorarios || {}),
                    },
                };
            }),
            percentuaisAtividade: {
                ...configuracaoPadrao.percentuaisAtividade,
                ...(configuracaoSalva.percentuaisAtividade || {}),
            },
            folha: {
                ...configuracaoPadrao.folha,
                ...(configuracaoSalva.folha || {}),
            },
        };
    } catch (error) {
        return cloneConfiguracaoPadrao();
    }
};

const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const roundCurrency = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const clampNumber = (value, min = 0, max = 999) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
};

const parseConfigNumber = (value, fallback = 0) => {
    const parsed = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const getAdicionalFolha = (funcionarios, folhaConfig, valorPorFuncionario) => {
    if (funcionarios === 0) {
        return { faixa: 'Sem funcionarios', tipo: 'fixo', quantidadeCobrada: 0, total: 0 };
    }

    if (funcionarios <= 3) {
        return {
            faixa: 'Ate 3 funcionarios',
            tipo: 'fixo',
            quantidadeCobrada: funcionarios,
            total: parseConfigNumber(folhaConfig.ate3),
        };
    }

    if (funcionarios <= 14) {
        return {
            faixa: 'De 4 a 14 funcionarios',
            tipo: 'fixo',
            quantidadeCobrada: funcionarios,
            total: parseConfigNumber(folhaConfig.quatroA14),
        };
    }

    const valorUnitario = parseConfigNumber(valorPorFuncionario);
    return {
        faixa: '15 ou mais funcionarios',
        tipo: 'unitario',
        valorUnitario,
        quantidadeCobrada: funcionarios,
        total: funcionarios * valorUnitario,
    };
};

const CalculadoraHonorariosPage = () => {
    const [atividadesSelecionadas, setAtividadesSelecionadas] = useState(['servico']);
    const [faturamento, setFaturamento] = useState('ate50');
    const [funcionarios, setFuncionarios] = useState(0);
    const [valorPorFuncionario, setValorPorFuncionario] = useState('');
    const [configOpen, setConfigOpen] = useState(false);
    const [configuracao, setConfiguracao] = useState(carregarConfiguracao);
    const [configuracaoSalva, setConfiguracaoSalva] = useState(false);
    const [empresas, setEmpresas] = useState([]);
    const [empresaId, setEmpresaId] = useState('');
    const [carregandoEmpresas, setCarregandoEmpresas] = useState(true);
    const [modalProposta, setModalProposta] = useState(null);
    const [descontoTipo, setDescontoTipo] = useState('percentual');
    const [descontoValor, setDescontoValor] = useState('');
    const [gerandoProposta, setGerandoProposta] = useState(false);
    const [mensagemProposta, setMensagemProposta] = useState(null);

    useEffect(() => {
        axiosInstance.get('/api/empresas/?compact=true')
            .then((response) => setEmpresas(Array.isArray(response.data) ? response.data : []))
            .catch(() => setMensagemProposta({ tipo: 'erro', texto: 'Nao foi possivel carregar as empresas.' }))
            .finally(() => setCarregandoEmpresas(false));
    }, []);

    const atividades = useMemo(() => (
        atividadesBase.map((atividade) => {
            const atividadeConfig = configuracao.atividades.find((item) => item.id === atividade.id);
            return {
                ...atividade,
                honorarios: atividadeConfig?.honorarios || atividade.honorarios,
            };
        })
    ), [configuracao.atividades]);

    const toggleAtividade = (atividadeId) => {
        setAtividadesSelecionadas((selecionadasAtuais) => {
            if (selecionadasAtuais.includes(atividadeId)) {
                return selecionadasAtuais.length === 1
                    ? selecionadasAtuais
                    : selecionadasAtuais.filter((id) => id !== atividadeId);
            }

            return [...selecionadasAtuais, atividadeId].slice(0, 3);
        });
    };

    const updateHonorarioConfig = (atividadeId, faixaId, value) => {
        setConfiguracao((configAtual) => ({
            ...configAtual,
            atividades: configAtual.atividades.map((atividade) => (
                atividade.id === atividadeId
                    ? {
                        ...atividade,
                        honorarios: {
                            ...atividade.honorarios,
                            [faixaId]: parseConfigNumber(value),
                        },
                    }
                    : atividade
            )),
        }));
    };

    const updatePercentualConfig = (quantidade, value) => {
        setConfiguracao((configAtual) => ({
            ...configAtual,
            percentuaisAtividade: {
                ...configAtual.percentuaisAtividade,
                [quantidade]: parseConfigNumber(value),
            },
        }));
    };

    const updateFolhaConfig = (campo, value) => {
        setConfiguracao((configAtual) => ({
            ...configAtual,
            folha: {
                ...configAtual.folha,
                [campo]: parseConfigNumber(value),
            },
        }));
    };

    const salvarConfiguracao = () => {
        window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configuracao));
        setConfiguracaoSalva(true);
        window.setTimeout(() => setConfiguracaoSalva(false), 2500);
    };

    const resetConfiguracao = () => {
        setConfiguracao(cloneConfiguracaoPadrao());
        setConfiguracaoSalva(false);
    };

    const abrirGeracaoProposta = () => {
        setMensagemProposta(null);
        if (!empresaId) {
            setMensagemProposta({ tipo: 'erro', texto: 'Selecione a empresa antes de gerar a proposta.' });
            return;
        }
        if (clampNumber(funcionarios) >= 15 && parseConfigNumber(valorPorFuncionario) <= 0) {
            setMensagemProposta({ tipo: 'erro', texto: 'Informe o valor por funcionario para concluir a proposta.' });
            return;
        }
        setDescontoValor('');
        setDescontoTipo('percentual');
        setModalProposta('pergunta');
    };

    const calculo = useMemo(() => {
        const selecionadas = atividades.filter((item) => atividadesSelecionadas.includes(item.id));
        const atividadesComValor = selecionadas.map((item) => ({
            ...item,
            valorFaixa: item.honorarios[faturamento],
        }));
        const exigePlanejamento = atividadesComValor.some((item) => item.valorFaixa === null);
        const atividadeBase = atividadesComValor.reduce((maior, item) => {
            if (!maior) return item;
            return Number(item.valorFaixa || 0) > Number(maior.valorFaixa || 0) ? item : maior;
        }, null);
        const honorarioBase = atividadeBase?.valorFaixa ?? 0;
        const qtdFuncionarios = clampNumber(funcionarios);
        const qtdTiposAtividade = clampNumber(selecionadas.length, 1, 3);
        const folha = getAdicionalFolha(qtdFuncionarios, configuracao.folha, valorPorFuncionario);
        const percentualConfig = qtdTiposAtividade === 1
            ? configuracao.percentuaisAtividade[1]
            : configuracao.percentuaisAtividade.multiplas;
        const percentualTipoAtividade = parseConfigNumber(percentualConfig) / 100;

        if (exigePlanejamento) {
            return {
                atividadesSelecionadas: selecionadas,
                atividadeBase,
                exigePlanejamento,
                honorarioBase,
                baseAumentoAtividades: honorarioBase,
                folha,
                percentualTipoAtividade,
                adicionalTipoAtividade: 0,
                honorarioComAtividades: 0,
                total: 0,
            };
        }

        const baseAumentoAtividades = honorarioBase;
        const adicionalTipoAtividade = roundCurrency(baseAumentoAtividades * percentualTipoAtividade);
        const honorarioComAtividades = roundCurrency(honorarioBase + adicionalTipoAtividade);
        const total = roundCurrency(honorarioComAtividades + folha.total);

        return {
            atividadesSelecionadas: selecionadas,
            atividadeBase,
            exigePlanejamento,
            honorarioBase,
            baseAumentoAtividades,
            folha,
            percentualTipoAtividade,
            adicionalTipoAtividade,
            honorarioComAtividades,
            total,
        };
    }, [atividades, atividadesSelecionadas, faturamento, funcionarios, valorPorFuncionario, configuracao.folha, configuracao.percentuaisAtividade]);

    const gerarProposta = async (tipo = 'nenhum') => {
        const valorDesconto = parseConfigNumber(descontoValor);
        if (tipo !== 'nenhum' && valorDesconto <= 0) {
            setMensagemProposta({ tipo: 'erro', texto: 'Informe um desconto maior que zero.' });
            return;
        }
        if (tipo === 'percentual' && valorDesconto > 100) {
            setMensagemProposta({ tipo: 'erro', texto: 'O percentual de desconto nao pode superar 100%.' });
            return;
        }
        if (tipo === 'valor' && valorDesconto > calculo.total) {
            setMensagemProposta({ tipo: 'erro', texto: 'O desconto nao pode superar o valor calculado.' });
            return;
        }

        setGerandoProposta(true);
        setMensagemProposta(null);
        try {
            const faixaSelecionada = faixasFaturamento.find((item) => item.id === faturamento);
            const response = await axiosInstance.post('/api/gerar-proposta-comercial-pdf/', {
                empresa_id: empresaId,
                faixa_faturamento: faixaSelecionada?.label || '',
                grupo_atividade: calculo.atividadesSelecionadas.map((item) => item.label).join(', '),
                honorario_contabil_fiscal: calculo.honorarioComAtividades,
                funcionarios: clampNumber(funcionarios),
                faixa_folha: calculo.folha.faixa,
                honorario_pessoal: calculo.folha.total,
                total_bruto: calculo.total,
                desconto_tipo: tipo,
                desconto_valor: tipo === 'nenhum' ? 0 : valorDesconto,
            }, { responseType: 'blob' });

            const blob = new Blob([response.data], { type: 'application/pdf' });
            const disposition = response.headers['content-disposition'] || '';
            const fileName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'proposta_comercial.pdf';
            const downloadUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);

            setModalProposta(null);
            setMensagemProposta({ tipo: 'sucesso', texto: 'Proposta gerada com sucesso.' });
        } catch (error) {
            let texto = 'Nao foi possivel gerar a proposta.';
            if (error.response?.data instanceof Blob) {
                try {
                    const body = JSON.parse(await error.response.data.text());
                    texto = body.error || texto;
                } catch {
                    // Mantem a mensagem padrao quando a resposta nao for JSON.
                }
            }
            setMensagemProposta({ tipo: 'erro', texto });
        } finally {
            setGerandoProposta(false);
        }
    };

    const inputClass =
        'w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-gray-900 outline-none transition ' +
        'focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20';

    const labelClass = 'mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200';

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Financeiro</p>
                    <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">Proposta Comercial</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                        Calcule o valor sugerido para a proposta conforme o perfil da empresa.
                    </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
                    <button
                        type="button"
                        onClick={() => setConfigOpen((open) => !open)}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                    >
                        <Cog6ToothIcon className="h-5 w-5" />
                        Configuracoes
                    </button>

                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                        <div className="flex items-start gap-2">
                            <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                            <span>Faturamento acima de 301 mil exige planejamento tributario.</span>
                        </div>
                    </div>
                </div>
            </div>

            {configOpen && (
                <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-950 dark:text-white">Configuracoes da proposta</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Altere os valores usados no calculo e salve para reutiliza-los futuramente.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={resetConfiguracao}
                                className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
                            >
                                <ArrowPathIcon className="h-5 w-5" />
                                Restaurar padrao
                            </button>
                            <button
                                type="button"
                                onClick={salvarConfiguracao}
                                className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            >
                                {configuracaoSalva ? <CheckCircleIcon className="h-5 w-5" /> : <CloudArrowUpIcon className="h-5 w-5" />}
                                {configuracaoSalva ? 'Configuracoes salvas' : 'Salvar configuracoes'}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Honorarios base</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-left text-gray-700 dark:bg-slate-900 dark:text-gray-200">
                                            <th className="border border-gray-200 px-3 py-2 dark:border-gray-800">Atividade</th>
                                            {faixasFaturamento.filter((faixa) => faixa.id !== 'acima300').map((faixa) => (
                                                <th key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-800">{faixa.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {atividades.map((atividade) => (
                                            <tr key={atividade.id}>
                                                <td className="border border-gray-200 px-3 py-2 font-semibold dark:border-gray-800">{atividade.label}</td>
                                                {faixasFaturamento.filter((faixa) => faixa.id !== 'acima300').map((faixa) => (
                                                    <td key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-800">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={atividade.honorarios[faixa.id]}
                                                            onChange={(event) => updateHonorarioConfig(atividade.id, faixa.id, event.target.value)}
                                                            className="w-28 rounded-md border border-gray-200 bg-white px-2 py-2 text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:ring-slate-500/20"
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Percentual por atividade</h3>
                                <div className="grid gap-3">
                                    {[
                                        { chave: 1, label: '1 atividade (%)' },
                                        { chave: 'multiplas', label: '2 ou 3 atividades (%)' },
                                    ].map((item) => (
                                        <label key={item.chave} className="block">
                                            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                {item.label}
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={configuracao.percentuaisAtividade[item.chave]}
                                                onChange={(event) => updatePercentualConfig(item.chave, event.target.value)}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Folha de pagamento</h3>
                                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Valores fixos aplicados conforme a quantidade de funcionarios.</p>
                                <div className="grid gap-3">
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Ate 3 (valor fixo)</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={configuracao.folha.ate3}
                                            onChange={(event) => updateFolhaConfig('ate3', event.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">De 4 a 14 (valor fixo)</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={configuracao.folha.quatroA14}
                                            onChange={(event) => updateFolhaConfig('quatroA14', event.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                </div>
                            </div>

                        </div>
                    </div>
                </section>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="space-y-6">
                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-3 flex items-center gap-2">
                            <BuildingOffice2Icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                            <label htmlFor="empresa-proposta" className={labelClass}>Empresa da proposta</label>
                        </div>
                        <select
                            id="empresa-proposta"
                            value={empresaId}
                            onChange={(event) => {
                                setEmpresaId(event.target.value);
                                setMensagemProposta(null);
                            }}
                            disabled={carregandoEmpresas}
                            className={inputClass}
                        >
                            <option value="">{carregandoEmpresas ? 'Carregando empresas...' : 'Selecione uma empresa'}</option>
                            {empresas.map((empresa) => (
                                <option key={empresa.id} value={empresa.id}>
                                    {empresa.nome} - {empresa.cnpj}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Os dados cadastrais desta empresa serao inseridos automaticamente no PDF.
                        </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <label className={labelClass}>Atividades</label>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Selecione uma ou mais. A atividade de maior valor prevalece como honorario base.
                                </p>
                            </div>
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                {atividadesSelecionadas.length} de 3 selecionada{atividadesSelecionadas.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                            {atividades.map((item) => {
                                const Icon = item.icon;
                                const active = atividadesSelecionadas.includes(item.id);
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => toggleAtividade(item.id)}
                                        className={`flex min-h-24 items-center gap-3 rounded-lg border p-4 text-left transition ${active
                                            ? 'border-slate-900 bg-slate-50 text-slate-950 shadow-sm dark:border-slate-100 dark:bg-slate-800 dark:text-slate-100'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-slate-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-slate-600'
                                            }`}
                                    >
                                        <Icon className="h-7 w-7 flex-shrink-0" />
                                        <span className="font-semibold">{item.label}</span>
                                        <span className={`ml-auto flex h-5 w-5 items-center justify-center rounded border ${active
                                            ? 'border-slate-900 bg-slate-900 dark:border-slate-100 dark:bg-slate-100'
                                            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                                            }`}>
                                            {active && <span className="h-2.5 w-2.5 rounded-sm bg-white dark:bg-slate-900" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <label htmlFor="faturamento" className={labelClass}>Faixa de faturamento</label>
                        <select
                            id="faturamento"
                            value={faturamento}
                            onChange={(event) => setFaturamento(event.target.value)}
                            className={inputClass}
                        >
                            {faixasFaturamento.map((item) => (
                                <option key={item.id} value={item.id}>{item.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                            <div className="mb-3 flex items-center gap-2">
                                <UsersIcon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                                <label htmlFor="funcionarios" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Folha de pagamento
                                </label>
                            </div>
                            <input
                                id="funcionarios"
                                type="number"
                                min="0"
                                value={funcionarios}
                                onChange={(event) => setFuncionarios(event.target.value)}
                                className={inputClass}
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                Ate 3: valor fixo de {formatCurrency(configuracao.folha.ate3)}. De 4 a 14: valor fixo de {formatCurrency(configuracao.folha.quatroA14)}.
                            </p>
                            {clampNumber(funcionarios) >= 15 && (
                                <label className="mt-4 block">
                                    <span className="mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                        Valor por funcionario para 15 ou mais
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={valorPorFuncionario}
                                        onChange={(event) => setValorPorFuncionario(event.target.value)}
                                        placeholder="Informe o valor unitario"
                                        className={inputClass}
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-white">Tabela de valores</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-left text-gray-700 dark:bg-slate-900 dark:text-gray-200">
                                        <th className="border border-gray-200 px-3 py-2 dark:border-gray-800">Atividade</th>
                                        {faixasFaturamento.map((item) => (
                                            <th key={item.id} className="border border-gray-200 px-3 py-2 dark:border-gray-800">{item.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {atividades.map((item) => (
                                        <tr key={item.id}>
                                            <td className="border border-gray-200 px-3 py-2 font-semibold dark:border-gray-800">{item.label}</td>
                                            {faixasFaturamento.map((faixa) => {
                                                const valor = item.honorarios[faixa.id];
                                                return (
                                                    <td key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-800">
                                                        {valor === null ? 'Planejamento tributario' : formatCurrency(valor)}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <aside className="h-fit rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900 xl:sticky xl:top-6">
                    <div className="mb-5 flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950">
                            <BanknotesIcon className="h-6 w-6" />
                        </span>
                        <div>
                            <h2 className="text-xl font-bold text-gray-950 dark:text-white">Resultado</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Memoria do calculo</p>
                        </div>
                    </div>

                    {calculo.exigePlanejamento ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                            Para faturamento de 301 mil ou mais, o calculo depende de planejamento tributario.
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Atividades escolhidas</span>
                                    <strong className="text-right">
                                        {calculo.atividadesSelecionadas.map((item) => item.label).join(', ')}
                                    </strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Atividade base</span>
                                    <strong>{calculo.atividadeBase?.label || '-'}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Honorario base</span>
                                    <strong>{formatCurrency(calculo.honorarioBase)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Aumento por quantidade de atividades ({Math.round(calculo.percentualTipoAtividade * 100)}% de {formatCurrency(calculo.baseAumentoAtividades)})
                                    </span>
                                    <strong>{formatCurrency(calculo.adicionalTipoAtividade)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Honorario com atividades</span>
                                    <strong>{formatCurrency(calculo.honorarioComAtividades)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        {calculo.folha.tipo === 'unitario'
                                            ? `Folha (${calculo.folha.quantidadeCobrada} x ${formatCurrency(calculo.folha.valorUnitario)})`
                                            : `Folha (${calculo.folha.faixa} - valor fixo)`}
                                    </span>
                                    <strong>{formatCurrency(calculo.folha.total)}</strong>
                                </div>
                            </div>

                            <div className="mt-6 rounded-lg bg-slate-950 p-5 text-white dark:bg-slate-800">
                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                    <CurrencyDollarIcon className="h-5 w-5" />
                                    Valor sugerido
                                </div>
                                <div className="mt-2 text-4xl font-extrabold">{formatCurrency(calculo.total)}</div>
                            </div>

                            {mensagemProposta && (
                                <div className={`mt-4 rounded-md border px-4 py-3 text-sm ${mensagemProposta.tipo === 'sucesso'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200'
                                    : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200'
                                    }`}
                                >
                                    {mensagemProposta.texto}
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={abrirGeracaoProposta}
                                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                            >
                                <DocumentArrowDownIcon className="h-5 w-5" />
                                Gerar proposta
                            </button>
                        </>
                    )}
                </aside>
            </div>

            {modalProposta && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-modal-proposta">
                    <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 id="titulo-modal-proposta" className="text-xl font-bold text-gray-950 dark:text-white">
                                    {modalProposta === 'pergunta' ? 'A proposta tem desconto?' : 'Configurar desconto'}
                                </h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    {modalProposta === 'pergunta'
                                        ? 'Escolha a versao do PDF que deseja gerar.'
                                        : 'Informe como o desconto sera aplicado ao valor total.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setModalProposta(null)}
                                disabled={gerandoProposta}
                                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                aria-label="Fechar"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {mensagemProposta?.tipo === 'erro' && modalProposta === 'pergunta' && (
                            <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
                                {mensagemProposta.texto}
                            </p>
                        )}

                        {modalProposta === 'pergunta' ? (
                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => gerarProposta('nenhum')}
                                    disabled={gerandoProposta}
                                    className="rounded-md border border-gray-300 px-4 py-3 text-sm font-bold text-gray-800 transition hover:bg-gray-100 disabled:opacity-60 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
                                >
                                    {gerandoProposta ? 'Gerando...' : 'Nao, gerar agora'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setModalProposta('desconto')}
                                    disabled={gerandoProposta}
                                    className="rounded-md bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950"
                                >
                                    Sim, informar desconto
                                </button>
                            </div>
                        ) : (
                            <div className="mt-6 space-y-4">
                                <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
                                    <button
                                        type="button"
                                        onClick={() => setDescontoTipo('percentual')}
                                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${descontoTipo === 'percentual'
                                            ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                                            : 'text-gray-600 dark:text-gray-300'
                                            }`}
                                    >
                                        Porcentagem
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDescontoTipo('valor')}
                                        className={`rounded-md px-3 py-2 text-sm font-semibold transition ${descontoTipo === 'valor'
                                            ? 'bg-white text-gray-950 shadow-sm dark:bg-gray-700 dark:text-white'
                                            : 'text-gray-600 dark:text-gray-300'
                                            }`}
                                    >
                                        Valor fixo
                                    </button>
                                </div>

                                <label className="block">
                                    <span className={labelClass}>
                                        {descontoTipo === 'percentual' ? 'Percentual de desconto (%)' : 'Valor do desconto (R$)'}
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        max={descontoTipo === 'percentual' ? '100' : undefined}
                                        step="0.01"
                                        autoFocus
                                        value={descontoValor}
                                        onChange={(event) => setDescontoValor(event.target.value)}
                                        className={inputClass}
                                    />
                                </label>

                                {mensagemProposta?.tipo === 'erro' && (
                                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-200">
                                        {mensagemProposta.texto}
                                    </p>
                                )}

                                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                    <button
                                        type="button"
                                        onClick={() => setModalProposta('pergunta')}
                                        disabled={gerandoProposta}
                                        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-100"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => gerarProposta(descontoTipo)}
                                        disabled={gerandoProposta}
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                    >
                                        <DocumentArrowDownIcon className="h-5 w-5" />
                                        {gerandoProposta ? 'Gerando...' : 'Gerar PDF com desconto'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CalculadoraHonorariosPage;
