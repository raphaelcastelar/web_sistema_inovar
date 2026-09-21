// src/App.js
import React from 'react';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';

// Layouts e Utilitários (caminhos a partir de src/)
import MainLayout from './layouts/MainLayout';
import PrivateRoute from './utils/PrivateRoute';

// Componentes e Páginas (caminhos a partir de src/)
import InicioPage from './components/InicioPage';
import CarteiraEmpresasPage from './components/CarteiraEmpresasPage';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import HistoricoWhatsApp from './components/HistoricoWhatsapp';
import LoginPage from './components/LoginPage';
import FuncionarioList from './components/FuncionarioList';
import FuncionarioForm from './components/FuncionarioForm';
import GerenciamentoSimplesPage from './components/GerenciamentoSimplesPage';
import GerenciarAtribuicoesPage from './components/GerenciarAtribuicoesPage';
import PendenciasPage from './components/PendenciasPage';
import GerenciamentoIntegrado from './components/GerenciamentoIntegrado';
import CentralDoSimples from './components/CentralDoSimples';
import CentralDctfWeb from './components/CentralDctfWeb';
import CentralParcelamentoSimples from './components/CentralParcelamentoSimples';
import BoletoMonitorPage from './components/BoletoMonitorPage';
import BoletosPorEmpresaPage from './components/BoletosPorEmpresaPage';
import InadimplenciaBoletosPage from './components/InadimplenciaBoletosPage';
import GerarProLaborePage from './components/GerarProLaborePage';
import CalculadoraHonorariosPage from './components/CalculadoraHonorariosPage';
import RelacaoFaturamentoPage from './components/RelacaoFaturamentoPage';
import RelatoriosPage from './components/RelatoriosPage';
import GerenciarPaginasPage from './components/GerenciarPaginasPage';
import { PageGate } from './context/PageAccessContext';

import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        {/* ROTA PÚBLICA: Renderiza a página de login em tela cheia, sem a Navbar */}
        <Route path="/login" element={<LoginPage />} />

        {/* ROTAS PROTEGIDAS: Todas as rotas aqui dentro usam o MainLayout (com a Navbar) e exigem login */}
        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<PageGate pageKey="dashboard"><InicioPage /></PageGate>} />
            <Route path="/carteira-empresas" element={<PageGate pageKey="carteira"><CarteiraEmpresasPage /></PageGate>} />
            <Route path="/empresas" element={<PageGate pageKey="empresas"><EmpresaList /></PageGate>} />
            <Route path="/empresas/cadastrar" element={<PageGate pageKey="empresas"><EmpresaForm /></PageGate>} />
            <Route path="/empresas/editar/:empresaId" element={<PageGate pageKey="empresas"><EmpresaForm /></PageGate>} />
            <Route path="/empresas/:empresaId/pastas" element={<PageGate pageKey="carteira"><PastaManager /></PageGate>} />
            <Route path="/gerenciar-atribuicoes" element={<PageGate pageKey="atribuicoes"><GerenciarAtribuicoesPage /></PageGate>} />

            <Route path="/gerenciar-usuarios" element={<PageGate pageKey="usuarios"><FuncionarioList /></PageGate>} />
            <Route path="/gerenciar-usuarios/novo" element={<PageGate pageKey="usuarios"><FuncionarioForm /></PageGate>} />
            <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<PageGate pageKey="usuarios"><FuncionarioForm /></PageGate>} />
            <Route path="/gerenciar-paginas" element={<PageGate pageKey="gerenciar_paginas"><GerenciarPaginasPage /></PageGate>} />

            <Route path="/gerenciamento/simples-nacional" element={<PageGate pageKey="gerenciamento_simples"><GerenciamentoSimplesPage /></PageGate>} />
            <Route path="/historico-whatsapp" element={<PageGate pageKey="historico_whatsapp"><HistoricoWhatsApp /></PageGate>} />
            <Route path="/central-simples" element={<PageGate pageKey="central_das"><CentralDoSimples /></PageGate>} />
            <Route path="/central-dctfweb" element={<PageGate pageKey="central_dctfweb"><CentralDctfWeb /></PageGate>} />
            <Route path="/parcelamento-simples" element={<PageGate pageKey="parcelamento_simples"><CentralParcelamentoSimples /></PageGate>} />
            <Route path="/gerar-das" element={<Navigate to="/central-simples" replace />} />
            <Route path="/consultar-extrato" element={<Navigate to="/central-simples" replace />} />
            <Route path="/monitor-boletos" element={<PageGate pageKey="monitor_boletos"><BoletoMonitorPage /></PageGate>} />
            <Route path="/boletos-por-empresa" element={<PageGate pageKey="boletos_empresa"><BoletosPorEmpresaPage /></PageGate>} />
            <Route path="/inadimplencia-boletos" element={<PageGate pageKey="inadimplencia"><InadimplenciaBoletosPage /></PageGate>} />
            <Route path="/gerar-pro-labore" element={<PageGate pageKey="pro_labore"><GerarProLaborePage /></PageGate>} />
            <Route path="/calculadora-honorarios" element={<PageGate pageKey="calculadora_honorarios"><CalculadoraHonorariosPage /></PageGate>} />
            <Route path="/relacao-faturamento" element={<PageGate pageKey="faturamento"><RelacaoFaturamentoPage /></PageGate>} />
            <Route path="/relatorios" element={<PageGate pageKey="relatorios"><RelatoriosPage /></PageGate>} />

            {/* Unified Management Route (Replaces separate pages) */}
            <Route path="/gerenciamento-integrado" element={<PageGate pageKey="honorarios"><GerenciamentoIntegrado /></PageGate>} />

            <Route path="/pendencias" element={<PageGate pageKey="pendencias"><PendenciasPage /></PageGate>} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
