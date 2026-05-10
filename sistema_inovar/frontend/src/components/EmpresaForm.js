import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../api/axiosInstance';
import { motion } from 'framer-motion';
import {
    InformationCircleIcon,
    UserIcon,
    BuildingOfficeIcon,
    EnvelopeIcon,
    PhoneIcon,
    MapPinIcon,
    TagIcon,
    PlusIcon,
    TrashIcon,
} from '@heroicons/react/24/outline';

const emptyEmpresa = {
    nome: '',
    cnpj: '',
    email: '',
    telefone: '',
    endereco: '',
    numero: '',
    cep: '',
    cidade: '',
    bairro: '',
    uf: '',
    regime_tributario: '',
    porte_empresa: '',
    carteira_clientes: '',
    grupo_atividade: [],
    anexo_simples: '',
    usuarios: [],
    tag_ids: [],
    socios: [],
};

const regimeTributarioOptions = ['SIMPLES NACIONAL', 'LUCRO REAL', 'LUCRO PRESUMIDO', 'OUTROS'];
const porteEmpresaOptions = ['MEI', 'ME', 'EPP', 'MEDIO PORTE', 'GRANDE PORTE'];
const carteiraClientesOptions = ['INOVAR ES', 'INOVAR MG', 'NOVVA'];
const grupoAtividadeOptions = ['SERVICO', 'COMERCIO', 'INDUSTRIA'];
const anexoSimplesOptions = ['I', 'II', 'III', 'IV', 'V'];

const formatOptionLabel = (value) => {
    const labels = {
        'MEDIO PORTE': 'Medio Porte',
        SERVICO: 'Servico',
        COMERCIO: 'Comercio',
        INDUSTRIA: 'Industria',
    };
    return labels[value] || value;
};

const EmpresaForm = () => {
    const { empresaId } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(empresaId);

    const [empresa, setEmpresa] = useState(emptyEmpresa);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [telefoneFeedback, setTelefoneFeedback] = useState({ message: '', type: 'hint' });
    const [availableTags, setAvailableTags] = useState([]);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState('#3B82F6');
    const [creatingTag, setCreatingTag] = useState(false);
    const [deletingTagId, setDeletingTagId] = useState(null);
    const [activeSection, setActiveSection] = useState('dados');

    const validateAndSetTelefoneFeedback = useCallback((inputValue) => {
        const cleanedValue = inputValue.replace(/\D/g, '');
        if (!inputValue.trim()) {
            setTelefoneFeedback({ message: 'DDD + Número (10 ou 11 dígitos). Ex: 22999998888', type: 'hint' });
            return true;
        }
        if (!/^[0-9\s()-]*$/.test(inputValue)) {
            setTelefoneFeedback({ message: 'Telefone pode conter apenas números e formatação ( ), -.', type: 'error' });
            return false;
        }
        if (cleanedValue.length > 11) {
            setTelefoneFeedback({ message: 'Telefone muito longo (máx. 11 dígitos).', type: 'error' });
            return false;
        }
        if (cleanedValue.length > 0 && cleanedValue.length < 10) {
            setTelefoneFeedback({ message: 'Telefone muito curto (mín. 10 dígitos).', type: 'hint' });
            return false;
        }
        if (cleanedValue.length === 10 || cleanedValue.length === 11) {
            setTelefoneFeedback({ message: 'Formato parece correto!', type: 'success' });
            return true;
        }
        setTelefoneFeedback({ message: 'Continue digitando...', type: 'hint' });
        return false;
    }, []);

    useEffect(() => {
        const fetchTags = async () => {
            try {
                const response = await axiosInstance.get('/api/tags/');
                setAvailableTags(Array.isArray(response.data) ? response.data : []);
            } catch (err) {
                console.error('Erro ao carregar tags:', err.response?.data || err.message);
            }
        };

        fetchTags();
    }, []);

    useEffect(() => {
        const fetchEmpresa = async () => {
            if (isEditing) {
                setLoading(true);
                setError(null);
                try {
                    const response = await axiosInstance.get(`/api/empresas/${empresaId}/`);
                    const apiTelefone = response.data.telefone || '';
                    let displayTelefone = apiTelefone;
                    if (apiTelefone.startsWith('55') && (apiTelefone.length === 12 || apiTelefone.length === 13)) {
                        displayTelefone = apiTelefone.substring(2);
                    }

                    setEmpresa({
                        nome: response.data.nome || '',
                        cnpj: response.data.cnpj || '',
                        email: response.data.email || '',
                        telefone: displayTelefone,
                        endereco: response.data.endereco || '',
                        numero: response.data.numero || '',
                        cep: response.data.cep || '',
                        cidade: response.data.cidade || '',
                        bairro: response.data.bairro || '',
                        uf: response.data.uf || '',
                        regime_tributario: response.data.regime_tributario || '',
                        porte_empresa: response.data.porte_empresa || '',
                        carteira_clientes: response.data.carteira_clientes || '',
                        grupo_atividade: Array.isArray(response.data.grupo_atividade) ? response.data.grupo_atividade : [],
                        anexo_simples: response.data.anexo_simples || '',
                        usuarios: response.data.usuarios || [],
                        tag_ids: Array.isArray(response.data.tags) ? response.data.tags.map((tag) => tag.id) : [],
                        socios: Array.isArray(response.data.socios)
                            ? response.data.socios.map((s) => ({ id: s.id, nome: s.nome || '', cpf: s.cpf || '' }))
                            : [],
                    });
                    validateAndSetTelefoneFeedback(displayTelefone);
                } catch {
                    setError('Não foi possível carregar os dados da empresa.');
                } finally {
                    setLoading(false);
                }
            } else {
                setEmpresa(emptyEmpresa);
                validateAndSetTelefoneFeedback('');
            }
        };

        fetchEmpresa();
    }, [empresaId, isEditing, validateAndSetTelefoneFeedback]);

    const handleChange = async (e) => {
        const { name, value } = e.target;
        setEmpresa((prev) => ({ ...prev, [name]: value }));

        if (name === 'telefone') {
            validateAndSetTelefoneFeedback(value);
        }

        if (name === 'cep' && value.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    setEmpresa((prev) => ({
                        ...prev,
                        endereco: data.logradouro || '',
                        cidade: data.localidade || '',
                        bairro: data.bairro || '',
                        uf: data.uf || '',
                    }));
                } else {
                    setError('CEP não encontrado ou inválido.');
                }
            } catch {
                setError('Erro ao consultar o CEP. Tente novamente.');
            }
        }
    };

    const handleNumeroSemNumeroChange = (checked) => {
        setEmpresa((prev) => ({ ...prev, numero: checked ? 'S/N' : '' }));
    };

    const handleSocioChange = (index, field, value) => {
        setEmpresa((prev) => {
            const socios = [...(prev.socios || [])];
            socios[index] = { ...socios[index], [field]: value };
            return { ...prev, socios };
        });
    };

    const addSocio = () => {
        setEmpresa((prev) => ({ ...prev, socios: [...(prev.socios || []), { nome: '', cpf: '' }] }));
    };

    const removeSocio = (index) => {
        setEmpresa((prev) => ({
            ...prev,
            socios: (prev.socios || []).filter((_, i) => i !== index),
        }));
    };

    const toggleTagSelection = (tagId) => {
        setEmpresa((prev) => {
            const selectedTagIds = Array.isArray(prev.tag_ids) ? prev.tag_ids : [];
            const hasTag = selectedTagIds.includes(tagId);
            return {
                ...prev,
                tag_ids: hasTag
                    ? selectedTagIds.filter((id) => id !== tagId)
                    : [...selectedTagIds, tagId],
            };
        });
    };

    const toggleGrupoAtividade = (grupo) => {
        setEmpresa((prev) => {
            const gruposAtuais = Array.isArray(prev.grupo_atividade) ? prev.grupo_atividade : [];
            const hasGrupo = gruposAtuais.includes(grupo);
            return {
                ...prev,
                grupo_atividade: hasGrupo
                    ? gruposAtuais.filter((item) => item !== grupo)
                    : [...gruposAtuais, grupo],
            };
        });
    };

    const handleCreateTag = async () => {
        const nome = newTagName.trim();
        if (!nome) {
            setError('Informe um nome para criar a tag.');
            return;
        }

        setCreatingTag(true);
        setError(null);
        try {
            const response = await axiosInstance.post('/api/tags/', {
                nome,
                cor: newTagColor,
            });
            const createdTag = response.data;
            setAvailableTags((prev) => [...prev, createdTag].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')));
            setEmpresa((prev) => ({
                ...prev,
                tag_ids: [...(prev.tag_ids || []), createdTag.id],
            }));
            setNewTagName('');
        } catch (err) {
            const apiError = err.response?.data;
            if (apiError && typeof apiError === 'object') {
                const errorMessages = Object.entries(apiError).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
                setError(errorMessages.join(' | '));
            } else {
                setError('Não foi possível criar a tag.');
            }
        } finally {
            setCreatingTag(false);
        }
    };

    const handleDeleteTag = async (tag) => {
        if (!window.confirm(`Excluir a tag "${tag.nome}"? Ela será removida de todas as empresas.`)) {
            return;
        }

        setDeletingTagId(tag.id);
        setError(null);
        try {
            await axiosInstance.delete(`/api/tags/${tag.id}/`);
            setAvailableTags((prev) => prev.filter((currentTag) => currentTag.id !== tag.id));
            setEmpresa((prev) => ({
                ...prev,
                tag_ids: (prev.tag_ids || []).filter((id) => id !== tag.id),
            }));
        } catch (err) {
            const apiError = err.response?.data;
            if (apiError && typeof apiError === 'object') {
                const errorMessages = Object.entries(apiError).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
                setError(errorMessages.join(' | '));
            } else {
                setError('Não foi possível excluir a tag.');
            }
        } finally {
            setDeletingTagId(null);
        }
    };

    const sanitizeSociosForPayload = () => {
        const socios = Array.isArray(empresa.socios) ? empresa.socios : [];
        const sociosComConteudo = socios.filter((s) => (s.nome || '').trim() || (s.cpf || '').trim());

        const sociosSanitizados = sociosComConteudo.map((s, idx) => {
            const nome = (s.nome || '').trim();
            const cpfLimpo = (s.cpf || '').replace(/\D/g, '');

            if (!nome || cpfLimpo.length !== 11) {
                throw new Error(`Preencha corretamente o sócio ${idx + 1} (nome e CPF com 11 dígitos).`);
            }

            return {
                ...(s.id ? { id: s.id } : {}),
                nome,
                cpf: cpfLimpo,
            };
        });

        return sociosSanitizados;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        const isTelefoneValid = validateAndSetTelefoneFeedback(empresa.telefone);
        if (!isTelefoneValid) {
            setError('Por favor, corrija o formato do telefone antes de salvar.');
            if (telefoneFeedback.type !== 'error') {
                setTelefoneFeedback((prev) => ({ ...prev, type: 'error' }));
            }
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const sociosSanitizados = sanitizeSociosForPayload();
            const telefoneLimpoParaEnvio = empresa.telefone.replace(/\D/g, '');
            const payload = {
                ...empresa,
                telefone: telefoneLimpoParaEnvio,
                usuarios: empresa.usuarios.length > 0 ? empresa.usuarios : [1],
                tag_ids: Array.isArray(empresa.tag_ids) ? empresa.tag_ids : [],
                grupo_atividade: Array.isArray(empresa.grupo_atividade) ? empresa.grupo_atividade : [],
                socios: sociosSanitizados,
            };

            const url = isEditing ? `/api/empresas/${empresaId}/` : '/api/empresas/';
            const method = isEditing ? 'put' : 'post';

            await axiosInstance[method](url, payload);
            navigate('/empresas');
        } catch (err) {
            const apiErrors = err.response?.data;
            if (apiErrors && typeof apiErrors === 'object') {
                const errorMessages = Object.entries(apiErrors).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
                setError(errorMessages.join(' | '));
            } else {
                setError(err.message || 'Ocorreu um erro inesperado ao salvar.');
            }
        } finally {
            setLoading(false);
        }
    };

    const getFeedbackColor = () => {
        if (telefoneFeedback.type === 'error') return 'text-red-600 dark:text-red-400';
        if (telefoneFeedback.type === 'success') return 'text-green-600 dark:text-green-400';
        return 'text-gray-500 dark:text-gray-400';
    };

    if (loading && isEditing) {
        return <p className="text-center text-gray-500 dark:text-gray-400 mt-10">Carregando dados da empresa...</p>;
    }

    const selectedTagsCount = Array.isArray(empresa.tag_ids) ? empresa.tag_ids.length : 0;
    const sociosCount = Array.isArray(empresa.socios) ? empresa.socios.length : 0;
    const formSections = [
        { id: 'dados', label: 'Dados', description: 'Identificação e contato', icon: BuildingOfficeIcon },
        { id: 'endereco', label: 'Endereço', description: 'Localização da empresa', icon: MapPinIcon },
        { id: 'classificacao', label: 'Classificação', description: 'Regime, porte e atividades', icon: InformationCircleIcon },
        { id: 'tags', label: 'Tags', description: 'Marcadores operacionais', icon: TagIcon },
        { id: 'socios', label: 'Sócios', description: 'Quadro societário', icon: UserIcon },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="min-h-screen bg-gray-50 p-4 dark:bg-gray-900 sm:p-6 lg:p-8"
        >
            <div className="mx-auto max-w-7xl space-y-6">
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-5 dark:border-gray-700 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600 dark:text-indigo-300">
                                Cadastro de empresa
                            </p>
                            <h2 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white sm:text-3xl">
                                {isEditing ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
                            </h2>
                            <p className="mt-2 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
                                Dados cadastrais, endereço, classificação, tags e sócios em uma tela organizada para edição rápida.
                            </p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
                            <div className="rounded-xl bg-gray-50 px-3 py-3 text-center dark:bg-gray-900">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Tags</div>
                                <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{selectedTagsCount}</div>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-3 text-center dark:bg-gray-900">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Sócios</div>
                                <div className="mt-1 text-xl font-bold text-gray-900 dark:text-white">{sociosCount}</div>
                            </div>
                            <div className="rounded-xl bg-gray-50 px-3 py-3 text-center dark:bg-gray-900">
                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</div>
                                <div className="mt-1 text-sm font-bold text-emerald-600 dark:text-emerald-300">Em edição</div>
                            </div>
                        </div>
                    </div>
                </div>

                <form noValidate onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
                    <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 lg:sticky lg:top-6">
                        <div className="space-y-2">
                            {formSections.map(({ id, label, description, icon: Icon }) => {
                                const selected = activeSection === id;
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => setActiveSection(id)}
                                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${selected
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 dark:text-gray-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-200'
                                            }`}
                                    >
                                        <Icon className="h-5 w-5 flex-shrink-0" />
                                        <span className="min-w-0">
                                            <span className="block text-sm font-semibold">{label}</span>
                                            <span className={`block truncate text-xs ${selected ? 'text-indigo-100' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {description}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                            <div className="font-semibold text-gray-900 dark:text-white">Resumo rápido</div>
                            <div className="mt-3 space-y-2">
                                <div className="flex justify-between gap-3">
                                    <span>Carteira</span>
                                    <span className="font-semibold">{empresa.carteira_clientes || '-'}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span>Regime</span>
                                    <span className="font-semibold">{empresa.regime_tributario || '-'}</span>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <span>UF</span>
                                    <span className="font-semibold">{empresa.uf || '-'}</span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    <div className="space-y-6">
                {error && (
                            <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-100 px-4 py-3 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300" role="alert">
                        <InformationCircleIcon className="h-6 w-6" />
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                        <section id="dados" className={`${activeSection === 'dados' ? '' : 'hidden'} rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800`}>
                            <div className="mb-5 flex items-center gap-3">
                                <div className="rounded-xl bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                                    <BuildingOfficeIcon className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Dados principais</h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">Identificação e contato da empresa.</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-6">
                                <div className="relative xl:col-span-3">
                                    <label htmlFor="nome" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Nome da Empresa</label>
                                    <BuildingOfficeIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                    <input type="text" name="nome" id="nome" value={empresa.nome} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" required />
                                </div>
                                <div className="relative xl:col-span-3">
                                    <label htmlFor="cnpj" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">CNPJ</label>
                                    <UserIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                    <input type="text" name="cnpj" id="cnpj" value={empresa.cnpj} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" required />
                                </div>
                                <div className="relative xl:col-span-3">
                                    <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Email</label>
                                    <EnvelopeIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                    <input type="email" name="email" id="email" value={empresa.email} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" required />
                                </div>
                                <div className="relative xl:col-span-3">
                                    <label htmlFor="telefone" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Telefone</label>
                                    <PhoneIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                    <input type="tel" name="telefone" id="telefone" value={empresa.telefone} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="(XX) XXXXX-XXXX" aria-describedby="telefone-feedback-message" required />
                                    {telefoneFeedback.message && (
                                        <p id="telefone-feedback-message" className={`mt-2 text-xs ${getFeedbackColor()}`}>
                                            {telefoneFeedback.message}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </section>

                        <div className="grid gap-6 xl:grid-cols-2">
                            <section id="endereco" className={`${activeSection === 'endereco' ? '' : 'hidden'} rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2`}>
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
                                        <MapPinIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Endereço</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">CEP, cidade e localização.</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div className="relative sm:col-span-2">
                                        <label htmlFor="endereco" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Endereço</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <input type="text" name="endereco" id="endereco" value={empresa.endereco} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                    </div>
                                    <div className="relative">
                                        <label htmlFor="numero" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Número</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <input type="text" name="numero" id="numero" value={empresa.numero || ''} onChange={handleChange} disabled={empresa.numero === 'S/N'} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                        <label className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                            <input type="checkbox" checked={empresa.numero === 'S/N'} onChange={(event) => handleNumeroSemNumeroChange(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                            Sem número
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <label htmlFor="cep" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">CEP</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <input type="text" name="cep" id="cep" value={empresa.cep} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" placeholder="Ex.: 12345678" maxLength="8" />
                                    </div>
                                    <div className="relative">
                                        <label htmlFor="cidade" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Cidade</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <input type="text" name="cidade" id="cidade" value={empresa.cidade} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                    </div>
                                    <div className="relative">
                                        <label htmlFor="bairro" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Bairro</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <input type="text" name="bairro" id="bairro" value={empresa.bairro} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
                                    </div>
                                    <div className="relative sm:col-span-2">
                                        <label htmlFor="uf" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">UF</label>
                                        <MapPinIcon className="absolute left-3 top-9 h-5 w-5 text-gray-400" />
                                        <select name="uf" id="uf" value={empresa.uf} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 pl-10 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                <option value="">Selecione uma UF</option>
                                {['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
                                    .sort()
                                    .map((uf) => (
                                        <option key={uf} value={uf}>{uf}</option>
                                    ))}
                            </select>
                                    </div>
                        </div>
                            </section>

                            <section id="classificacao" className={`${activeSection === 'classificacao' ? '' : 'hidden'} rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2`}>
                                <div className="mb-5 flex items-center gap-3">
                                    <div className="rounded-xl bg-amber-50 p-2 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                                        <InformationCircleIcon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Classificação</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Regime, porte e atividade.</p>
                                    </div>
                                </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                        <label htmlFor="regime_tributario" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Regime tributário</label>
                                        <select name="regime_tributario" id="regime_tributario" value={empresa.regime_tributario} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    <option value="">Selecione</option>
                                    {regimeTributarioOptions.map((option) => (
                                        <option key={option} value={option}>{formatOptionLabel(option)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                        <label htmlFor="porte_empresa" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Porte da empresa</label>
                                        <select name="porte_empresa" id="porte_empresa" value={empresa.porte_empresa} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    <option value="">Selecione</option>
                                    {porteEmpresaOptions.map((option) => (
                                        <option key={option} value={option}>{formatOptionLabel(option)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                        <label htmlFor="carteira_clientes" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Carteira de clientes</label>
                                        <select name="carteira_clientes" id="carteira_clientes" value={empresa.carteira_clientes} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    <option value="">Selecione</option>
                                    {carteiraClientesOptions.map((option) => (
                                        <option key={option} value={option}>{formatOptionLabel(option)}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                        <label htmlFor="anexo_simples" className="block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Anexo do simples</label>
                                        <select name="anexo_simples" id="anexo_simples" value={empresa.anexo_simples} onChange={handleChange} className="mt-1 w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                                    <option value="">Selecione</option>
                                    {anexoSimplesOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                                <div className="mt-5">
                                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Grupo de atividade</span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                {grupoAtividadeOptions.map((option) => {
                                    const checked = (empresa.grupo_atividade || []).includes(option);
                                    return (
                                                <label key={option} className={`flex items-center gap-3 rounded-xl border p-3 text-sm font-medium transition-colors ${checked ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'}`}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => toggleGrupoAtividade(option)}
                                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            {formatOptionLabel(option)}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                            </section>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                            <section id="tags" className={`${activeSection === 'tags' ? '' : 'hidden'} rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                                    <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
                                <TagIcon className="h-5 w-5" />
                                Tags
                            </h3>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_auto] gap-3 items-end mb-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Nome da tag</label>
                                <input
                                    type="text"
                                    value={newTagName}
                                    onChange={(e) => setNewTagName(e.target.value)}
                                            className="w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                                    placeholder="Ex.: Prioridade alta"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cor</label>
                                <input
                                    type="color"
                                    value={newTagColor}
                                    onChange={(e) => setNewTagColor(e.target.value)}
                                            className="h-11 w-full rounded-xl border border-gray-300 bg-gray-50 p-1 dark:border-gray-600 dark:bg-gray-700"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleCreateTag}
                                disabled={creatingTag}
                                        className="inline-flex h-11 items-center justify-center rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                                {creatingTag ? 'Criando...' : 'Criar Tag'}
                            </button>
                        </div>

                        {(availableTags || []).length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma tag criada ainda.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {availableTags.map((tag) => {
                                    const selected = (empresa.tag_ids || []).includes(tag.id);
                                    const isDeleting = deletingTagId === tag.id;
                                    return (
                                        <div
                                            key={tag.id}
                                            className={`inline-flex items-center overflow-hidden rounded-full border text-sm transition-colors ${selected ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-900/30 dark:text-indigo-200' : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200'}`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => toggleTagSelection(tag.id)}
                                                className="inline-flex items-center gap-2 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-600"
                                            >
                                                <span
                                                    className="h-2.5 w-2.5 rounded-full"
                                                    style={{ backgroundColor: tag.cor }}
                                                />
                                                {tag.nome}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteTag(tag)}
                                                disabled={isDeleting}
                                                className="inline-flex h-7 w-8 items-center justify-center border-l border-current/20 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-900/30"
                                                title="Excluir tag"
                                                aria-label={`Excluir tag ${tag.nome}`}
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                            </section>

                            <section id="socios" className={`${activeSection === 'socios' ? '' : 'hidden'} rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 xl:col-span-2`}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Sócios</h3>
                            <button
                                type="button"
                                onClick={addSocio}
                                        className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-700"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Adicionar sócio
                            </button>
                        </div>

                        {(empresa.socios || []).length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum sócio adicionado.</p>
                        )}

                                <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                            {(empresa.socios || []).map((socio, index) => (
                                        <div key={`${socio.id || 'novo'}-${index}`} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 md:grid-cols-[1fr_170px_auto] md:items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Nome do sócio</label>
                                        <input
                                            type="text"
                                            value={socio.nome || ''}
                                            onChange={(e) => handleSocioChange(index, 'nome', e.target.value)}
                                                    className="w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 placeholder:text-gray-500 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
                                            placeholder="Nome completo"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">CPF</label>
                                        <input
                                            type="text"
                                            value={socio.cpf || ''}
                                            onChange={(e) => handleSocioChange(index, 'cpf', e.target.value)}
                                                    className="w-full rounded-xl border border-gray-300 bg-gray-50 p-3 text-gray-900 placeholder:text-gray-500 transition-colors focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
                                            placeholder="00000000000"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeSocio(index)}
                                                className="inline-flex h-11 items-center justify-center rounded-xl bg-red-100 px-3 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                                        title="Remover sócio"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                            </section>
                        </div>

                        <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur dark:border-gray-700 dark:bg-gray-800/95 sm:flex-row sm:items-center sm:justify-end">
                        <button
                            type="button"
                            onClick={() => navigate('/empresas')}
                                className="rounded-xl bg-gray-200 px-6 py-3 font-semibold text-gray-800 transition-colors hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                                className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
                            disabled={loading}
                        >
                            {loading ? 'Salvando...' : (isEditing ? 'Atualizar Empresa' : 'Cadastrar Empresa')}
                        </button>
                    </div>
                    </div>
                </form>
            </div>
        </motion.div>
    );
};

export default EmpresaForm;
