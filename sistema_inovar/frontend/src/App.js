import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

// Layouts e Utilitários
import MainLayout from './layouts/MainLayout'; // <-- 1. Importe o novo layout
import PrivateRoute from './utils/PrivateRoute'; // Importe sua rota protegida

// Suas Páginas e Componentes
import LoginPage from './components/LoginPage';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import HistoricoWhatsApp from './components/HistoricoWhatsapp';
import FuncionarioList from './components/FuncionarioList';
import FuncionarioForm from './components/FuncionarioForm';
import GerarDasPage from './pages/GerarDasPage'; // Ajuste o caminho se necessário

import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* ROTA PÚBLICA: Renderiza a página de login sem a Navbar */}
        <Route path="/login" element={<LoginPage />} />

        {/* ROTAS PROTEGIDAS: Todas as rotas aqui dentro exigem login */}
        <Route element={<PrivateRoute />}>
          {/* O MainLayout aplica a Navbar e o estilo principal a todas as rotas filhas */}
          <Route element={<MainLayout />}>
            <Route path="/empresas" element={<EmpresaList />} />
            <Route path="/empresas/cadastrar" element={<EmpresaForm />} />
            <Route path="/empresas/editar/:empresaId" element={<EmpresaForm />} />
            <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
            
            <Route path="/gerenciar-usuarios" element={<FuncionarioList />} />
            <Route path="/gerenciar-usuarios/novo" element={<FuncionarioForm />} />
            <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<FuncionarioForm />} />
            
            <Route path="/historico-whatsapp" element={<HistoricoWhatsApp />} />
            <Route path="/gerar-das" element={<GerarDasPage />} />
            <Route path="/consultar-extrato" element={<ConsultarExtratoPage />} /> {/* Supondo que você tenha esta página */}
            
            {/* Rota padrão para usuários logados */}
            <Route path="/" element={<EmpresaList />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;