import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/navbar';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import HistoricoWhatsApp from './components/HistoricoWhatsapp'
import LoginPage from './components/LoginPage';
import FuncionarioList from './components/FuncionarioList';
import FuncionarioForm from './components/FuncionarioForm';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white flex">
        <Navbar />
        <div className="flex-1 pl-56 p-6">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/empresas" element={<EmpresaList />} />
            <Route path="/empresas/cadastrar" element={<EmpresaForm />} />
            <Route path="/empresas/editar/:empresaId" element={<EmpresaForm />} />
            <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
            <Route path="/historico-whatsapp" element={<HistoricoWhatsApp />} />
            <Route path="/gerenciar-usuarios" element={<FuncionarioList />} />
            <Route path="/gerenciar-usuarios/novo" element={<FuncionarioForm />} />
            <Route path="/gerenciar-usuarios/editar/:funcionarioId" element={<FuncionarioForm />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;