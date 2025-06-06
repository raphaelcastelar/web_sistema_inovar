import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

// Componentes e Páginas
import Navbar from './components/navbar';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import HistoricoWhatsApp from './components/HistoricoWhatsapp';
import LoginPage from './components/LoginPage';
import FuncionarioList from './components/FuncionarioList';
import FuncionarioForm from './components/FuncionarioForm';
import GerarDasPage from './components/GerarDasPage';


import PrivateRoute from './utils/PrivateRoute';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white flex">
        {/* A Navbar pode ser renderizada condicionalmente no futuro se desejar escondê-la na tela de login */}
        <Navbar />
        <div className="flex-1 pl-56 p-6">
          <Routes>
            {/* ROTA PÚBLICA: Qualquer um pode acessar a página de login */}
            <Route path="/login" element={<LoginPage />} />

            {/* ROTAS PROTEGIDAS: Apenas usuários logados podem acessar as rotas abaixo */}
            <Route element={<PrivateRoute />}>
              <Route path="/empresas" element={<EmpresaList />} />
              <Route path="/empresas/cadastrar" element={<EmpresaForm />} />
              <Route path="/empresas/editar/:empresaId" element={<EmpresaForm />} />
              <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
              
              <Route path="/historico-whatsapp" element={<HistoricoWhatsApp />} />

              <Route path="/gerenciar-usuarios" element={<FuncionarioList />} />
              <Route path="/gerenciar-usuarios/novo" element={<FuncionarioForm />} />
              <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<FuncionarioForm />} />
              
              {/* 3. NOVA ROTA PROTEGIDA PARA GERAR DAS */}
              <Route path="/gerar-das" element={<GerarDasPage />} />
              
              {/* Rota padrão para redirecionar usuários logados */}
              <Route path="/" element={<EmpresaList />} />
            </Route>
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;