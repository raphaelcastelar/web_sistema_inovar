import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/navbar';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import './App.css';

function App() {
  const handleSave = () => {
    window.location.href = '/'; // Redireciona para a lista após salvar
  };

  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white flex">
        <Navbar />
        <div className="flex-1 pl-48">
          <div className="p-4">
            <Routes>
              <Route path="/" element={<EmpresaList />} />
              <Route path="/cadastrar/:id?" element={<EmpresaForm onSave={handleSave} />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;