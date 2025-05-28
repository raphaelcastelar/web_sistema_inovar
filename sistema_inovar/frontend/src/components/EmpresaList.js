import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EmpresaList = () => {
  const [empresas, setEmpresas] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    axios.get('http://localhost:8000/api/empresas/')
      .then(response => setEmpresas(response.data))
      .catch(error => console.error('Erro ao carregar empresas:', error));
  }, []);

  const filteredEmpresas = empresas.filter(empresa =>
    empresa.nome.toLowerCase().includes(search.toLowerCase()) ||
    empresa.cnpj.includes(search) ||
    empresa.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4">
      <input
        type="text"
        placeholder="Buscar empresas..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full p-2 mb-4 bg-gray-700 text-white rounded"
      />
      <ul className="bg-gray-700 rounded">
        {filteredEmpresas.map(empresa => (
          <li key={empresa.id} className="p-2 hover:bg-gray-600 cursor-pointer">
            {empresa.nome} ({empresa.cnpj})
          </li>
        ))}
      </ul>
    </div>
  );
};

export default EmpresaList;