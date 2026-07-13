// auth.js — Módulo de autenticação
// Access token armazenado em memória (nunca em localStorage/sessionStorage)
// Refresh token fica em cookie httpOnly (gerenciado pelo servidor)

const Auth = (() => {
  let accessToken = null;

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
        return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  }

  async function authFetch(url, options = {}) {
    const headers = { ...options.headers, 'Authorization': `Bearer ${accessToken}` };
    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && accessToken) {
      const refreshed = await refreshSession();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        response = await fetch(url, { ...options, headers });
      }
    }

    if (response.status === 401) {
      clearSession();
      window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
      throw new Error('Sessão expirada');
    }

    return response;
  }

  function clearSession() {
    accessToken = null;
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
