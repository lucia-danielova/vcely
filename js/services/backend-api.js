const TOKEN_KEY = 'agrogis_api_token_v1';

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch (error) {
    error.status = 0;
    throw error;
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.details || payload.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload.error;
    throw error;
  }
  return payload;
}

function persistSession(payload) {
  if (payload?.token) localStorage.setItem(TOKEN_KEY, payload.token);
  return payload?.user || null;
}

export const backendApi = {
  async register(user) {
    return persistSession(await request('/auth/register', { method: 'POST', body: JSON.stringify(user) }));
  },
  async login(email, password) {
    return persistSession(await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }));
  },
  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem(TOKEN_KEY);
    }
  },
  async getCurrentUser() {
    if (!localStorage.getItem(TOKEN_KEY)) return null;
    const result = await request('/users/me');
    return result.user || null;
  },
  async verifyEntity(ico) {
    const result = await request('/registry/verify-entity', { method: 'POST', body: JSON.stringify({ ico }) });
    return result.entity || null;
  },
  async searchEntities(query) {
    const result = await request(`/registry/entities?q=${encodeURIComponent(query)}`);
    return result.entities || [];
  },
  async saveParcel(parcel) {
    return request('/parcels/save', { method: 'POST', body: JSON.stringify(parcel) });
  },
  async getParcels() {
    const result = await request('/parcels');
    return result.parcels || [];
  },
  isUnavailable(error) {
    return !error.status || error.status >= 500;
  }
};
