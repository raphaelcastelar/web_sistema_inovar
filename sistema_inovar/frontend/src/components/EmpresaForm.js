import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

const EmpresaForm = () => {
  const { empresaId } = useParams();
  const navigate = useNavigate();
  const [empresa, setEmpresa] = useState({ nome: '', cnpj: '', email: '', telefone: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log('URL atual:', window.location.href);
    console.log('empresaId capturado:', empresaId);
    if (empresaId) {
      setLoading(true);
      axios.get(`http://192.168.196.162:8000/api/empresas/${empresaId}/`)
        .then(response => {
          console.log('Dados recebidos da API:', response.data);
          const empresaData = {
            nome: response.data.nome || '',
            cnpj: response.data.cnpj || '',
            email: response.data.email || '',
            telefone: response.data.telefone || '',
          };
          console.log('Estado empresa atualizado:', empresaData);
          setEmpresa(empresaData);
        })
        .catch(error => {
          console.error('Erro ao carregar empresa:', error);
          if (error.response) {
            console.log('Detalhes do erro:', error.response.data);
            setError(`Erro ao carregar a empresa: ${error.response.status}`);
          } else if (error.request) {
            setError('Erro de conexão com o servidor.');
          } else {
            setError('Erro inesperado.');
          }
        })
        .finally(() => setLoading(false));
    } else {
      console.log('Nenhum empresaId fornecido, modo cadastro.');
    }
  }, [empresaId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEmpresa({ ...empresa, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    const url = empresaId ? `http://192.168.196.162:8000/api/empresas/${empresaId}/` : `http://127.0.0.1:8000/api/empresas/`;
    const method = empresaId ? 'put' : 'post';

    axios[method](url, empresa)
      .then(response => {
        console.log('Empresa salva:', response.data);
        navigate('/empresas');
      })
      .catch(error => {
        console.error('Erro ao salvar empresa:', error);
        if (error.response) {
          console.log('Detalhes:', error.response.data);
          setError('Erro ao salvar empresa.');
        } else {
          setError('Erro de conexão com o servidor.');
        }
      })
      .finally(() => setLoading(false));
  };

  const handleCancel = () => {
    navigate('/empresas');
  };

  console.log('Estado atual de empresa:', empresa);

  return (
    <div className="p-6">
      <h2 className="text-3xl font-bold text-indigo-200 mb-6">
        {empresaId ? 'Editar Empresa' : 'Cadastrar Empresa'}
      </h2>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-300 mb-4">Carregando...</p>}
      <form onSubmit={handleSubmit} className="bg-gray-800 p-6 rounded-lg shadow-lg">
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">Nome</label>
          <input
            type="text"
            name="nome"
            value={empresa.nome}
            onChange={handleChange}
            className="w-full p-2 bg-gray-700 text-white rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">CNPJ</label>
          <input
            type="text"
            name="cnpj"
            value={empresa.cnpj}
            onChange={handleChange}
            className="w-full p-2 bg-gray-700 text-white rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">Email</label>
          <input
            type="email"
            name="email"
            value={empresa.email}
            onChange={handleChange}
            className="w-full p-2 bg-gray-700 text-white rounded"
            required
          />
        </div>
        <div className="mb-4">
          <label className="block text-gray-300 mb-2">Telefone</label>
          <input
            type="text"
            name="telefone"
            value={empresa.telefone || ''}
            onChange={handleChange}
            className="w-full p-2 bg-gray-700 text-white rounded"
            placeholder="(XX) XXXXX-XXXX"
          />
        </div>
        <div className="flex space-x-2">
          <button
            type="submit"
            className="bg-indigo-500 text-white p-2 rounded hover:bg-indigo-600 disabled:bg-gray-500"
            disabled={loading}
          >
            {loading ? 'Salvando...' : empresaId ? 'Atualizar' : 'Cadastrar'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="bg-gray-500 text-white p-2 rounded hover:bg-gray-600"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
};

export default EmpresaForm;