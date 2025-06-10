// src/layouts/MainLayout.js
import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/navbar'; // Ajuste o caminho se necessário

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white flex">
      <Navbar />
      {/* O <Outlet/> é um placeholder onde o React Router irá renderizar a página da rota atual (ex: EmpresaList) */}
      <main className="flex-1 ml-56 p-6 bg-gray-100 dark:bg-gray-900 transition-colors duration-300">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;