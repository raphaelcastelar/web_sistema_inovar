// src/layouts/MainLayout.js
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Navbar from '../components/navbar'; // Ajuste o caminho se necessário
import { PageAccessProvider } from '../context/PageAccessContext';

const MainLayout = () => {
  const isDashboard = useLocation().pathname === '/dashboard';
  return (
    <PageAccessProvider>
      <div className={`min-h-screen text-white ${isDashboard ? 'bg-[#f7f9fd] dark:bg-[#0e1623]' : 'bg-gray-100 dark:bg-gray-900'}`}>
        <Navbar />
        {/* O <Outlet/> é um placeholder onde o React Router irá renderizar a página da rota atual (ex: EmpresaList) */}
        <main className={`min-h-screen w-full p-4 pt-20 transition-colors duration-300 sm:p-6 sm:pt-24 lg:ml-64 lg:w-[calc(100%-16rem)] lg:pt-6 ${isDashboard ? 'bg-[#f7f9fd] dark:bg-[#0e1623]' : 'bg-gray-100 dark:bg-gray-900'}`}>
          <Outlet />
        </main>
      </div>
    </PageAccessProvider>
  );
};

export default MainLayout;
