import React from 'react';
import { HomeIcon, UsersIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <div className="fixed left-0 top-0 h-full w-48 bg-gray-800 flex flex-col items-center py-6 space-y-8">
      {/* Título Gestão Contábil */}
      <div className="text-white text-xl font-bold mb-8">Gestão Contábil</div>
      {/* Botões */}
      <Link to="/" className="text-white hover:bg-blue-600 p-2 rounded">
        <HomeIcon className="h-8 w-8" />
      </Link>
      <Link to="/cadastrar" className="text-white hover:bg-blue-600 p-2 rounded">
        <UsersIcon className="h-8 w-8" />
      </Link>
      <Link to="/documentos" className="text-white hover:bg-blue-600 p-2 rounded">
        <DocumentTextIcon className="h-8 w-8" />
      </Link>
    </div>
  );
};

export default Navbar;