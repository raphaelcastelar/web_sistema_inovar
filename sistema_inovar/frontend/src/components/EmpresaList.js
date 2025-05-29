import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

const EmpresaList = () => {
  const [empresas, setEmpresas] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get('http://127.0.0.1:8000/api/empresas/')
      .then(response => setEmpresas(response.data))
      .catch(error => console.error('Erro ao carregar empresas:', error));
  }, []);

  const handleDelete = (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
      axios.delete(`http://127.0.0.1:8000/api/empresas/${id}/`)
        .then(() => {
          setEmpresas(empresas.filter(empresa => empresa.id !== id));
          console.log('Empresa excluída');
        })
        .catch(error => console.error('Erro ao excluir empresa:', error));
    }
  };

  const filteredEmpresas = empresas.filter(empresa =>
    empresa.nome.toLowerCase().includes(search.toLowerCase()) ||
    empresa.cnpj.includes(search) ||
    empresa.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar empresas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-2 mb-2 w-full bg-gray-700 text-white rounded"
        />
        <Link to="/cadastrar" className="p-2 bg-green-600 text-white rounded inline-block">
          <PlusIcon className="h-6 w-6 inline-block" /> Criar Nova Empresa
        </Link>
      </div>
      <ul className="bg-gray-700 rounded">
        {filteredEmpresas.map(empresa => (
          <li key={empresa.id} className="p-2 hover:bg-gray-600 flex justify-between items-center">
            <span>{empresa.nome} ({empresa.cnpj})</span>
            <div>
              <Link to={`/cadastrar/${empresa.id}`} className="text-blue-400 mr-2">
                <PencilIcon className="h-5 w-5 inline-block" />
              </Link>
              <button onClick={() => handleDelete(empresa.id)} className="text-red-400">
                <TrashIcon className="h-5 w-5 inline-block" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EmpresaList;