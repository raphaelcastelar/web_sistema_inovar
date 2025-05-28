import React, { useState } from 'react';
import axios from 'axios';

const EmpresaForm = () => {
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    email: '',
    telefone: '',
    flags: [] // Inclua o campo flags com valor padrão
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    axios.post('http://127.0.0.1:8000/api/empresas/', formData)
      .then(response => {
        console.log('Empresa criada:', response.data);
        // Atualize a lista de empresas ou redirecione
      })
      .catch(error => console.error('Erro ao criar empresa:', error));
  };

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <input
        type="text"
        name="nome"
        value={formData.nome}
        onChange={handleChange}
        placeholder="Nome"
        className="p-2 mb-2 w-full bg-gray-700 text-white rounded"
      />
      <input
        type="text"
        name="cnpj"
        value={formData.cnpj}
        onChange={handleChange}
        placeholder="CNPJ"
        className="p-2 mb-2 w-full bg-gray-700 text-white rounded"
      />
      <input
        type="email"
        name="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
        className="p-2 mb-2 w-full bg-gray-700 text-white rounded"
      />
      <input
        type="text"
        name="telefone"
        value={formData.telefone}
        onChange={handleChange}
        placeholder="Telefone"
        className="p-2 mb-2 w-full bg-gray-700 text-white rounded"
      />
      <button type="submit" className="p-2 bg-blue-600 text-white rounded">
        Criar Empresa
      </button>
    </form>
  );
};

export default EmpresaForm;