import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';

const EmpresaForm = ({ onSave }) => {
  const { id } = useParams(); // Extrai o id da URL
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
          setFormData(response.data); // Preenche o formulário com os dados da empresa
        })
        .catch(error => console.error('Erro ao carregar empresa:', error));
    } else {
      // Reseta o formulário para criação se não houver id
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
        onSave(); // Atualiza a lista
      })
      .catch(error => console.error('Erro ao salvar empresa:', error));
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
        {id ? 'Atualizar' : 'Criar'}
      </button>
    </form>
  );
};

export default EmpresaForm;