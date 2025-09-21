// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

// Layouts e Utilitários (caminhos a partir de src/)
import MainLayout from './layouts/MainLayout';
import PrivateRoute from './utils/PrivateRoute';

// Componentes e Páginas (caminhos a partir de src/)
import Navbar from './components/navbar';
import InicioPage from './components/InicioPage';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import HistoricoWhatsApp from './components/HistoricoWhatsapp';
import LoginPage from './components/LoginPage';
import FuncionarioList from './components/FuncionarioList';
import FuncionarioForm from './components/FuncionarioForm';
import GerarDasPage from './components/GerarDasPage';
import ConsultarExtratoPage from './components/ConsultarExtratoPage';
import GerenciamentoSimplesPage from './components/GerenciamentoSimplesPage';
import GerenciarAtribuicoesPage from './components/GerenciarAtribuicoesPage';
import DeclararDASPage from './components/DeclararDASPage';
import PendenciasPage from './components/PendenciasPage';

import './App.css';
import EmpresaGerenciamento from './components/EmpresaGerenciamento';

function App() {
  return (
    <Router>
      <Routes>
        {/* ROTA PÚBLICA: Renderiza a página de login em tela cheia, sem a Navbar */}
        <Route path="/login" element={<LoginPage />} />

        {/* ROTAS PROTEGIDAS: Todas as rotas aqui dentro usam o MainLayout (com a Navbar) e exigem login */}
        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<InicioPage />} />
            <Route path="/empresas" element={<EmpresaList />} />
            <Route path="/empresas/cadastrar" element={<EmpresaForm />} />
            <Route path="/empresas/gerenciar" element={<EmpresaGerenciamento />} />
            <Route path="/empresas/editar/:empresaId" element={<EmpresaForm />} />
            <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
            <Route path="/gerenciar-atribuicoes" element={<GerenciarAtribuicoesPage />} />

            <Route path="/gerenciar-usuarios" element={<FuncionarioList />} />
            <Route path="/gerenciar-usuarios/novo" element={<FuncionarioForm />} />
            <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<FuncionarioForm />} />
            
            <Route path="/gerenciamento/simples-nacional" element={<GerenciamentoSimplesPage />} />
            <Route path="/historico-whatsapp" element={<HistoricoWhatsApp />} />
            <Route path="/gerar-das" element={<GerarDasPage />} />
            <Route path="/consultar-extrato" element={<ConsultarExtratoPage />} />
            <Route path="/declarar-das" element={<DeclararDASPage />} />
            <Route path="/pendencias" element={<PendenciasPage />} />
            
            {/* Rota padrão para usuários logados */}
            <Route path="/" element={<EmpresaList />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;