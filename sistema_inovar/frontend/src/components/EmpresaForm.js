import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
// Ícones opcionais para feedback visual (ex: usando Heroicons)
// import { CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';

const API_BASE_URL = 'http://192.168.196.162:8000/api';

const EmpresaForm = () => {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState({ nome: '', cnpj: '', email: '', telefone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // Erro geral do formulário
  const [telefoneFeedback, setTelefoneFeedback] = useState({ message: '', type: 'hint' });

  const validateAndSetTelefoneFeedback = useCallback((inputValue) => {
    const cleanedValue = inputValue.replace(/\D/g, ''); // Remove tudo que não for dígito

    if (!inputValue.trim()) {
      setTelefoneFeedback({ message: 'DDD + Número (10 ou 11 dígitos, ex: 22999998888).', type: 'hint' });
      return true; // Permite campo vazio (backend tratará 'required')
    }
    
    // CORREÇÃO DA EXPRESSÃO REGULAR AQUI:
    // Testa se o inputValue contém SOMENTE os caracteres permitidos (dígitos, espaços, parênteses, hífen)
    if (!/^[0-9\s()-]*$/.test(inputValue)) {
      setTelefoneFeedback({ message: "Telefone pode conter apenas números e formatação ( ), -.", type: 'error' });
      return false;
    }

    if (cleanedValue.length > 11) {
      setTelefoneFeedback({ message: "Telefone muito longo. Máx 11 dígitos (DDD+Número).", type: 'error' });
      return false;
    }
    
    if (cleanedValue.length > 0 && cleanedValue.length < 10) {
      setTelefoneFeedback({ message: "Telefone muito curto. Mín 10 dígitos (DDD+Número).", type: 'hint' });
      return false;
    }
    
    if (cleanedValue.length === 10 || cleanedValue.length === 11) {
      setTelefoneFeedback({ message: "Formato parece correto!", type: 'success' });
      return true;
    }
    
    setTelefoneFeedback({ message: 'Continue digitando DDD + Número (10 ou 11 dígitos).', type: 'hint' });
    return false;
  }, []);


  useEffect(() => {
    const fetchEmpresa = async () => {
      if (empresaId) {
        setLoading(true);
        setError(null);
        try {
          const response = await axios.get(`${API_BASE_URL}/empresas/${empresaId}/`);
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
          });
          validateAndSetTelefoneFeedback(displayTelefone);
        } catch (err) {
          console.error('Erro ao carregar empresa:', err);
          let specificError = 'Erro ao carregar dados da empresa.';
          if (err.response && err.response.data) {
            if (typeof err.response.data.detail === 'string') {
              specificError = err.response.data.detail;
            } else if (typeof err.response.data === 'string') {
              specificError = err.response.data;
            } else if (err.response.status === 404) {
              specificError = "Empresa não encontrada.";
            }
          } else if (err.message) {
            specificError = err.message;
          }
          setError(specificError);
        } finally {
          setLoading(false);
        }
      } else {
        setEmpresa({ nome: '', cnpj: '', email: '', telefone: '' });
        validateAndSetTelefoneFeedback(''); 
      }
    };
    fetchEmpresa();
  }, [empresaId, validateAndSetTelefoneFeedback]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEmpresa(prev => ({ ...prev, [name]: value }));

    if (name === 'telefone') {
      validateAndSetTelefoneFeedback(value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null); 
    setTelefoneFeedback({ message: '', type: 'hint' }); // Limpa feedback do telefone antes de submeter

    const telefoneLimpoParaEnvio = empresa.telefone.replace(/\D/g, '');

    if (!(telefoneLimpoParaEnvio.length === 10 || telefoneLimpoParaEnvio.length === 11)) {
      setTelefoneFeedback({message: "Formato de telefone inválido. Forneça DDD + Número (10 ou 11 dígitos) antes de salvar.", type: 'error'});
      setLoading(false);
      return;
    }

    const payload = {
      ...empresa,
      telefone: telefoneLimpoParaEnvio,
    };

    const url = empresaId ? `${API_BASE_URL}/empresas/${empresaId}/` : `${API_BASE_URL}/empresas/`;
    const method = empresaId ? 'put' : 'post';

    try {
      await axios[method](url, payload); // Removido 'response =' pois não estava sendo usado diretamente
      // console.log('Empresa salva:', response.data);
      navigate('/empresas');
    } catch (err) {
      console.error('Erro ao salvar empresa:', err.response || err.message);
      if (err.response && err.response.data) {
        const apiErrors = err.response.data;
        let generalErrorMessage = "Erro ao salvar: ";
        let phoneErrorSet = false;

        if (typeof apiErrors === 'object' && apiErrors !== null) {
          if (apiErrors.telefone) {
            const phoneErrorMsg = Array.isArray(apiErrors.telefone) ? apiErrors.telefone.join(' ') : String(apiErrors.telefone);
            setTelefoneFeedback({ message: phoneErrorMsg, type: 'error' });
            phoneErrorSet = true;
          }
          
          const otherErrorMessages = [];
          for (const key in apiErrors) {
            if (key !== 'telefone' && apiErrors.hasOwnProperty(key)) { // Corrigido hasOwnProperty
              otherErrorMessages.push(`${key}: ${Array.isArray(apiErrors[key]) ? apiErrors[key].join(', ') : String(apiErrors[key])}`);
            }
          }

          if (otherErrorMessages.length > 0) {
            generalErrorMessage += otherErrorMessages.join('; ');
            setError(generalErrorMessage);
          } else if (!phoneErrorSet) { // Nenhum erro específico de telefone ou outros campos, mas ainda um objeto de erro
             setError("Erro ao salvar. Verifique os dados fornecidos.");
          } else if (otherErrorMessages.length === 0 && phoneErrorSet) {
            // Se só houve erro de telefone, não precisa setar o erro geral, pois já está no telefoneFeedback
            setError(null);
          }

        } else if (typeof apiErrors === 'string') {
          setError(apiErrors);
        } else {
          setError('Erro desconhecido ao salvar. Tente novamente.');
        }
      } else {
        setError('Erro de conexão ou resposta inesperada do servidor.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate('/empresas');
  };

  const getFeedbackColor = () => {
    if (telefoneFeedback.type === 'error') return 'text-red-500';
    if (telefoneFeedback.type === 'success') return 'text-green-500';
    return 'text-gray-400';
  };

  return (
    <div className="p-6 bg-gray-900 min-h-screen text-gray-100">
      <div className="max-w-2xl mx-auto bg-gray-800 p-8 rounded-xl shadow-2xl">
        <h2 className="text-3xl font-bold text-indigo-400 mb-8 text-center">
          {empresaId ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
        </h2>
        
        {error && (
          <div className="bg-red-800 border border-red-700 text-red-200 px-4 py-3 rounded relative mb-6" role="alert">
            <strong className="font-bold">Erro!</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="nome" className="block text-sm font-medium text-indigo-300 mb-1">Nome da Empresa</label>
            <input
              type="text"
              name="nome"
              id="nome"
              value={empresa.nome}
              onChange={handleChange}
              className="w-full p-3 bg-gray-700 text-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border-gray-600"
              required
            />
          </div>
          <div>
            <label htmlFor="cnpj" className="block text-sm font-medium text-indigo-300 mb-1">CNPJ</label>
            <input
              type="text"
              name="cnpj"
              id="cnpj"
              value={empresa.cnpj}
              onChange={handleChange}
              className="w-full p-3 bg-gray-700 text-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border-gray-600"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-indigo-300 mb-1">Email</label>
            <input
              type="email"
              name="email"
              id="email"
              value={empresa.email}
              onChange={handleChange}
              className="w-full p-3 bg-gray-700 text-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border-gray-600"
              required
            />
          </div>
          <div>
            <label htmlFor="telefone" className="block text-sm font-medium text-indigo-300 mb-1">Telefone</label>
            <input
              type="tel"
              name="telefone"
              id="telefone"
              value={empresa.telefone}
              onChange={handleChange}
              className="w-full p-3 bg-gray-700 text-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border-gray-600"
              placeholder="(XX) XXXXX-XXXX ou XXXXXXXXXXX"
              aria-describedby="telefone-feedback-message"
              required
            />
            {telefoneFeedback.message && (
              <p id="telefone-feedback-message" className={`text-xs mt-1 ${getFeedbackColor()}`}>
                {/* Exemplo de como adicionar ícones (opcional) */}
                {/* {telefoneFeedback.type === 'error' && <ExclamationCircleIcon className="h-4 w-4 inline mr-1 align-text-bottom" />} */}
                {/* {telefoneFeedback.type === 'success' && <CheckCircleIcon className="h-4 w-4 inline mr-1 align-text-bottom" />} */}
                {telefoneFeedback.message}
              </p>
            )}
          </div>
          
          {loading && <p className="text-indigo-400 text-center my-4 animate-pulse">Salvando dados...</p>}

          <div className="flex items-center justify-end space-x-4 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-3 bg-gray-600 text-white rounded-md hover:bg-gray-500 transition-colors duration-150 ease-in-out"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-in-out"
              disabled={loading}
            >
              {loading ? 'Salvando...' : (empresaId ? 'Atualizar Empresa' : 'Cadastrar Empresa')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EmpresaForm;