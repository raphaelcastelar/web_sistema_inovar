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
} from '@heroicons/react/24/outline';

const EmpresaForm = () => {
    const { empresaId } = useParams();
    const navigate = useNavigate();
    const isEditing = Boolean(empresaId);
    
    const [empresa, setEmpresa] = useState({
        nome: '',
        cnpj: '',
        email: '',
        telefone: '',
        endereco: '',
        cep: '',
        cidade: '',
        bairro: '',
        uf: '',
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [telefoneFeedback, setTelefoneFeedback] = useState({ message: '', type: 'hint' });

    const validateAndSetTelefoneFeedback = useCallback((inputValue) => {
        const cleanedValue = inputValue.replace(/\D/g, '');
        if (!inputValue.trim()) {
            setTelefoneFeedback({ message: 'DDD + Número (10 ou 11 dígitos). Ex: 22999998888', type: 'hint' });
            return true; 
        }
        if (!/^[0-9\s()-]*$/.test(inputValue)) {
            setTelefoneFeedback({ message: "Telefone pode conter apenas números e formatação ( ), -.", type: 'error' });
            return false;
        }
        if (cleanedValue.length > 11) {
            setTelefoneFeedback({ message: "Telefone muito longo (máx. 11 dígitos).", type: 'error' });
            return false;
        }
        if (cleanedValue.length > 0 && cleanedValue.length < 10) {
            setTelefoneFeedback({ message: "Telefone muito curto (mín. 10 dígitos).", type: 'hint' });
            return false;
        }
        if (cleanedValue.length === 10 || cleanedValue.length === 11) {
            setTelefoneFeedback({ message: "Formato parece correto!", type: 'success' });
            return true;
        }
        setTelefoneFeedback({ message: 'Continue digitando...', type: 'hint' });
        return false;
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
                        cep: response.data.cep || '',
                        cidade: response.data.cidade || '',
                        bairro: response.data.bairro || '',
                        uf: response.data.uf || '',
                    });
                    validateAndSetTelefoneFeedback(displayTelefone);
                } catch (err) {
                    setError('Não foi possível carregar os dados da empresa.');
                } finally {
                    setLoading(false);
                }
            } else {
                setEmpresa({ nome: '', cnpj: '', email: '', telefone: '', endereco: '', cep: '', cidade: '', bairro: '', uf: '' });
                validateAndSetTelefoneFeedback('');
            }
        };
        fetchEmpresa();
    }, [empresaId, isEditing, validateAndSetTelefoneFeedback]);

    const handleChange = async (e) => {
        const { name, value } = e.target;
        setEmpresa(prev => ({ ...prev, [name]: value }));

        if (name === 'telefone') {
            validateAndSetTelefoneFeedback(value);
        }

        // Consulta à ViaCEP quando o campo cep é alterado
        if (name === 'cep' && value.length === 8) {
            try {
                const response = await fetch(`https://viacep.com.br/ws/${value}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    setEmpresa(prev => ({
                        ...prev,
                        endereco: data.logradouro || '',
                        cidade: data.localidade || '',
                        bairro: data.bairro || '',
                        uf: data.uf || '',
                    }));
                } else {
                    setError('CEP não encontrado ou inválido.');
                }
            } catch (err) {
                setError('Erro ao consultar o CEP. Tente novamente.');
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const isTelefoneValid = validateAndSetTelefoneFeedback(empresa.telefone);
        if (!isTelefoneValid) {
            setError("Por favor, corrija o formato do telefone antes de salvar.");
            if (telefoneFeedback.type !== 'error') {
                setTelefoneFeedback(prev => ({ ...prev, type: 'error' }));
            }
            return;
        }
        setLoading(true);
        setError(null);

        const telefoneLimpoParaEnvio = empresa.telefone.replace(/\D/g, '');
        const payload = { ...empresa, telefone: telefoneLimpoParaEnvio };
        const url = isEditing ? `/api/empresas/${empresaId}/` : `/api/empresas/`;
        const method = isEditing ? 'put' : 'post';

        try {
            await axiosInstance[method](url, payload);
            navigate('/empresas');
        } catch (err) {
            const apiErrors = err.response?.data;
            if (apiErrors && typeof apiErrors === 'object') {
                const errorMessages = Object.entries(apiErrors).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`);
                setError(errorMessages.join(' | '));
            } else {
                setError('Ocorreu um erro inesperado ao salvar.');
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

    // Lista de UFs do Brasil (para o select)
    const ufs = [
        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 
        'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    ];

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
                        <InformationCircleIcon className="h-6 w-6"/>
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* --- Input de Nome --- */}
                    <div className="relative">
                        <label htmlFor="nome" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Nome da Empresa</label>
                        <BuildingOfficeIcon className="h-5 w-5 text-gray-400 absolute top-[2.4rem] left-3"/>
                        <input
                            type="text"
                            name="nome"
                            id="nome"
                            value={empresa.nome}
                            onChange={handleChange}
                            className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            required
                        />
                    </div>
                    
                    {/* --- Grid para CNPJ e Email --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">CNPJ</label>
                            <UserIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="text"
                                name="cnpj"
                                id="cnpj"
                                value={empresa.cnpj}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Email</label>
                            <EnvelopeIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="email"
                                name="email"
                                id="email"
                                value={empresa.email}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>
                    </div>

                    {/* --- Input de Telefone --- */}
                    <div className="relative">
                        <label htmlFor="telefone" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Telefone</label>
                        <PhoneIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                        <input
                            type="tel"
                            name="telefone"
                            id="telefone"
                            value={empresa.telefone}
                            onChange={handleChange}
                            className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            placeholder="(XX) XXXXX-XXXX"
                            aria-describedby="telefone-feedback-message"
                            required
                        />
                        {telefoneFeedback.message && (
                            <p id="telefone-feedback-message" className={`text-xs mt-2 ${getFeedbackColor()}`}>
                                {telefoneFeedback.message}
                            </p>
                        )}
                    </div>
                    
                    {/* --- Grid para Endereço, CEP, Cidade, Bairro e UF --- */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <label htmlFor="endereco" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Endereço</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="text"
                                name="endereco"
                                id="endereco"
                                value={empresa.endereco}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="cep" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">CEP</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="text"
                                name="cep"
                                id="cep"
                                value={empresa.cep}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                                placeholder="Ex.: 12345678"
                                maxLength="8"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="cidade" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Cidade</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="text"
                                name="cidade"
                                id="cidade"
                                value={empresa.cidade}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="bairro" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">Bairro</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <input
                                type="text"
                                name="bairro"
                                id="bairro"
                                value={empresa.bairro}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            />
                        </div>
                        <div className="relative">
                            <label htmlFor="uf" className="block text-sm font-medium text-gray-700 dark:text-indigo-300">UF</label>
                            <MapPinIcon className="h-5 w-5 text-gray-400 absolute top-10 left-3" />
                            <select
                                name="uf"
                                id="uf"
                                value={empresa.uf}
                                onChange={handleChange}
                                className="w-full mt-1 p-3 pl-10 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                            >
                                <option value="">Selecione uma UF</option>
                                {['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 
                                  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']
                                    .sort()
                                    .map(uf => (
                                        <option key={uf} value={uf}>{uf}</option>
                                    ))}
                            </select>
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