// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

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
import GerarDasPage from './components/GerarDasPage';
import ConsultarExtratoPage from './components/ConsultarExtratoPage';
import GerenciamentoSimplesPage from './components/GerenciamentoSimplesPage';
import GerenciarAtribuicoesPage from './components/GerenciarAtribuicoesPage';
import PendenciasPage from './components/PendenciasPage';
import GerenciamentoIntegrado from './components/GerenciamentoIntegrado';
import CentralDoSimples from './components/CentralDoSimples';
import BoletoMonitorPage from './components/BoletoMonitorPage';
import BoletosPorEmpresaPage from './components/BoletosPorEmpresaPage';
import GerarProLaborePage from './components/GerarProLaborePage';
import CalculadoraHonorariosPage from './components/CalculadoraHonorariosPage';
import RelacaoFaturamentoPage from './components/RelacaoFaturamentoPage';

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
            <Route path="/" element={<InicioPage />} />
            <Route path="/carteira-empresas" element={<CarteiraEmpresasPage />} />
            <Route path="/empresas" element={<EmpresaList />} />
            <Route path="/empresas/cadastrar" element={<EmpresaForm />} />
            <Route path="/empresas/editar/:empresaId" element={<EmpresaForm />} />
            <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
            <Route path="/gerenciar-atribuicoes" element={<GerenciarAtribuicoesPage />} />

            <Route path="/gerenciar-usuarios" element={<FuncionarioList />} />
            <Route path="/gerenciar-usuarios/novo" element={<FuncionarioForm />} />
            <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<FuncionarioForm />} />

            <Route path="/gerenciamento/simples-nacional" element={<GerenciamentoSimplesPage />} />
            <Route path="/historico-whatsapp" element={<HistoricoWhatsApp />} />
            <Route path="/central-simples" element={<CentralDoSimples />} />
            <Route path="/gerar-das" element={<GerarDasPage />} />
            <Route path="/consultar-extrato" element={<ConsultarExtratoPage />} />
            <Route path="/monitor-boletos" element={<BoletoMonitorPage />} />
            <Route path="/boletos-por-empresa" element={<BoletosPorEmpresaPage />} />
            <Route path="/gerar-pro-labore" element={<GerarProLaborePage />} />
            <Route path="/calculadora-honorarios" element={<CalculadoraHonorariosPage />} />
            <Route path="/relacao-faturamento" element={<RelacaoFaturamentoPage />} />

            {/* Unified Management Route (Replaces separate pages) */}
            <Route path="/gerenciamento-integrado" element={<GerenciamentoIntegrado />} />

            <Route path="/pendencias" element={<PendenciasPage />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
