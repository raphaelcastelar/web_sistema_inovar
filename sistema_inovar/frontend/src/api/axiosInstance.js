// src/api/axiosInstance.js
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

// Endereço base da sua API Django
const baseURL = 'http://192.168.196.162:8000'; 

const axiosInstance = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
});

const getStoredTokens = () => {
    if (typeof window === 'undefined') return null;

    try {
        const storedTokens = localStorage.getItem('authTokens');
        return storedTokens ? JSON.parse(storedTokens) : null;
    } catch (error) {
        console.warn('Falha ao ler tokens salvos. Limpando armazenamento local.', error);
        localStorage.removeItem('authTokens');
        return null;
    }
};

const saveTokens = (nextTokens) => {
    if (typeof window === 'undefined' || !nextTokens?.access) return null;

    const currentTokens = getStoredTokens();
    const mergedTokens = {
        ...currentTokens,
        ...nextTokens,
        refresh: nextTokens.refresh || currentTokens?.refresh,
    };

    localStorage.setItem('authTokens', JSON.stringify(mergedTokens));
    return mergedTokens;
};

const refreshAccessToken = async () => {
    const authTokens = getStoredTokens();
    const refresh = authTokens?.refresh;

    if (!refresh) {
        throw new Error('Refresh token ausente.');
    }

    const response = await axios.post(`${baseURL}/api/token/refresh/`, { refresh });
    return saveTokens(response.data);
};

// Renovação automática para manter sessão ativa
const setupAutoRefresh = () => {
    if (typeof window === 'undefined') return;
    if (window.__axiosRefreshInterval) return;

    window.__axiosRefreshInterval = setInterval(async () => {
        try {
            const authTokens = getStoredTokens();
            const { access, refresh } = authTokens || {};
            if (!access || !refresh) return;

            let expiresInMs;
            try {
                const decoded = jwtDecode(access);
                expiresInMs = decoded.exp * 1000 - Date.now();
            } catch {
                expiresInMs = 0;
            }

            if (expiresInMs > 2 * 60 * 1000) return;

            await refreshAccessToken();
        } catch (err) {
            console.warn('Falha ao renovar token automaticamente. Tentará novamente.', err);
        }
    }, 60 * 1000);
};

setupAutoRefresh();

// --- O Interceptor: A PARTE MAIS IMPORTANTE ---
// Este código é executado ANTES de cada requisição ser enviada.
axiosInstance.interceptors.request.use(
    async (config) => {
        // 1. Pega os tokens do localStorage
        const authTokens = getStoredTokens();

        if (!authTokens) {
            // Se não houver tokens, a requisição segue sem autenticação
            return config;
        }

        // 2. Verifica se o token de acesso expirou
        const accessToken = authTokens.access;
        let isExpired = true;

        try {
            const decodedToken = jwtDecode(accessToken);
            isExpired = decodedToken.exp * 1000 < Date.now();
        } catch (decodeError) {
            console.warn('Token de acesso inválido. Tentando renovar antes da requisição.', decodeError);
        }

        if (!isExpired) {
            // 3. Se NÃO expirou, anexa o token ao cabeçalho e envia a requisição
            config.headers.Authorization = `Bearer ${accessToken}`;
            return config;
        }

        // 4. Se o token EXPIROU, tenta renová-lo
        try {
            console.log('Token de acesso expirado, tentando renovar...');
            const newAuthTokens = await refreshAccessToken();

            // 6. Anexa o NOVO token de acesso ao cabeçalho da requisição original
            config.headers.Authorization = `Bearer ${newAuthTokens.access}`;
            console.log('Token renovado com sucesso.');
            return config;

        } catch (refreshError) {
            // 7. Se a renovação falhar, mantemos a sessão e apenas propagamos o erro.
            // O usuário só será desconectado ao clicar em "Sair".
            console.error('Falha ao renovar o token. Mantendo sessão atual.', refreshError);
            return Promise.reject(refreshError);
        }
    },
    (error) => {
        return Promise.reject(error);
    }
);

export default axiosInstance;
