import { useState, useEffect, useMemo, useCallback } from 'react';
import axiosInstance from '../api/axiosInstance';
import { Link } from 'react-router-dom';
import {
    CheckCircleIcon,
    XCircleIcon,
    PlusIcon,
    BuildingOffice2Icon,
    MagnifyingGlassIcon,
    ExclamationCircleIcon,
    CogIcon,
    DocumentArrowDownIcon,
    ArrowPathIcon,
    EyeIcon,
    PaperAirplaneIcon,
    TagIcon
} from '@heroicons/react/24/outline';

const DEFAULT_CARTEIRA_OPTIONS = ['INOVAR ES', 'INOVAR MG', 'NOVVA'];

function MetricCard({ label, value, icon: Icon, tone = 'neutral' }) {
    const toneClasses = {
        neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
        success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    }[tone];

    return (
        <div className="min-w-0 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">{label}</p>
                    <p className="mt-3 break-words text-2xl font-bold tabular-nums text-gray-950 dark:text-gray-100">{value}</p>
                </div>
                <div className={`shrink-0 rounded-md p-2.5 ${toneClasses}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </div>
    );
}

const GerenciamentoIntegrado = () => {
    // --- State ---
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [search, setSearch] = useState('');
    const [isAdmin, setIsAdmin] = useState(null);
    const [boletoModalOpen, setBoletoModalOpen] = useState(false);
    const [boletoBatchSearch, setBoletoBatchSearch] = useState('');
    const [tags, setTags] = useState([]);
    const [boletoSelectedTagIds, setBoletoSelectedTagIds] = useState([]);
    const [selectedCarteira, setSelectedCarteira] = useState('INOVAR ES');
    const [selectedEmpresaIds, setSelectedEmpresaIds] = useState([]);
    const [isGeneratingBoletos, setIsGeneratingBoletos] = useState(false);
    const [isDownloadingBoletos, setIsDownloadingBoletos] = useState(false);
    const [generatingBoletoId, setGeneratingBoletoId] = useState(null);
    const [boletoActionModal, setBoletoActionModal] = useState(null); // { id, nome }
    const [boletoActionLoading, setBoletoActionLoading] = useState(false);
    const [boletoActionResult, setBoletoActionResult] = useState(null); // {type,text}
    const [batchSummary, setBatchSummary] = useState(null);
    const [resultsModalOpen, setResultsModalOpen] = useState(false);
    const [updatingHonorarioIds, setUpdatingHonorarioIds] = useState([]);
    const [retryingEmpresaIds, setRetryingEmpresaIds] = useState([]);
    const [lastSessionUpdatedAt, setLastSessionUpdatedAt] = useState(null);

    // --- Modal Config State ---
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [currentConfig, setCurrentConfig] = useState({
        id: null,
        valor_honorario: '',
        dia_vencimento_honorario: '',
        juros_mora_taxa: '',
        multa_taxa: '',
        desconto_taxa: '',
        dias_para_desconto: ''
    });

    // --- Fetch Data ---
    useEffect(() => {
        const fetchUser = async () => {
            try {
                const response = await axiosInstance.get('/api/current-user/');
                setIsAdmin(response.data.is_staff || response.data.is_superuser);
            } catch (err) {
                console.error('Erro ao verificar permissões:', err.response?.data || err.message);
                setIsAdmin(false);
            }
        };

        const fetchEmpresas = async () => {
            try {
                const response = await axiosInstance.get('/api/empresas/?all=true');
                setEmpresas(response.data);
            } catch (err) {
                console.error('Erro ao carregar empresas:', err.response?.data || err.message);
                setError('Erro ao carregar empresas para gerenciamento.');
            } finally {
                setLoading(false);
            }
        };

        const fetchLastSessionResult = async () => {
            try {
                const response = await axiosInstance.get('/api/ultimo-resultado-sessao/');
                setBatchSummary(response.data?.batch_summary || null);
                setLastSessionUpdatedAt(response.data?.atualizado_em || null);
            } catch (err) {
                console.error('Erro ao carregar o ultimo resultado salvo:', err.response?.data || err.message);
            }
        };

        const fetchTags = async () => {
            try {
                const response = await axiosInstance.get('/api/tags/');
                setTags(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                console.error('Erro ao carregar tags:', err.response?.data || err.message);
            }
        };

        fetchUser();
        fetchEmpresas();
        fetchTags();
        fetchLastSessionResult();
    }, []);

    // --- Handlers ---
    const persistBatchSummary = async (nextSummary) => {
        try {
            const response = await axiosInstance.post('/api/ultimo-resultado-sessao/', {
                batch_summary: nextSummary,
            });
            setLastSessionUpdatedAt(response.data?.atualizado_em || null);
        } catch (err) {
            console.error('Erro ao salvar o ultimo resultado da sessao:', err.response?.data || err.message);
        }
    };

    const updateEmpresaInState = (empresaId, updates) => {
        setEmpresas((currentEmpresas) => currentEmpresas.map((empresa) => (
            empresa.id === empresaId ? { ...empresa, ...updates } : empresa
        )));
    };

    const updateHonorarioStatus = async (empresaId, nextValue, shouldSetFeedback = true) => {
        setUpdatingHonorarioIds((currentIds) => Array.from(new Set([...currentIds, empresaId])));

        try {
            await axiosInstance.patch(`/api/empresas/${empresaId}/`, { honorario: nextValue });
            updateEmpresaInState(empresaId, { honorario: nextValue });

            if (shouldSetFeedback) {
                setError('');
                setSuccess(`Status de honorario atualizado com sucesso.`);
                setTimeout(() => setSuccess(''), 3000);
            }

            return true;
        } catch (err) {
            console.error('Erro ao atualizar honorario:', err.response?.data || err.message);

            if (shouldSetFeedback) {
                setError('Falha ao atualizar o status de honorario.');
            }

            return false;
        } finally {
            setUpdatingHonorarioIds((currentIds) => currentIds.filter((id) => id !== empresaId));
        }
    };

    const processarBoletoEmpresa = async (empresaId) => {
        const empresa = empresas.find((item) => item.id === empresaId);

        try {
            const response = await axiosInstance.post('/api/gerar-boleto/', { empresa_id: empresaId });
            let message = response?.data?.message || 'Boleto processado com sucesso.';

            if (!empresa?.honorario) {
                const honorarioAtualizado = await updateHonorarioStatus(empresaId, true, false);

                if (!honorarioAtualizado) {
                    message = `${message} O status de honorario nao foi marcado automaticamente.`;
                }
            }

            return {
                empresaId,
                empresa: empresa?.nome || `Empresa ${empresaId}`,
                status: 'success',
                message,
            };
        } catch (err) {
            console.error('Erro ao gerar boleto em lote:', err);

            return {
                empresaId,
                empresa: empresa?.nome || `Empresa ${empresaId}`,
                status: 'error',
                message: err?.response?.data?.error || err?.response?.data?.message || 'Falha ao gerar o boleto.'
            };
        }
    };

    const handleToggleAtivo = async (id, ativo) => {
        if (!isAdmin) {
            setError('Você não tem permissão para alterar o status das empresas.');
            return;
        }
        try {
            await axiosInstance.patch(`/api/empresas/${id}/`, { ativo: !ativo });
            updateEmpresaInState(id, { ativo: !ativo });
            setSuccess(`Status da empresa atualizado com sucesso!`);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Erro ao atualizar status:', err.response?.data || err.message);
            setError('Falha ao atualizar o status da empresa.');
        }
    };

    const handleAbrirModalBoleto = (empresa) => {
        setBoletoActionModal({ id: empresa.id, nome: empresa.nome });
        setError('');
        setSuccess('');
        setBoletoActionResult(null);
    };

    const handleBoletoAction = async (action) => {
        if (!boletoActionModal) return;
        const empresaId = boletoActionModal.id;
        setGeneratingBoletoId(empresaId);
        setBoletoActionLoading(true);
        setError('');
        setSuccess('');
        setBoletoActionResult(null);

        try {
            const response = await axiosInstance.post('/api/gerar-boleto/', {
                empresa_id: empresaId,
                action,
            });

            if (action === 'baixar') {
                const downloadUrl = response.data?.download_url;
                if (downloadUrl) {
                    const nomeEmpresa = boletoActionModal?.nome || 'empresa';
                    const normalizedName = nomeEmpresa
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '') // remove acentos
                        .replace(/[^A-Za-z0-9-]+/g, '_') // troca espaços e símbolos por _
                        .replace(/_+/g, '_') // compacta múltiplos _
                        .replace(/^_+|_+$/g, ''); // remove _ no início/fim
                    const safeName = normalizedName || 'EMPRESA';
                    const fileName = `HONORARIO-${safeName.toUpperCase()}.pdf`;

                    const fileResponse = await axiosInstance.get(downloadUrl, { responseType: 'blob' });
                    const blobUrl = window.URL.createObjectURL(new Blob([fileResponse.data]));
                    const link = document.createElement('a');
                    link.href = blobUrl;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(blobUrl);
                }
                setSuccess('Boleto baixado.');
                setBoletoActionResult({ type: 'success', text: 'Download liberado.' });
            } else {
                const msg = response.data?.message || 'Boleto gerado/enviado com sucesso.';
                setSuccess(msg);
                setBoletoActionResult({ type: 'success', text: 'Envio concluído.' });
                await updateHonorarioStatus(empresaId, true, false);
            }
            setTimeout(() => setSuccess(''), 4000);
        } catch (err) {
            setError(err.response?.data?.error || err.message || 'Falha ao processar boleto.');
            setBoletoActionResult({ type: 'error', text: 'Falha ao processar.' });
        } finally {
            setGeneratingBoletoId(null);
            setBoletoActionLoading(false);
            // Mantém modal aberto para o usuário ver o status; fecha após curto intervalo
            setTimeout(() => {
                setBoletoActionModal(null);
                setBoletoActionResult(null);
            }, 1200);
        }
    };

    const handleToggleHonorario = async (empresaId, honorarioAtual) => {
        if (updatingHonorarioIds.includes(empresaId)) {
            return;
        }

        setError('');
        await updateHonorarioStatus(empresaId, !honorarioAtual);
    };

    const handleOpenBoletoModal = () => {
        setError('');
        setSuccess('');
        setBoletoBatchSearch('');
        setBoletoSelectedTagIds([]);
        setSelectedEmpresaIds([]);
        setBoletoModalOpen(true);
    };

    const handleToggleBoletoTagFilter = (tagId) => {
        setBoletoSelectedTagIds((currentIds) => (
            currentIds.includes(tagId)
                ? currentIds.filter((id) => id !== tagId)
                : [...currentIds, tagId]
        ));
    };

    const handleToggleEmpresaSelection = (empresaId) => {
        setSelectedEmpresaIds((currentIds) => (
            currentIds.includes(empresaId)
                ? currentIds.filter((id) => id !== empresaId)
                : [...currentIds, empresaId]
        ));
    };

    const handleToggleAllModalEmpresas = () => {
        const modalEmpresaIds = filteredActiveEmpresasForModal.map((empresa) => empresa.id);
        const allSelected = modalEmpresaIds.length > 0 && modalEmpresaIds.every((id) => selectedEmpresaIds.includes(id));

        if (allSelected) {
            setSelectedEmpresaIds((currentIds) => currentIds.filter((id) => !modalEmpresaIds.includes(id)));
            return;
        }

        setSelectedEmpresaIds((currentIds) => Array.from(new Set([...currentIds, ...modalEmpresaIds])));
    };

    const handleGerarBoletosEmLote = async () => {
        if (selectedEmpresaIds.length === 0) {
            setError('Selecione pelo menos uma empresa ativa para gerar os boletos.');
            return;
        }

        setIsGeneratingBoletos(true);
        setError('');
        setSuccess('');
        setBatchSummary(null);

        const results = [];

        for (const empresaId of selectedEmpresaIds) {
            results.push(await processarBoletoEmpresa(empresaId));
        }

        const successResults = results.filter((result) => result.status === 'success');
        const errorResults = results.filter((result) => result.status === 'error');

        const nextBatchSummary = {
            total: results.length,
            successCount: successResults.length,
            errorCount: errorResults.length,
            successResults,
            errorResults,
        };

        setBatchSummary(nextBatchSummary);
        await persistBatchSummary(nextBatchSummary);

        if (successResults.length > 0) {
            setSuccess(`Remessa concluida: ${successResults.length} empresa(s) processada(s) com sucesso.`);
            setTimeout(() => setSuccess(''), 5000);
        }

        if (errorResults.length > 0) {
            setError(`${errorResults.length} empresa(s) precisam de ajuste antes do envio.`);
            setResultsModalOpen(true);
        } else {
            setSelectedEmpresaIds([]);
            setResultsModalOpen(false);
        }

        if (errorResults.length > 0) {
            setSelectedEmpresaIds(errorResults.map((result) => result.empresaId));
        }

        setBoletoModalOpen(false);
        setIsGeneratingBoletos(false);
    };

    const handleBaixarBoletosPdfUnico = async () => {
        if (selectedEmpresaIds.length === 0) {
            setError('Selecione pelo menos uma empresa ativa para baixar os boletos.');
            return;
        }

        setIsDownloadingBoletos(true);
        setError('');
        setSuccess('');

        try {
            const response = await axiosInstance.post(
                '/api/gerar-boletos-pdf-unico/',
                { empresa_ids: selectedEmpresaIds },
                { responseType: 'blob' }
            );

            const contentDisposition = response.headers?.['content-disposition'] || '';
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
            const fileName = filenameMatch?.[1] || 'boletos_honorarios.pdf';
            const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);

            const rawSummary = response.headers?.['x-boleto-batch-summary'];
            let summary = null;
            if (rawSummary) {
                try {
                    summary = JSON.parse(decodeURIComponent(rawSummary));
                } catch (e) {
                    summary = null;
                }
            }

            if (summary?.error_count > 0) {
                setSuccess(`PDF baixado com ${summary.total_pdf} boleto(s). ${summary.error_count} empresa(s) nao foram incluidas.`);
            } else {
                setSuccess(`PDF baixado com ${summary?.total_pdf || selectedEmpresaIds.length} boleto(s).`);
                setSelectedEmpresaIds([]);
            }
            setTimeout(() => setSuccess(''), 5000);
        } catch (err) {
            let message = 'Falha ao gerar e baixar o PDF unico.';
            const data = err?.response?.data;
            if (data instanceof Blob) {
                try {
                    const text = await data.text();
                    const parsed = JSON.parse(text);
                    message = parsed.error || parsed.message || message;
                } catch (e) {
                    message = 'Falha ao gerar e baixar o PDF unico.';
                }
            } else {
                message = err?.response?.data?.error || err?.response?.data?.message || err.message || message;
            }
            setError(message);
        } finally {
            setIsDownloadingBoletos(false);
        }
    };

    const handleRetryEmpresa = async (empresaId) => {
        setRetryingEmpresaIds((currentIds) => Array.from(new Set([...currentIds, empresaId])));
        setError('');

        try {
            const retryResult = await processarBoletoEmpresa(empresaId);
            let nextBatchSummary = null;

            setBatchSummary((currentSummary) => {
                if (!currentSummary) {
                    return currentSummary;
                }

                const successResults = currentSummary.successResults.filter((result) => result.empresaId !== empresaId);
                const errorResults = currentSummary.errorResults.filter((result) => result.empresaId !== empresaId);

                if (retryResult.status === 'success') {
                    successResults.push(retryResult);
                } else {
                    errorResults.push(retryResult);
                }

                nextBatchSummary = {
                    ...currentSummary,
                    successCount: successResults.length,
                    errorCount: errorResults.length,
                    successResults,
                    errorResults,
                };

                return nextBatchSummary;
            });

            if (nextBatchSummary) {
                await persistBatchSummary(nextBatchSummary);
            }

            if (retryResult.status === 'success') {
                setSelectedEmpresaIds((currentIds) => currentIds.filter((id) => id !== empresaId));
                setSuccess(`${retryResult.empresa}: boleto gerado e enviado com sucesso.`);
                setTimeout(() => setSuccess(''), 4000);
            } else {
                setSelectedEmpresaIds((currentIds) => Array.from(new Set([...currentIds, empresaId])));
                setError(`${retryResult.empresa}: ainda existem ajustes pendentes para o envio.`);
            }
        } finally {
            setRetryingEmpresaIds((currentIds) => currentIds.filter((id) => id !== empresaId));
        }
    };

    const handleConfiguracoes = (id) => {
        const empresa = empresas.find(e => e.id === id);
        if (empresa) {
            setCurrentConfig({
                id: empresa.id,
                valor_honorario: empresa.valor_honorario || '',
                dia_vencimento_honorario: empresa.dia_vencimento_honorario || '',
                juros_mora_taxa: empresa.juros_mora_taxa || '',
                multa_taxa: empresa.multa_taxa || '',
                desconto_taxa: empresa.desconto_taxa || '',
                dias_para_desconto: empresa.dias_para_desconto || ''
            });
            setConfigModalOpen(true);
        }
    };

    const handleSaveConfig = async () => {
        try {
            const { id, ...data } = currentConfig;

            // Sanitização
            const sanitizedData = {
                ...data,
                valor_honorario: data.valor_honorario === '' ? '0.00' : data.valor_honorario,
                dia_vencimento_honorario: data.dia_vencimento_honorario === '' ? 15 : data.dia_vencimento_honorario,
                juros_mora_taxa: data.juros_mora_taxa === '' ? '0.00' : data.juros_mora_taxa,
                multa_taxa: data.multa_taxa === '' ? '0.00' : data.multa_taxa,
                desconto_taxa: data.desconto_taxa === '' ? '0.00' : data.desconto_taxa,
                dias_para_desconto: data.dias_para_desconto === '' ? 0 : data.dias_para_desconto
            };

            await axiosInstance.patch(`/api/empresas/${id}/`, sanitizedData);

            setEmpresas(empresas.map(empresa =>
                empresa.id === id ? { ...empresa, ...sanitizedData } : empresa
            ));

            setSuccess('Configurações atualizadas com sucesso!');
            setConfigModalOpen(false);
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            console.error('Erro ao salvar configurações:', err.response?.data || err.message);
            setError('Falha ao salvar as configurações.');
        }
    };

    // --- Filtering ---
    const carteiraOptions = useMemo(() => {
        const options = new Set(DEFAULT_CARTEIRA_OPTIONS);
        empresas.forEach((empresa) => {
            if (empresa.carteira_clientes) {
                options.add(empresa.carteira_clientes);
            }
        });
        return Array.from(options);
    }, [empresas]);

    const matchesSelectedCarteira = useCallback((empresa) => {
        if (!selectedCarteira) return true;
        return empresa.carteira_clientes === selectedCarteira;
    }, [selectedCarteira]);

    const filteredEmpresas = useMemo(() => {
        return empresas.filter(empresa => {
            if (!empresa.ativo) return false;
            if (!matchesSelectedCarteira(empresa)) return false;

            // Search Filter
            const lowercasedSearch = search.toLowerCase().trim();
            if (!lowercasedSearch) return true;

            const searchDigits = search.replace(/\D/g, '');
            const matchNome = empresa.nome?.toLowerCase().includes(lowercasedSearch);
            const matchEmail = empresa.email?.toLowerCase().includes(lowercasedSearch);
            let matchCnpj = false;
            if (searchDigits.length > 0) {
                const cleanedEmpresaCnpj = empresa.cnpj?.replace(/\D/g, '');
                matchCnpj = cleanedEmpresaCnpj?.includes(searchDigits);
            }
            return matchNome || matchEmail || matchCnpj;
        });
    }, [empresas, search, matchesSelectedCarteira]);

    const activeEmpresas = useMemo(() => {
        return empresas
            .filter((empresa) => empresa.ativo && matchesSelectedCarteira(empresa))
            .sort((firstEmpresa, secondEmpresa) => firstEmpresa.nome.localeCompare(secondEmpresa.nome, 'pt-BR'));
    }, [empresas, matchesSelectedCarteira]);

    const filteredActiveEmpresasForModal = useMemo(() => {
        const normalizedSearch = boletoBatchSearch.toLowerCase().trim();
        const selectedTagNameById = tags.reduce((acc, tag) => {
            acc[String(tag.id)] = tag.nome?.toLowerCase().trim();
            return acc;
        }, {});

        const searchDigits = boletoBatchSearch.replace(/\D/g, '');

        return activeEmpresas.filter((empresa) => {
            const matchTags = boletoSelectedTagIds.length === 0 || boletoSelectedTagIds.every((tagId) => {
                const tagName = selectedTagNameById[tagId];
                if (!tagName) {
                    return (empresa.tags || []).some((tag) => String(tag.id) === tagId);
                }

                return (empresa.tags || []).some((tag) => tag.nome?.toLowerCase().trim() === tagName);
            });

            if (!matchTags) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const matchNome = empresa.nome?.toLowerCase().includes(normalizedSearch);
            const matchEmail = empresa.email?.toLowerCase().includes(normalizedSearch);
            const matchCnpj = searchDigits.length > 0
                ? empresa.cnpj?.replace(/\D/g, '').includes(searchDigits)
                : false;

            return matchNome || matchEmail || matchCnpj;
        });
    }, [activeEmpresas, boletoBatchSearch, boletoSelectedTagIds, tags]);

    useEffect(() => {
        if (!boletoModalOpen || boletoSelectedTagIds.length === 0) {
            return;
        }

        setSelectedEmpresaIds(filteredActiveEmpresasForModal.map((empresa) => empresa.id));
    }, [boletoModalOpen, boletoSelectedTagIds, filteredActiveEmpresasForModal]);

    const selectedEmpresasCount = selectedEmpresaIds.length;
    const allModalEmpresasSelected = filteredActiveEmpresasForModal.length > 0
        && filteredActiveEmpresasForModal.every((empresa) => selectedEmpresaIds.includes(empresa.id));

    // --- Stats ---
    const stats = useMemo(() => {
        const scopedEmpresas = empresas.filter((empresa) => empresa.ativo && matchesSelectedCarteira(empresa));
        const active = scopedEmpresas.length;
        const honorariosMarcados = scopedEmpresas.filter(e => e.honorario).length;
        return { active, honorariosMarcados };
    }, [empresas, matchesSelectedCarteira]);

    if (loading) {
        return (
            <div className="flex min-h-[60vh] items-center justify-center text-gray-900 dark:text-gray-100">
                <div className="animate-pulse flex flex-col items-center">
                    <div className="mb-4 h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-800"></div>
                    <div className="h-4 w-48 rounded bg-gray-200 dark:bg-gray-800"></div>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-gray-900 dark:text-gray-100">
                <ExclamationCircleIcon className="h-16 w-16 text-red-500 mb-4" />
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Acesso Negado</h2>
                <p className="mt-2 text-gray-600 dark:text-gray-400 text-center max-w-md">
                    Você não possui permissões de administrador.
                </p>
                <Link to="/" className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                    Voltar ao Início
                </Link>
            </div>
        );
    }

    return (
        <div className="w-full max-w-none space-y-5 px-0 py-2 text-gray-900 dark:text-gray-100 sm:space-y-6 sm:py-4">

                {/* Header & Stats */}
                <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#c49a61]">Operação mensal</p>
                        <h1 className="mt-2 font-serif text-3xl font-semibold text-gray-950 dark:text-white sm:text-4xl">
                            Gestão integrada
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
                            Gestão de empresas, boletos e permissões.
                        </p>
                    </div>
                    <Link
                        to="/empresas/cadastrar"
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white sm:w-auto"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Nova Empresa
                    </Link>
                </header>

                {/* Stats Cards */}
                <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 2xl:gap-4">
                    <MetricCard label="Empresas Ativas" value={stats.active} icon={BuildingOffice2Icon} />
                    <MetricCard label="Honorários Marcados" value={stats.honorariosMarcados} icon={CheckCircleIcon} tone="success" />
                </div>

                <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl space-y-2">
                            <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#c49a61]">
                                Disparo de Honorários
                            </span>
                            <h2 className="text-base font-semibold text-gray-950 dark:text-gray-100 sm:text-lg">
                                Monte uma remessa para enviar ou baixar os boletos sem sair da tela.
                            </h2>
                            <p className="max-w-xl text-sm leading-6 text-gray-600 dark:text-gray-400">
                                Abra o seletor, marque as empresas ativas e escolha entre enviar pelo WhatsApp ou baixar todos os boletos em um PDF unico.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="rounded-lg border border-gray-200 bg-slate-50 px-4 py-3 text-sm dark:border-gray-800 dark:bg-slate-900/70">
                                <div className="text-xs uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Elegíveis agora</div>
                                <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{activeEmpresas.length}</div>
                            </div>
                            <button
                                onClick={handleOpenBoletoModal}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                                disabled={activeEmpresas.length === 0}
                            >
                                <DocumentArrowDownIcon className="h-4 w-4" />
                                Selecionar Empresas
                            </button>
                        </div>
                    </div>
                </section>

                {/* Controls Area (Search & Filter) */}
                <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(13rem,18rem)]">
                        <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            <MagnifyingGlassIcon className="h-4 w-4" />
                            <input
                                type="text"
                                placeholder="Buscar por nome, CNPJ ou e-mail..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100"
                            />
                        </label>
                        <label className="flex h-10 items-center gap-2 rounded-md border border-gray-200 px-3 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                            <BuildingOffice2Icon className="h-4 w-4" />
                            <select
                                value={selectedCarteira}
                                onChange={(e) => setSelectedCarteira(e.target.value)}
                                className="min-w-0 flex-1 bg-transparent text-gray-900 outline-none dark:text-gray-100"
                            >
                                <option value="">Todas as carteiras</option>
                                {carteiraOptions.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                {/* Messages */}
                {success && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                        <div className="flex items-start gap-2">
                            <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{success}</span>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
                        <div className="flex items-start gap-2">
                            <ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    </div>
                )}

                {batchSummary && (
                    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Ultima Remessa</p>
                                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                                    Resultado consolidado em um popup para nao ocupar a area principal da tela.
                                </p>
                                {lastSessionUpdatedAt && (
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                        Salvo em {new Date(lastSessionUpdatedAt).toLocaleString('pt-BR')}
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200">
                                    Total: {batchSummary.total}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                                    Sucesso: {batchSummary.successCount}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                                    Ajuste: {batchSummary.errorCount}
                                </span>
                                <button
                                    onClick={() => setResultsModalOpen(true)}
                                    className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                                >
                                    <EyeIcon className="h-4 w-4" />
                                    Ver resultados
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* Table View */}
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
                    {filteredEmpresas.length === 0 ? (
                        <div className="text-center py-16 px-4">
                            <BuildingOffice2Icon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600 mb-3" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Nenhum resultado encontrado</h3>
                            <p className="text-gray-500 dark:text-gray-400">Tente ajustar seus filtros de busca.</p>
                        </div>
                    ) : (
                        <>
                            <div className="divide-y divide-gray-200 dark:divide-gray-700 xl:hidden">
                                {filteredEmpresas.map((empresa) => (
                                    <div key={empresa.id} className="space-y-4 px-4 py-4">
                                        <div className="flex items-start gap-3">
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                {empresa.nome.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{empresa.nome}</div>
                                                <div className="mt-0.5 text-xs font-mono text-gray-500 dark:text-gray-400">{empresa.cnpj}</div>
                                                <div className="mt-2 break-all text-sm text-gray-500 dark:text-gray-400">{empresa.email}</div>
                                            </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-3">
                                            <div>
                                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Honorario</div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleHonorario(empresa.id, empresa.honorario)}
                                                    disabled={updatingHonorarioIds.includes(empresa.id)}
                                                    className="mt-1 inline-flex items-center justify-center rounded-lg p-1 disabled:cursor-not-allowed"
                                                    title={empresa.honorario ? 'Honorario concluido' : 'Marcar honorario'}
                                                >
                                                    <CheckCircleIcon
                                                        className={`h-5 w-5 ${empresa.honorario ? 'text-green-500' : 'text-gray-300 dark:text-gray-600'} ${updatingHonorarioIds.includes(empresa.id) ? 'opacity-50' : 'cursor-pointer'}`}
                                                    />
                                                </button>
                                            </div>
                                            <div>
                                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Status</div>
                                                <span className={`mt-1 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${empresa.ativo
                                                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                    }`}>
                                                    {empresa.ativo ? 'Ativa' : 'Inativa'}
                                                </span>
                                            </div>
                                            <div>
                                                <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Acoes</div>
                                                <div className="mt-1 flex flex-wrap gap-2">
                                                    <button
                                                        onClick={() => handleConfiguracoes(empresa.id)}
                                                        className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                                        title="Configuracoes"
                                                    >
                                                        <CogIcon className="h-5 w-5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleAbrirModalBoleto(empresa)}
                                                        className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                                                        title="Gerar/baixar boleto"
                                                        disabled={generatingBoletoId === empresa.id}
                                                    >
                                                        {generatingBoletoId === empresa.id ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <DocumentArrowDownIcon className="h-5 w-5" />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleAtivo(empresa.id, empresa.ativo)}
                                                        className={`rounded-lg p-2 transition-colors ${empresa.ativo
                                                            ? 'text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30'
                                                            : 'text-gray-400 hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-900/30'
                                                            }`}
                                                        title={empresa.ativo ? 'Desativar Empresa' : 'Ativar Empresa'}
                                                    >
                                                        {empresa.ativo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="hidden overflow-x-auto xl:block">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-900">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em]">Empresa</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em]">Contato</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em] text-center">Honorário</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em]">Status</th>
                                        <th className="px-6 py-4 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-[0.12em] text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {filteredEmpresas.map((empresa) => (
                                        <tr key={empresa.id} className="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center">
                                                    <div className="h-10 w-10 flex-shrink-0 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-sm">
                                                        {empresa.nome.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div className="ml-4">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">{empresa.nome}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-0.5">{empresa.cnpj}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{empresa.email}</div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleHonorario(empresa.id, empresa.honorario)}
                                                    disabled={updatingHonorarioIds.includes(empresa.id)}
                                                    className="inline-flex items-center justify-center rounded-lg p-1 disabled:cursor-not-allowed"
                                                    title={empresa.honorario ? 'Honorario concluido' : 'Marcar honorario'}
                                                >
                                                    <CheckCircleIcon
                                                        className={`h-5 w-5 ${empresa.honorario
                                                            ? 'text-green-500'
                                                            : 'text-gray-300 dark:text-gray-600'
                                                            } ${updatingHonorarioIds.includes(empresa.id) ? 'opacity-50' : 'cursor-pointer'}`}
                                                    />
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${empresa.ativo
                                                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800'
                                                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                                                    }`}>
                                                    {empresa.ativo ? 'Ativa' : 'Inativa'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleConfiguracoes(empresa.id)}
                                                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 rounded-md transition-colors"
                                                    title="Configurações"
                                                >
                                                    <CogIcon className="h-5 w-5" />
                                                </button>
                                                <button
                                                    onClick={() => handleAbrirModalBoleto(empresa)}
                                                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 rounded-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                    title="Gerar/baixar boleto"
                                                    disabled={generatingBoletoId === empresa.id}
                                                >
                                                    {generatingBoletoId === empresa.id
                                                        ? <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                                        : <DocumentArrowDownIcon className="h-5 w-5" />}
                                                </button>
                                                <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                                <button
                                                    onClick={() => handleToggleAtivo(empresa.id, empresa.ativo)}
                                                    className={`p-2 rounded-lg transition-colors ${empresa.ativo
                                                        ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30'
                                                            : 'text-gray-400 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30'
                                                            }`}
                                                        title={empresa.ativo ? 'Desativar Empresa' : 'Ativar Empresa'}
                                                    >
                                                        {empresa.ativo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Modal ação boleto avulso */}
                {boletoActionModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div
                            className="absolute inset-0"
                            onClick={() => !boletoActionLoading && setBoletoActionModal(null)}
                        />
                        <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-800 flex items-start justify-between">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Boleto Avulso</p>
                                    <h2 className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{boletoActionModal.nome}</h2>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Escolha a ação para o honorário deste mês.</p>
                                </div>
                                <button
                                    onClick={() => !boletoActionLoading && setBoletoActionModal(null)}
                                    className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <XCircleIcon className="h-6 w-6" />
                                </button>
                            </div>
                            <div className="p-6 space-y-4">
                                <button
                                    onClick={() => handleBoletoAction('baixar')}
                                    disabled={boletoActionLoading}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-800 transition-colors hover:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {boletoActionLoading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <DocumentArrowDownIcon className="h-5 w-5" />}
                                    Baixar boleto (usa existente se houver)
                                </button>
                                <button
                                    onClick={() => handleBoletoAction('gerar_enviar')}
                                    disabled={boletoActionLoading}
                                    className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {boletoActionLoading ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <PaperAirplaneIcon className="h-5 w-5 rotate-45" />}
                                    Gerar e enviar pelo WhatsApp
                                </button>
                                {boletoActionResult && (
                                    <div className={`rounded-lg px-4 py-3 text-sm font-semibold ${boletoActionResult.type === 'success'
                                        ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-200'
                                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200'
                                        }`}>
                                        {boletoActionResult.text}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Configurações */}
                {boletoModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div
                            className="absolute inset-0"
                            onClick={() => !isGeneratingBoletos && !isDownloadingBoletos && setBoletoModalOpen(false)}
                        />
                        <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="max-w-2xl">
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Selecao em Lote</p>
                                        <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Quais empresas ativas vao receber honorario agora?</h2>
                                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                            Escolha as empresas ativas e decida se quer baixar um PDF unico ou disparar o envio pelo WhatsApp.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => !isGeneratingBoletos && !isDownloadingBoletos && setBoletoModalOpen(false)}
                                        className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                        disabled={isGeneratingBoletos || isDownloadingBoletos}
                                    >
                                        <XCircleIcon className="h-6 w-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid max-h-[calc(100vh-10rem)] gap-6 overflow-y-auto p-4 sm:p-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                                <aside className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-5 dark:border-gray-800 dark:bg-gray-900">
                                    <div>
                                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-gray-400">Resumo</div>
                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div className="rounded-lg bg-white p-4 dark:bg-gray-800">
                                                <div className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Ativas</div>
                                                <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{activeEmpresas.length}</div>
                                            </div>
                                            <div className="rounded-lg bg-white p-4 dark:bg-gray-800">
                                                <div className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Marcadas</div>
                                                <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{selectedEmpresasCount}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                            Filtrar no popup
                                        </label>
                                        <div className="relative">
                                            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="text"
                                                value={boletoBatchSearch}
                                                onChange={(e) => setBoletoBatchSearch(e.target.value)}
                                                placeholder="Nome, CNPJ ou email"
                                                className="w-full rounded-md border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-slate-500/20"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                                                <TagIcon className="h-4 w-4" />
                                                Tags
                                            </label>
                                            {boletoSelectedTagIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setBoletoSelectedTagIds([])}
                                                    disabled={isGeneratingBoletos}
                                                    className="text-xs font-semibold text-slate-700 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-300 dark:hover:text-white"
                                                >
                                                    Limpar
                                                </button>
                                            )}
                                        </div>
                                        {tags.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-gray-300 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                Nenhuma tag disponivel.
                                            </div>
                                        ) : (
                                            <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                                                {tags.map((tag) => {
                                                    const selected = boletoSelectedTagIds.includes(String(tag.id));
                                                    return (
                                                        <button
                                                            key={tag.id}
                                                            type="button"
                                                            onClick={() => handleToggleBoletoTagFilter(String(tag.id))}
                                                            disabled={isGeneratingBoletos}
                                                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${selected
                                                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                                                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
                                                                }`}
                                                        >
                                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.cor }} />
                                                            {tag.nome}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                        {boletoSelectedTagIds.length > 0 && (
                                            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                                Empresas com todas as tags selecionadas sao filtradas e marcadas automaticamente.
                                            </p>
                                        )}
                                    </div>

                                    <button
                                        onClick={handleToggleAllModalEmpresas}
                                        className="w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                    >
                                        {allModalEmpresasSelected ? 'Desmarcar visiveis' : 'Marcar visiveis'}
                                    </button>

                                    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                                        Somente empresas ativas aparecem neste seletor. Cada envio vai gerar o arquivo HONORARIO.pdf na pasta da empresa e enviar a copia nomeada para o WhatsApp.
                                    </p>
                                </aside>

                                <div className="space-y-4">
                                    <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                        {filteredActiveEmpresasForModal.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                                Nenhuma empresa ativa encontrada com esse filtro.
                                            </div>
                                        ) : (
                                            filteredActiveEmpresasForModal.map((empresa) => {
                                                const selected = selectedEmpresaIds.includes(empresa.id);

                                                return (
                                                    <button
                                                        key={empresa.id}
                                                        type="button"
                                                        onClick={() => handleToggleEmpresaSelection(empresa.id)}
                                                        className={`w-full rounded-lg border p-4 text-left transition-colors ${selected
                                                            ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800'
                                                            : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700'
                                                            }`}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            <CheckCircleIcon
                                                                className={`mt-0.5 h-6 w-6 shrink-0 ${selected
                                                                    ? 'text-green-500'
                                                                    : 'text-gray-300 dark:text-gray-600'
                                                                    }`}
                                                            />
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                                                    <div>
                                                                        <div className="text-sm font-semibold text-gray-900 dark:text-white">{empresa.nome}</div>
                                                                        <div className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400">{empresa.cnpj}</div>
                                                                    </div>
                                                                    <span className="inline-flex w-fit items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                                                                        Ativa
                                                                    </span>
                                                                </div>
                                                                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">{empresa.email}</div>
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">
                                            {selectedEmpresasCount === 0
                                                ? 'Nenhuma empresa selecionada.'
                                                : `${selectedEmpresasCount} empresa(s) pronta(s) para baixar ou enviar honorario.`}
                                        </p>
                                        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap lg:w-auto lg:justify-end">
                                            <button
                                                onClick={() => setBoletoModalOpen(false)}
                                                className="min-w-[120px] rounded-md px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                                disabled={isGeneratingBoletos || isDownloadingBoletos}
                                            >
                                                Fechar
                                            </button>
                                            <button
                                                onClick={handleBaixarBoletosPdfUnico}
                                                className="inline-flex min-w-[190px] items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={isGeneratingBoletos || isDownloadingBoletos || selectedEmpresasCount === 0}
                                            >
                                                <DocumentArrowDownIcon className="h-5 w-5" />
                                                {isDownloadingBoletos ? 'Baixando...' : 'Gerar e Baixar PDF'}
                                            </button>
                                            <button
                                                onClick={handleGerarBoletosEmLote}
                                                className="min-w-[150px] rounded-md bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={isGeneratingBoletos || isDownloadingBoletos || selectedEmpresasCount === 0}
                                            >
                                                {isGeneratingBoletos ? 'Processando...' : 'Gerar E Enviar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {configModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div
                            className="absolute inset-0 bg-black/40"
                            onClick={() => setConfigModalOpen(false)}
                        />
                        <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-lg border border-gray-200 bg-white p-5 shadow-lg dark:border-gray-800 dark:bg-gray-900 sm:p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        Configurar Boletos
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Defina as taxas e valores padrão.</p>
                                </div>
                                <button
                                    onClick={() => setConfigModalOpen(false)}
                                    className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                >
                                    <XCircleIcon className="h-6 w-6" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {[
                                    { label: 'Valor Honorário (R$)', key: 'valor_honorario', type: 'number', step: '0.01' },
                                    { label: 'Dia Vencimento', key: 'dia_vencimento_honorario', type: 'number', min: '1', max: '31' },
                                    { label: 'Juros Mensal (%)', key: 'juros_mora_taxa', type: 'number', step: '0.01' },
                                    { label: 'Multa (%)', key: 'multa_taxa', type: 'number', step: '0.01' },
                                    { label: 'Desconto (%)', key: 'desconto_taxa', type: 'number', step: '0.01' },
                                    { label: 'Dias para Desconto', key: 'dias_para_desconto', type: 'number', title: 'Dias antes do vencimento' },
                                ].map((field) => (
                                    <div key={field.key} className="relative group">
                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide group-focus-within:text-slate-700 dark:group-focus-within:text-slate-200 transition-colors">
                                            {field.label}
                                        </label>
                                        <input
                                            type={field.type}
                                            step={field.step}
                                            min={field.min}
                                            max={field.max}
                                            title={field.title}
                                            value={currentConfig[field.key]}
                                            onChange={(e) => setCurrentConfig({ ...currentConfig, [field.key]: e.target.value })}
                                            className="w-full rounded-md border border-gray-200 bg-gray-50 p-3 font-medium text-gray-900 outline-none transition-all focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:focus:ring-slate-500/20"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                <button
                                    onClick={() => setConfigModalOpen(false)}
                                    className="rounded-md px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveConfig}
                                    className="rounded-md bg-slate-900 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
                                >
                                    Salvar Configuração
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {batchSummary && resultsModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                        <div
                            className="absolute inset-0"
                            onClick={() => setResultsModalOpen(false)}
                        />
                        <div className="relative max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-800 dark:bg-gray-900">
                            <div className="border-b border-gray-200 px-6 py-5 dark:border-gray-800">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Resultados da Remessa</p>
                                        <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Empresas enviadas e empresas que ainda precisam de ajuste</h2>
                                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
                                            Revise os retornos sem ocupar a tela principal. As falhas podem ser configuradas e reenviadas por aqui.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setResultsModalOpen(false)}
                                        className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                                    >
                                        <XCircleIcon className="h-6 w-6" />
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-4 border-b border-gray-200 px-6 py-4 dark:border-gray-800 md:grid-cols-3">
                                <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-800">
                                    <div className="text-xs uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">Total</div>
                                    <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{batchSummary.total}</div>
                                </div>
                                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
                                    <div className="text-xs uppercase tracking-[0.12em] text-green-700 dark:text-green-300">Enviadas</div>
                                    <div className="mt-1 text-2xl font-bold text-green-700 dark:text-green-300">{batchSummary.successCount}</div>
                                </div>
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                                    <div className="text-xs uppercase tracking-[0.12em] text-red-700 dark:text-red-300">Com ajuste</div>
                                    <div className="mt-1 text-2xl font-bold text-red-700 dark:text-red-300">{batchSummary.errorCount}</div>
                                </div>
                            </div>

                            <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-2">
                                <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                        Empresas enviadas com sucesso
                                    </div>
                                    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                        {batchSummary.successResults.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma empresa concluida nesta remessa.</p>
                                        ) : (
                                            batchSummary.successResults.map((result) => (
                                                <div key={`success-${result.empresaId}`} className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-800 dark:bg-green-900/20">
                                                    <div className="flex items-start gap-3">
                                                        <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                                                        <div>
                                                            <div className="font-semibold text-green-800 dark:text-green-200">{result.empresa}</div>
                                                            <div className="mt-1 text-xs text-green-700 dark:text-green-300">{result.message}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                                        Empresas que precisam de configuracao
                                    </div>
                                    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                                        {batchSummary.errorResults.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma empresa com falha nesta remessa.</p>
                                        ) : (
                                            batchSummary.errorResults.map((result) => {
                                                const isRetrying = retryingEmpresaIds.includes(result.empresaId);

                                                return (
                                                    <div key={`error-${result.empresaId}`} className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 dark:border-red-800 dark:bg-red-900/20">
                                                        <div className="flex flex-col gap-4">
                                                            <div>
                                                                <div className="font-semibold text-red-800 dark:text-red-200">{result.empresa}</div>
                                                                <div className="mt-1 text-xs text-red-700 dark:text-red-300">{result.message}</div>
                                                                <div className="mt-2 text-xs font-medium text-red-800 dark:text-red-200">
                                                                    Configure o boleto dessa empresa antes de tentar novamente, se necessario.
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col gap-2 sm:flex-row">
                                                                <button
                                                                    onClick={() => {
                                                                        setResultsModalOpen(false);
                                                                        handleConfiguracoes(result.empresaId);
                                                                    }}
                                                                    className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                                                                >
                                                                    Configurar boleto
                                                                </button>
                                                                <button
                                                                    onClick={() => handleRetryEmpresa(result.empresaId)}
                                                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-700 dark:bg-transparent dark:text-red-200 dark:hover:bg-red-900/30"
                                                                    disabled={isRetrying}
                                                                >
                                                                    <ArrowPathIcon className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                                                                    {isRetrying ? 'Reenviando...' : 'Reenviar'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default GerenciamentoIntegrado;
