// AUTH MODULE
const Auth = (() => {
  const TOKEN_KEY   = 'riddle_token';
  const USER_KEY    = 'riddle_user';
  const REFRESH_KEY = 'riddle_refresh';

  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUser  = () => JSON.parse(localStorage.getItem(USER_KEY) || 'null');

  const setSession = (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  };

  const clearSession = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_KEY);
  };

  const isLoggedIn = () => !!getToken();

  // Intenta renovar el access token usando el refresh token guardado.
  // Devuelve true si tuvo éxito, false si no hay refresh token o falló.
  const refreshSession = async () => {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;

    try {
      const response = await fetch(CONFIG.API_URL + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });

      if (!response.ok) { clearSession(); return false; }

      const data = await response.json();
      setSession(data.token, data.user);
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      return true;
    } catch {
      clearSession();
      return false;
    }
  };

  const apiFetch = async (endpoint, options = {}, isRetry = false) => {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const response = await fetch(CONFIG.API_URL + endpoint, { ...options, headers });
    const data = await response.json();

    // Si el token expiró, intentar renovarlo una vez y reintentar la llamada
    if (response.status === 401 && !isRetry) {
      const renewed = await refreshSession();
      if (renewed) return apiFetch(endpoint, options, true); // reintento con token nuevo
      // Si no se pudo renovar, limpiar sesión y recargar para ir al login
      clearSession();
      window.location.reload();
      return;
    }

    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setSession(data.token, data.user);
    // Guardar refresh token para poder renovar la sesión cuando expire
    if (data.refreshToken) localStorage.setItem(REFRESH_KEY, data.refreshToken);
    return data.user;
  };

  const register = async (username, email, password) => {
    await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
    return login(email, password);
  };

  const logout = async () => {
    try { await apiFetch('/auth/logout', { method: 'POST' }); } catch(e) {}
    clearSession();
  };

  return { getToken, getUser, isLoggedIn, refreshSession, login, register, logout, apiFetch };
})();