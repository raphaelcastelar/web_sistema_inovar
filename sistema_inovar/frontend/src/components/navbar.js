import React from 'react';
import { HomeIcon, UsersIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import LogoContabilidade from '../assets/logo_contabilidade.png'; // Importação direta

const Navbar = () => {
  return (
    <div className="fixed left-0 top-0 h-full w-56 bg-gradient-to-b from-indigo-900 to-gray-800 shadow-xl flex flex-col items-center py-8 space-y-10">
      {/* Imagem no lugar do título */}
      <img
        src={LogoContabilidade}
        alt="Logo Contabilidade"
        className="h-24 w-auto max-w-48 object-contain mb-10"
      />
      {/* Botões */}
      <Link to="/" className="text-indigo-300 hover:text-white hover:bg-indigo-700 p-3 rounded-full transition-all duration-300 transform hover:scale-110">
        <HomeIcon className="h-9 w-9" />
      </Link>
      <Link to="/cadastrar" className="text-indigo-300 hover:text-white hover:bg-indigo-700 p-3 rounded-full transition-all duration-300 transform hover:scale-110">
        <UsersIcon className="h-9 w-9" />
      </Link>
      <Link to="/documentos" className="text-indigo-300 hover:text-white hover:bg-indigo-700 p-3 rounded-full transition-all duration-300 transform hover:scale-110">
        <DocumentTextIcon className="h-9 w-9" />
      </Link>
    </div>
  );
};

export default Navbar;