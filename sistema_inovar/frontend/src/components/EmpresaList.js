import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { PencilIcon, TrashIcon, PlusIcon, FolderIcon } from '@heroicons/react/24/outline';

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
    <div>
      <div className="mb-6 flex items-center space-x-4">
        <input
          type="text"
          placeholder="Buscar empresas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="p-3 w-full bg-gray-800 text-white rounded-lg shadow-inner focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all duration-300"
        />
        <Link to="/cadastrar" className="p-3 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition-all duration-300 flex items-center space-x-2">
          <PlusIcon className="h-6 w-6" />
          <span>Criar Nova Empresa</span>
        </Link>
      </div>
      <div className="grid gap-4">
        {filteredEmpresas.length === 0 ? (
          <p className="text-gray-400 text-center">Nenhuma empresa encontrada.</p>
        ) : (
          filteredEmpresas.map(empresa => (
            <div
              key={empresa.id}
              className="p-4 bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-300 flex justify-between items-center"
            >
              <div>
                <h3 className="text-lg font-semibold text-indigo-200">{empresa.nome}</h3>
                <p className="text-gray-400">CNPJ: {empresa.cnpj}</p>
                <p className="text-gray-400">Email: {empresa.email}</p>
              </div>
              <div className="flex space-x-3">
                <Link to={`/cadastrar/${empresa.id}`} className="text-indigo-400 hover:text-indigo-300 transition-colors duration-200">
                  <PencilIcon className="h-6 w-6" />
                </Link>
                <button onClick={() => handleDelete(empresa.id)} className="text-red-400 hover:text-red-300 transition-colors duration-200">
                  <TrashIcon className="h-6 w-6" />
                </button>
                <Link to={`/empresas/${empresa.id}/pastas`} className="text-green-400 hover:text-green-300 transition-colors duration-200">
                  <FolderIcon className="h-6 w-6" />
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default EmpresaList;