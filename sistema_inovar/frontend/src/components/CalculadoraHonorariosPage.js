import React, { useMemo, useState } from 'react';
import {
    BanknotesIcon,
    BriefcaseIcon,
    BuildingStorefrontIcon,
    CalculatorIcon,
    ChartBarSquareIcon,
    CurrencyDollarIcon,
    InformationCircleIcon,
    UserGroupIcon,
    UsersIcon,
} from '@heroicons/react/24/outline';

const atividades = [
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

const adicionaisTipoAtividade = {
    1: 0,
    2: 0.2,
    3: 0.45,
};

const formatCurrency = (value) => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
});

const clampNumber = (value, min = 0, max = 999) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.min(max, Math.max(min, parsed));
};

const getAdicionalFolha = (funcionarios) => {
    if (funcionarios <= 2) {
        return { faixa: 'Ate 2', valorUnitario: 0, total: 0 };
    }

    if (funcionarios <= 9) {
        return {
            faixa: '3 a 9',
            valorUnitario: 42.4,
            total: funcionarios * 42.4,
        };
    }

    return {
        faixa: '10+',
        valorUnitario: 24.6,
        total: funcionarios * 24.6,
    };
};

const CalculadoraHonorariosPage = () => {
    const [atividadesSelecionadas, setAtividadesSelecionadas] = useState(['servico']);
    const [faturamento, setFaturamento] = useState('ate50');
    const [funcionarios, setFuncionarios] = useState(0);
    const [socios, setSocios] = useState(1);

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
        const folha = getAdicionalFolha(qtdFuncionarios);
        const percentualTipoAtividade = adicionaisTipoAtividade[qtdTiposAtividade] ?? 0.45;
        const adicionalSocios = qtdSocios >= 3 ? 50 : 0;

        if (exigePlanejamento) {
            return {
                atividadesSelecionadas: selecionadas,
                atividadeBase,
                exigePlanejamento,
                honorarioBase,
                folha,
                percentualTipoAtividade,
                adicionalTipoAtividade: 0,
                adicionalSocios,
                subtotal: 0,
                total: 0,
            };
        }

        const subtotal = honorarioBase + folha.total;
        const adicionalTipoAtividade = subtotal * percentualTipoAtividade;
        const total = subtotal + adicionalTipoAtividade + adicionalSocios;

        return {
            atividadesSelecionadas: selecionadas,
            atividadeBase,
            exigePlanejamento,
            honorarioBase,
            folha,
            percentualTipoAtividade,
            adicionalTipoAtividade,
            adicionalSocios,
            subtotal,
            total,
        };
    }, [atividadesSelecionadas, faturamento, funcionarios, socios]);

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

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100">
                    <div className="flex items-start gap-2">
                        <InformationCircleIcon className="mt-0.5 h-5 w-5 flex-shrink-0" />
                        <span>Faturamento acima de 301 mil exige planejamento tributario.</span>
                    </div>
                </div>
            </div>

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
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Quantidade de funcionarios.</p>
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
                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">3 ou mais acrescenta R$ 50,00.</p>
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
                                        Folha ({calculo.folha.faixa} x {formatCurrency(calculo.folha.valorUnitario)})
                                    </span>
                                    <strong>{formatCurrency(calculo.folha.total)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
                                    <strong>{formatCurrency(calculo.subtotal)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Aumento por quantidade de atividades ({Math.round(calculo.percentualTipoAtividade * 100)}%)
                                    </span>
                                    <strong>{formatCurrency(calculo.adicionalTipoAtividade)}</strong>
                                </div>
                                <div className="flex justify-between gap-4 border-b border-gray-200 pb-3 dark:border-gray-700">
                                    <span className="text-gray-500 dark:text-gray-400">Aumento por socios</span>
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
