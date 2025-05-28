import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Navbar from './components/navbar';
import EmpresaList from './components/EmpresaList';
import EmpresaForm from './components/EmpresaForm';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white">
        <Navbar />
        <Routes>
          <Route path="/" element={<EmpresaList />} />
          <Route path="/cadastrar" element={<EmpresaForm />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;