import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

const PrivateRoute = () => {
    // Verifica se os tokens de autenticação existem no localStorage
    const authTokens = localStorage.getItem('authTokens');

    // Se o token existe, renderiza a rota filha (usando <Outlet />).
    // Se não existe, redireciona o usuário para a página de login.
    return authTokens ? <Outlet /> : <Navigate to="/login" replace />;
};

export default PrivateRoute;