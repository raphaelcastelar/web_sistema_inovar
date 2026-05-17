// src/layouts/MainLayout.js
import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/navbar'; // Ajuste o caminho se necessário

const MainLayout = () => {
  return (
    <div className="min-h-screen bg-gray-100 text-white dark:bg-gray-900">
      <Navbar />
      {/* O <Outlet/> é um placeholder onde o React Router irá renderizar a página da rota atual (ex: EmpresaList) */}
      <main className="min-h-screen w-full bg-gray-100 p-4 pt-20 transition-colors duration-300 dark:bg-gray-900 sm:p-6 sm:pt-24 lg:ml-64 lg:w-[calc(100%-16rem)] lg:pt-6">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;
