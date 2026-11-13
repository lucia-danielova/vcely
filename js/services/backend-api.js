const TOKEN_KEY = 'agrogis_api_token_v1';

// On same-origin deployments the API lives at /api. On static hosting
// (GitHub Pages) there is no backend, so cross-origin calls go to the
// deployed Render API; override with ?api=<url> or localStorage agrogis_api_base.
const RENDER_API_BASE = 'https://agrogis-app.onrender.com/api';

function getApiBase() {
  const location = globalThis.location;
  if (location && /^https?:$/.test(location.protocol)) {
    const override = new URLSearchParams(location.search).get('api');
    if (override) return `${override.replace(/\/+$/, '')}/api`;
    const sameOrigin = `${location.origin}/api`;
    if (!location.hostname.endsWith('github.io')) return sameOrigin;
    const storage = getStorage();
    const stored = storage ? storage.getItem('agrogis_api_base') : null;
    return stored ? `${stored.replace(/\/+$/, '')}/api` : RENDER_API_BASE;
  }
  return RENDER_API_BASE;
}

const API_BASE = getApiBase();

function getStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function readToken() {
  const storage = getStorage();
  return storage ? storage.getItem(TOKEN_KEY) : null;
}

function writeToken(token) {
  const storage = getStorage();
  if (token && storage) storage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  const storage = getStorage();
  if (storage) storage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && options.body !== null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (error) {
    error.status = 0;
    throw error;
  }

  let payload = {};
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        const error = new Error(`Invalid JSON response from API (HTTP ${response.status})`, { cause });
        error.status = response.status;
        error.code = 'INVALID_RESPONSE';
        throw error;
      }
    }
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
  if (payload?.token) writeToken(payload.token);
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
      clearToken();
    }
  },
  async getCurrentUser() {
    if (!readToken()) return null;
    const result = await request('/users/me');
    return result.user || null;
  },
  async updateCurrentUser(payload) {
    const result = await request('/users/me', { method: 'PATCH', body: JSON.stringify(payload) });
    return result.user || null;
  },
  async deleteCurrentUser() {
    try {
      return await request('/users/me', { method: 'DELETE' });
    } finally {
      clearToken();
    }
  },
  async verifyEntity(ico) {
    const result = await request('/registry/verify-entity', { method: 'POST', body: JSON.stringify({ ico }) });
    return result.entity || null;
  },
  async searchEntities(query) {
    const result = await request(`/registry/entities?q=${encodeURIComponent(query)}`);
    return result.entities || [];
  },
  async getLpisParcels(lpisId) {
    const suffix = lpisId ? `?lpisId=${encodeURIComponent(lpisId)}` : '';
    const result = await request(`/registry/lpis${suffix}`);
    return result.parcels || [];
  },
  async saveHive(hive) {
    const result = await request('/hives', { method: 'POST', body: JSON.stringify(hive) });
    return result.hiveId || null;
  },
  async getMyHives() {
    const result = await request('/hives/mine');
    return result.hives || [];
  },
  async reportSprayAlert(alert) {
    return request('/spray-alerts', { method: 'POST', body: JSON.stringify(alert) });
  },
  async getMySprayAlerts() {
    const result = await request('/spray-alerts/mine');
    return result.alerts || [];
  },
  async setSprayAlertStatus(alertId, status) {
    return request(`/spray-alerts/${encodeURIComponent(alertId)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
  },
  async getParcelsByIco(ico) {
    return request(`/parcels/by-ico/${encodeURIComponent(ico)}`);
  },
  async getMapParcels(bbox) {
    return request(`/map/parcels?bbox=${encodeURIComponent(bbox.join(','))}`);
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
