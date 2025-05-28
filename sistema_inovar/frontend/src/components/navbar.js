import React from 'react';
import { HomeIcon, UsersIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const Navbar = () => {
  return (
    <nav className="bg-gray-800 p-4 flex justify-between items-center">
      <div className="flex space-x-4">
        <Link to="/" className="text-white hover:bg-blue-600 p-2 rounded">
          <HomeIcon className="h-6 w-6" />
        </Link>
        <Link to="/cadastrar" className="text-white hover:bg-blue-600 p-2 rounded">
          <UsersIcon className="h-6 w-6" />
        </Link>
        <Link to="/documentos" className="text-white hover:bg-blue-600 p-2 rounded">
          <DocumentTextIcon className="h-6 w-6" />
        </Link>
      </div>
      <div className="text-white font-bold">Gestão Contábil</div>
    </nav>
  );
};

export default Navbar;