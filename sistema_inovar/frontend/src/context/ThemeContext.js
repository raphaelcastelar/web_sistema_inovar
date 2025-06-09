// src/context/ThemeContext.js
import React, { createContext, useState, useEffect } from 'react';
import axiosInstance from '../api/axiosInstance'; // Importe o axios
import { jwtDecode } from 'jwt-decode'; // Importe jwt-decode

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // 1. O padrão é 'light', mas tentamos ler do localStorage.
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

    useEffect(() => {
        const root = window.document.documentElement; // A tag <html>
        
        // Remove a classe antiga e adiciona a nova
        root.classList.remove(theme === 'light' ? 'dark' : 'light');
        root.classList.add(theme);

        // Salva a preferência no localStorage para persistir entre sessões
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);

        // Salva no banco de dados para o usuário logado
        const authTokens = localStorage.getItem('authTokens') ? JSON.parse(localStorage.getItem('authTokens')) : null;
        if (authTokens) {
            const user = jwtDecode(authTokens.access);
            // Faz uma requisição PATCH para atualizar apenas o campo do tema
            axiosInstance.patch(`/api/funcionarios/${user.user_id}/`, { theme: newTheme })
                .catch(err => console.error("Falha ao salvar preferência de tema:", err));
        }
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export default ThemeContext;