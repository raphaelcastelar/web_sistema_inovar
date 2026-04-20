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
    usuarios: [],
    tag_ids: [],
    socios: [],
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="p-6 md:p-8"
        >
            <div className="max-w-3xl mx-auto bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700">
                <h2 className="text-3xl font-bold text-gray-800 dark:text-indigo-300 mb-8 text-center">
                    {isEditing ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
                </h2>

                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-md relative mb-6 flex items-center gap-3" role="alert">
                        <InformationCircleIcon className="h-6 w-6" />
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="relative">
                        <label htmlFor="nome" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Nome da Empresa</label>
                        <BuildingOfficeIcon className="h-5 w-5 text-gray-400 absolute top-[2.4rem] left-3" />
                        <input type="text" name="nome" id="nome" value={empresa.nome} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">CNPJ</label>
                            <UserIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="cnpj" id="cnpj" value={empresa.cnpj} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required />
                        </div>
                        <div className="relative">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Email</label>
                            <EnvelopeIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="email" name="email" id="email" value={empresa.email} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" required />
                        </div>
                    </div>

                    <div className="relative">
                        <label htmlFor="telefone" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Telefone</label>
                        <PhoneIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                        <input type="tel" name="telefone" id="telefone" value={empresa.telefone} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" placeholder="(XX) XXXXX-XXXX" aria-describedby="telefone-feedback-message" required />
                        {telefoneFeedback.message && (
                            <p id="telefone-feedback-message" className={`text-xs mt-2 ${getFeedbackColor()}`}>
                                {telefoneFeedback.message}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <label htmlFor="endereco" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Endereço</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="endereco" id="endereco" value={empresa.endereco} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="relative">
                            <label htmlFor="numero" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Número</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="numero" id="numero" value={empresa.numero || ''} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="relative">
                            <label htmlFor="cep" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">CEP</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="cep" id="cep" value={empresa.cep} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" placeholder="Ex.: 12345678" maxLength="8" />
                        </div>
                        <div className="relative">
                            <label htmlFor="cidade" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Cidade</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="cidade" id="cidade" value={empresa.cidade} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="relative">
                            <label htmlFor="bairro" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Bairro</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input type="text" name="bairro" id="bairro" value={empresa.bairro} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors" />
                        </div>
                        <div className="relative">
                            <label htmlFor="uf" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">UF</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <select name="uf" id="uf" value={empresa.uf} onChange={handleChange} className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
                                <option value="">Selecione uma UF</option>
                                {['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
                                    .sort()
                                    .map((uf) => (
                                        <option key={uf} value={uf}>{uf}</option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
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
                                    className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                    placeholder="Ex.: Prioridade alta"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Cor</label>
                                <input
                                    type="color"
                                    value={newTagColor}
                                    onChange={(e) => setNewTagColor(e.target.value)}
                                    className="w-full h-11 p-1 rounded-md bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleCreateTag}
                                disabled={creatingTag}
                                className="h-11 px-4 inline-flex items-center justify-center rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
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
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-900/30">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Sócios</h3>
                            <button
                                type="button"
                                onClick={addSocio}
                                className="inline-flex items-center gap-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Adicionar sócio
                            </button>
                        </div>

                        {(empresa.socios || []).length === 0 && (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum sócio adicionado.</p>
                        )}

                        <div className="space-y-3">
                            {(empresa.socios || []).map((socio, index) => (
                                <div key={`${socio.id || 'novo'}-${index}`} className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3 items-end">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Nome do sócio</label>
                                        <input
                                            type="text"
                                            value={socio.nome || ''}
                                            onChange={(e) => handleSocioChange(index, 'nome', e.target.value)}
                                            className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                            placeholder="Nome completo"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">CPF</label>
                                        <input
                                            type="text"
                                            value={socio.cpf || ''}
                                            onChange={(e) => handleSocioChange(index, 'cpf', e.target.value)}
                                            className="w-full p-3 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                            placeholder="00000000000"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeSocio(index)}
                                        className="h-11 px-3 inline-flex items-center justify-center rounded-md bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
                                        title="Remover sócio"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-end space-x-4 pt-4">
                        <button
                            type="button"
                            onClick={() => navigate('/empresas')}
                            className="px-6 py-3 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 font-semibold rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 dark:focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={loading}
                        >
                            {loading ? 'Salvando...' : (isEditing ? 'Atualizar Empresa' : 'Cadastrar Empresa')}
                        </button>
                    </div>
                </form>
            </div>
        </motion.div>
    );
};

export default EmpresaForm;
