import React, { useState } from 'react';
import { HomeIcon, UsersIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import LogoContabilidade from '../assets/logo_contabilidade.png';

const Navbar = () => {
  const [selectedItem, setSelectedItem] = useState('/'); // Estado para o item selecionado, padrão é '/'

  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col items-center py-8">
      {/* Imagem no topo */}
      <img
        src={LogoContabilidade}
        alt="Logo Contabilidade"
        className="h-24 w-auto max-w-48 object-contain mb-10"
      />
      {/* Itens da barra lateral */}
      <div className="w-full flex flex-col space-y-2">
        <Link
          to="/empresas"
          onClick={() => setSelectedItem('/empresas')}
          className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
            selectedItem === '/empresas' ? 'bg-indigo-800 text-white' : ''
          }`}
        >
          <HomeIcon className="h-7 w-7" />
          <span className="text-base font-medium">Início</span>
        </Link>
        <Link
          to="/empresas/cadastrar"
          onClick={() => setSelectedItem('/cadastrar')}
          className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
            selectedItem === '/cadastrar' ? 'bg-indigo-800 text-white' : ''
          }`}
        >
          <UsersIcon className="h-7 w-7" />
          <span className="text-base font-medium">Cadastrar</span>
        </Link>
        <Link
          to="/documentos"
          onClick={() => setSelectedItem('/documentos')}
          className={`flex items-center space-x-4 px-6 py-3 text-indigo-300 hover:bg-indigo-700 hover:text-white transition-all duration-300 w-full ${
            selectedItem === '/documentos' ? 'bg-indigo-800 text-white' : ''
          }`}
        >
          <DocumentTextIcon className="h-7 w-7" />
          <span className="text-base font-medium">Documentos</span>
        </Link>
      </div>
    </div>
  );
};

export default Navbar;