import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const EmpresaForm = ({ onSave }) => {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    email: '',
    telefone: '',
    flags: []
  });

  useEffect(() => {
    if (id) {
      axios.get(`http://127.0.0.1:8000/api/empresas/${id}/`)
        .then(response => {
          setFormData(response.data);
        })
        .catch(error => console.error('Erro ao carregar empresa:', error));
    } else {
      setFormData({ nome: '', cnpj: '', email: '', telefone: '', flags: [] });
    }
  }, [id]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const url = id
      ? `http://127.0.0.1:8000/api/empresas/${id}/`
      : 'http://127.0.0.1:8000/api/empresas/';
    const method = id ? 'put' : 'post';

    axios({ method, url, data: formData })
      .then(response => {
        console.log('Empresa salva:', response.data);
        onSave();
      })
      .catch(error => console.error('Erro ao salvar empresa:', error));
  };

  return (
    <div className="max-w-lg mx-auto p-6 bg-gray-800 rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold text-indigo-200 mb-6">
        {id ? 'Editar Empresa' : 'Nova Empresa'}
      </h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-gray-300 mb-1">Nome</label>
          <input
            type="text"
            name="nome"
            value={formData.nome}
            onChange={handleChange}
            placeholder="Nome da empresa"
            className="w-full p-3 bg-gray-700 text-white rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-1">CNPJ</label>
          <input
            type="text"
            name="cnpj"
            value={formData.cnpj}
            onChange={handleChange}
            placeholder="CNPJ"
            className="w-full p-3 bg-gray-700 text-white rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-1">Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            className="w-full p-3 bg-gray-700 text-white rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
          />
        </div>
        <div>
          <label className="block text-gray-300 mb-1">Telefone</label>
          <input
            type="text"
            name="telefone"
            value={formData.telefone}
            onChange={handleChange}
            placeholder="Telefone"
            className="w-full p-3 bg-gray-700 text-white rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
          />
        </div>
        <button
          type="submit"
          className="w-full p-3 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-all duration-300 transform hover:scale-105"
        >
          {id ? 'Atualizar' : 'Criar'}
        </button>
      </form>
    </div>
  );
};

export default EmpresaForm;