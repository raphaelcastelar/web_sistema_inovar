import React, { useMemo, useState } from 'react';
import {
    BanknotesIcon,
    BriefcaseIcon,
    BuildingStorefrontIcon,
    CalculatorIcon,
    ChartBarSquareIcon,
    Cog6ToothIcon,
    CurrencyDollarIcon,
    InformationCircleIcon,
    ArrowPathIcon,
    UserGroupIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';

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
        2: 20,
        3: 45,
    },
    folha: {
        ate2: 0,
        tresMais: 42.4,
    },
    socios: {
        tresMais: 50,
    },
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

const getAdicionalFolha = (funcionarios, folhaConfig) => {
    if (funcionarios <= 2) {
        const valorUnitario = parseConfigNumber(folhaConfig.ate2);
        return { faixa: 'Ate 2', valorUnitario, quantidadeCobrada: 0, total: 0 };
    }

    const valorUnitario = parseConfigNumber(folhaConfig.tresMais);
    return {
        faixa: '3 ou mais',
        valorUnitario,
        quantidadeCobrada: 1,
        total: valorUnitario,
    };
};

const getAdicionalSocios = (socios, sociosConfig) => {
    const quantidadeCobrada = Math.max(0, socios - 2);
    const valorUnitario = parseConfigNumber(sociosConfig.tresMais);

    return {
        quantidadeCobrada,
        valorUnitario,
        total: quantidadeCobrada * valorUnitario,
    };
};

const CalculadoraHonorariosPage = () => {
    const [atividadesSelecionadas, setAtividadesSelecionadas] = useState(['servico']);
    const [faturamento, setFaturamento] = useState('ate50');
    const [funcionarios, setFuncionarios] = useState(0);
    const [socios, setSocios] = useState(1);
    const [configOpen, setConfigOpen] = useState(false);
    const [configuracao, setConfiguracao] = useState(configuracaoPadrao);

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

    const updateSociosConfig = (campo, value) => {
        setConfiguracao((configAtual) => ({
            ...configAtual,
            socios: {
                ...configAtual.socios,
                [campo]: parseConfigNumber(value),
            },
        }));
    };

    const resetConfiguracao = () => {
        setConfiguracao({
            atividades: configuracaoPadrao.atividades.map((atividade) => ({
                id: atividade.id,
                honorarios: { ...atividade.honorarios },
            })),
            percentuaisAtividade: { ...configuracaoPadrao.percentuaisAtividade },
            folha: { ...configuracaoPadrao.folha },
            socios: { ...configuracaoPadrao.socios },
        });
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
        const qtdSocios = clampNumber(socios, 1);
        const folha = getAdicionalFolha(qtdFuncionarios, configuracao.folha);
        const percentualTipoAtividade = parseConfigNumber(configuracao.percentuaisAtividade[qtdTiposAtividade]) / 100;
        const sociosAdicional = getAdicionalSocios(qtdSocios, configuracao.socios);

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
                sociosAdicional,
                adicionalSocios: sociosAdicional.total,
                honorarioComAtividades: 0,
                total: 0,
            };
        }

        const baseAumentoAtividades = honorarioBase;
        const adicionalTipoAtividade = roundCurrency(baseAumentoAtividades * percentualTipoAtividade);
        const honorarioComAtividades = roundCurrency(honorarioBase + adicionalTipoAtividade);
        const total = roundCurrency(honorarioComAtividades + folha.total + sociosAdicional.total);

        return {
            atividadesSelecionadas: selecionadas,
            atividadeBase,
            exigePlanejamento,
            honorarioBase,
            baseAumentoAtividades,
            folha,
            percentualTipoAtividade,
            adicionalTipoAtividade,
            sociosAdicional,
            adicionalSocios: sociosAdicional.total,
            honorarioComAtividades,
            total,
        };
    }, [atividades, atividadesSelecionadas, faturamento, funcionarios, socios, configuracao.folha, configuracao.percentuaisAtividade, configuracao.socios]);

    const inputClass =
        'w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-900 shadow-sm outline-none transition ' +
        'focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

    const labelClass = 'mb-2 block text-sm font-semibold text-gray-700 dark:text-gray-200';

    return (
        <div className="mx-auto max-w-7xl space-y-6 text-gray-900 dark:text-gray-100">
            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-600 text-white">
                            <CalculatorIcon className="h-7 w-7" />
                        </span>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-950 dark:text-white">Calculadora de Honorarios</h1>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Valores base conforme a aba Calculadora de Honorarios da planilha.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button
                        type="button"
                        onClick={() => setConfigOpen((open) => !open)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                    >
                        <Cog6ToothIcon className="h-5 w-5" />
                        Configuracoes
                    </button>

                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100">
                        <div className="flex items-start gap-2">
                            <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                            <span>Faturamento acima de 301 mil exige planejamento tributario.</span>
                        </div>
                    </div>
                </div>
            </div>

            {configOpen && (
                <section className="rounded-xl border border-indigo-200 bg-white p-5 shadow-sm dark:border-indigo-800 dark:bg-gray-800">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-gray-950 dark:text-white">Configuracoes da calculadora</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                Altere os valores usados no calculo. As mudancas valem enquanto esta pagina estiver aberta.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={resetConfiguracao}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                            <ArrowPathIcon className="h-5 w-5" />
                            Restaurar planilha
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Honorarios base</h3>
                            <div className="overflow-x-auto">
                                <table className="min-w-full border-collapse text-sm">
                                    <thead>
                                        <tr className="bg-gray-100 text-left text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                            <th className="border border-gray-200 px-3 py-2 dark:border-gray-700">Atividade</th>
                                            {faixasFaturamento.filter((faixa) => faixa.id !== 'acima300').map((faixa) => (
                                                <th key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-700">{faixa.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {atividades.map((atividade) => (
                                            <tr key={atividade.id}>
                                                <td className="border border-gray-200 px-3 py-2 font-semibold dark:border-gray-700">{atividade.label}</td>
                                                {faixasFaturamento.filter((faixa) => faixa.id !== 'acima300').map((faixa) => (
                                                    <td key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-700">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            value={atividade.honorarios[faixa.id]}
                                                            onChange={(event) => updateHonorarioConfig(atividade.id, faixa.id, event.target.value)}
                                                            className="w-28 rounded-md border border-gray-300 bg-white px-2 py-2 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                                                        />
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Percentual por atividade</h3>
                                <div className="grid gap-3">
                                    {[1, 2, 3].map((quantidade) => (
                                        <label key={quantidade} className="block">
                                            <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">
                                                {quantidade} atividade{quantidade > 1 ? 's' : ''} (%)
                                            </span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={configuracao.percentuaisAtividade[quantidade]}
                                                onChange={(event) => updatePercentualConfig(quantidade, event.target.value)}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Folha de pagamento</h3>
                                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Os 2 primeiros funcionarios sao isentos.</p>
                                <div className="grid gap-3">
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">Ate 2</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={configuracao.folha.ate2}
                                            onChange={(event) => updateFolhaConfig('ate2', event.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">3 ou mais</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={configuracao.folha.tresMais}
                                            onChange={(event) => updateFolhaConfig('tresMais', event.target.value)}
                                            className={inputClass}
                                        />
                                    </label>
                                </div>
                            </div>

                            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                <h3 className="mb-3 text-base font-bold text-gray-900 dark:text-gray-100">Socios</h3>
                                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">Os 2 primeiros socios sao isentos.</p>
                                <label className="block">
                                    <span className="mb-1 block text-sm font-semibold text-gray-700 dark:text-gray-200">3 ou mais</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={configuracao.socios.tresMais}
                                        onChange={(event) => updateSociosConfig('tresMais', event.target.value)}
                                        className={inputClass}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
                <section className="space-y-6">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <label className={labelClass}>Atividades</label>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Selecione uma ou mais. A atividade de maior valor prevalece como honorario base.
                                </p>
                            </div>
                            <span className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
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
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm dark:border-indigo-400 dark:bg-indigo-950/60 dark:text-indigo-100'
                                            : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200'
                                            }`}
                                    >
                                        <Icon className="h-7 w-7 flex-shrink-0" />
                                        <span className="font-semibold">{item.label}</span>
                                        <span className={`ml-auto flex h-5 w-5 items-center justify-center rounded border ${active
                                            ? 'border-indigo-600 bg-indigo-600 dark:border-indigo-300'
                                            : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                                            }`}>
                                            {active && <span className="h-2.5 w-2.5 rounded-sm bg-white" />}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
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

                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-3 flex items-center gap-2">
                                <UsersIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
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
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Os 2 primeiros funcionarios sao isentos.</p>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                            <div className="mb-3 flex items-center gap-2">
                                <UserGroupIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-300" />
                                <label htmlFor="socios" className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                                    Socios
                                </label>
                            </div>
                            <input
                                id="socios"
                                type="number"
                                min="1"
                                value={socios}
                                onChange={(event) => setSocios(event.target.value)}
                                className={inputClass}
                            />
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Os 2 primeiros socios sao isentos.</p>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <h2 className="mb-4 text-lg font-bold text-gray-950 dark:text-white">Tabela da planilha</h2>
                        <div className="overflow-x-auto">
                            <table className="min-w-full border-collapse text-sm">
                                <thead>
                                    <tr className="bg-gray-100 text-left text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                        <th className="border border-gray-200 px-3 py-2 dark:border-gray-700">Atividade</th>
                                        {faixasFaturamento.map((item) => (
                                            <th key={item.id} className="border border-gray-200 px-3 py-2 dark:border-gray-700">{item.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {atividades.map((item) => (
                                        <tr key={item.id}>
                                            <td className="border border-gray-200 px-3 py-2 font-semibold dark:border-gray-700">{item.label}</td>
                                            {faixasFaturamento.map((faixa) => {
                                                const valor = item.honorarios[faixa.id];
                                                return (
                                                    <td key={faixa.id} className="border border-gray-200 px-3 py-2 dark:border-gray-700">
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

                <aside className="h-fit rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:sticky xl:top-6">
                    <div className="mb-5 flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-600 text-white">
                            <BanknotesIcon className="h-6 w-6" />
                        </span>
                        <div>
                            <h2 className="text-xl font-bold text-gray-950 dark:text-white">Resultado</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Memoria do calculo</p>
                        </div>
                    </div>

                    {calculo.exigePlanejamento ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                            Para faturamento de 301 mil ou mais, a planilha indica calculo somente apos planejamento tributario.
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
                                        Folha ({calculo.folha.faixa})
                                    </span>
                                    <strong>{formatCurrency(calculo.folha.total)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Aumento por socios ({calculo.sociosAdicional.quantidadeCobrada} x {formatCurrency(calculo.sociosAdicional.valorUnitario)})
                                    </span>
                                    <strong>{formatCurrency(calculo.adicionalSocios)}</strong>
                                </div>
                            </div>

                            <div className="mt-6 rounded-lg bg-gray-950 p-5 text-white dark:bg-indigo-950">
                                <div className="flex items-center gap-2 text-sm text-gray-300">
                                    <CurrencyDollarIcon className="h-5 w-5" />
                                    Valor sugerido
                                </div>
                                <div className="mt-2 text-4xl font-extrabold">{formatCurrency(calculo.total)}</div>
                            </div>
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
};

export default CalculadoraHonorariosPage;
