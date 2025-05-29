import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import PastaManager from './components/PastaManager';
import './App.css';

function App() {
  const handleSave = () => {
    window.location.href = '/';
  };

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-white flex">
        <Navbar />
        <div className="flex-1 pl-56 p-6">
          <Routes>
            <Route path="/" element={<EmpresaList />} />
            <Route path="/cadastrar/:id?" element={<EmpresaForm onSave={handleSave} />} />
            <Route path="/empresas/:empresaId/pastas" element={<PastaManager />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;