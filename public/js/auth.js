// auth.js — Módulo de autenticação
// Access token armazenado em memória (nunca em localStorage/sessionStorage)
// Refresh token fica em cookie httpOnly (gerenciado pelo servidor)

const Auth = (() => {
  let accessToken = null;
  let refreshTimer = null;

  // Renova 1 minuto antes de expirar (15min - 1min = 14min)
  const REFRESH_BEFORE_EXPIRY_MS = 14 * 60 * 1000;

  function getAccessToken() {
    return accessToken;
  }

  function isAuthenticated() {
    return !!accessToken;
  }

  async function login(username, password) {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erro ao fazer login');
    }

    accessToken = data.access_token;
    scheduleRefresh();
    return data;
  }

  async function logout() {
    try {
      await fetch('/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
    } catch (_e) {
      // Ignora erro de rede no logout
    }

    clearSession();
    window.location.href = '/login.html';
  }

  async function checkSession() {
    // Se já tem token em memória, valida com /me
    if (accessToken) {
      try {
        const response = await fetch('/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (response.ok) return await response.json();
      } catch (_e) {
        /* continua pra tentar refresh */
      }
    }

    // Tenta refresh com o cookie httpOnly
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        const response = await fetch('/me', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        if (response.ok) return await response.json();
      } catch (_e) {
        /* ignora */
      }
    }

    return null;
  }

  async function refreshSession() {
    try {
      const response = await fetch('/refresh', { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        accessToken = data.access_token;
        scheduleRefresh();
        return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  async function authFetch(url, options = {}) {
    const headers = { ...options.headers, 'Authorization': `Bearer ${accessToken}` };
    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
      clearSession();
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      throw new Error('Sessão expirada');
    }

    return response;
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const success = await refreshSession();
      if (!success) {
        clearSession();
        window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      }
    }, REFRESH_BEFORE_EXPIRY_MS);
  }

  function clearSession() {
    accessToken = null;
    clearTimeout(refreshTimer);
  }

  return {
    getAccessToken,
    isAuthenticated,
    login,
    logout,
    checkSession,
    refreshSession,
    authFetch,
  };
})();
