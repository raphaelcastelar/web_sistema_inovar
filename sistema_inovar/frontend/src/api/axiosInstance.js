// src/api/axiosInstance.js
import axios from 'axios';
import { jwtDecode } from 'jwt-decode'; // Instale: npm install jwt-decode

const API_BASE_URL = 'http://192.168.196.162:8000';

let authTokens = localStorage.getItem('authTokens') ? JSON.parse(localStorage.getItem('authTokens')) : null;

const axiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        Authorization: `Bearer ${authTokens?.access}`
    }
});

axiosInstance.interceptors.request.use(async req => {
    // Pega os tokens do localStorage a cada requisição
    authTokens = localStorage.getItem('authTokens') ? JSON.parse(localStorage.getItem('authTokens')) : null;

    if (!authTokens) {
        req.headers.Authorization = null; // Garante que não envie header se não houver token
        return req;
    }

    const user = jwtDecode(authTokens.access);
    const isExpired = Date.now() >= user.exp * 1000;

    if (!isExpired) {
        req.headers.Authorization = `Bearer ${authTokens.access}`;
        return req;
    }

    // Se o token de acesso expirou, tenta renová-lo
    try {
        const response = await axios.post(`${API_BASE_URL}/api/token/refresh/`, {
            refresh: authTokens.refresh
        });

        localStorage.setItem('authTokens', JSON.stringify(response.data));
        req.headers.Authorization = `Bearer ${response.data.access}`;
        return req;
    } catch (error) {
        console.error("Erro ao renovar token", error);
        // Se a renovação falhar, desloga o usuário (ou redireciona para o login)
        localStorage.removeItem('authTokens');
        // Redirecionamento pode ser feito aqui
        // window.location.href = '/login';
    }
    return req;
});

export default axiosInstance;