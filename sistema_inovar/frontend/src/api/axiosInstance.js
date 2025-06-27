// src/api/axiosInstance.js
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

// Endereço base da sua API Django
const baseURL = 'http://192.168.196.162:8000'; 

const axiosInstance = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
});

// --- O Interceptor: A PARTE MAIS IMPORTANTE ---
// Este código é executado ANTES de cada requisição ser enviada.
axiosInstance.interceptors.request.use(
    async (config) => {
        // 1. Pega os tokens do localStorage
        const authTokens = localStorage.getItem('authTokens')
            ? JSON.parse(localStorage.getItem('authTokens'))
            : null;

        if (!authTokens) {
            // Se não houver tokens, a requisição segue sem autenticação
            return config;
        }

        // 2. Verifica se o token de acesso expirou
        const accessToken = authTokens.access;
        const decodedToken = jwtDecode(accessToken);
        const isExpired = decodedToken.exp * 1000 < Date.now();

        if (!isExpired) {
            // 3. Se NÃO expirou, anexa o token ao cabeçalho e envia a requisição
            config.headers.Authorization = `Bearer ${accessToken}`;
            return config;
        }

        // 4. Se o token EXPIROU, tenta renová-lo
        try {
            console.log('Token de acesso expirado, tentando renovar...');
            const response = await axios.post(`${baseURL}/api/token/refresh/`, {
                refresh: authTokens.refresh,
            });

            // 5. Salva os novos tokens no localStorage
            const newAuthTokens = response.data;
            localStorage.setItem('authTokens', JSON.stringify(newAuthTokens));

            // 6. Anexa o NOVO token de acesso ao cabeçalho da requisição original
            config.headers.Authorization = `Bearer ${newAuthTokens.access}`;
            console.log('Token renovado com sucesso.');
            return config;

        } catch (refreshError) {
            // 7. Se a renovação falhar (ex: refresh token também expirou), limpa tudo e redireciona para o login
            console.error('Falha ao renovar o token. Redirecionando para o login.', refreshError);
            localStorage.removeItem('authTokens');
            // Redireciona para a página de login de forma segura
            window.location.href = '/login'; 
            return Promise.reject(refreshError);
        }
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default axiosInstance;