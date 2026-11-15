const TOKEN_KEY = 'agrogis_api_token_v1';

// On same-origin deployments the API lives at /api. On static hosting
// (GitHub Pages) there is no backend, so cross-origin calls go to the
// deployed Render API; override with ?api=<url> or localStorage agrogis_api_base.
const RENDER_API_BASE = 'https://agrogis-app.onrender.com/api';
const REQUEST_TIMEOUT_MS = 12000;
const RETRY_DELAY_MS = 400;

function getApiBase() {
  const location = globalThis.location;
  if (location && /^https?:$/.test(location.protocol)) {
    const override = new URLSearchParams(location.search).get('api');
    if (override) return `${override.replace(/\/+$/, '')}/api`;
    const storage = getStorage();
    const stored = storage ? storage.getItem('agrogis_api_base') : null;
    const remoteBase = stored ? `${stored.replace(/\/+$/, '')}/api` : RENDER_API_BASE;
    const sameOrigin = `${location.origin}/api`;
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    const search = String(location.search || '');
    if (location.hostname.endsWith('github.io')) return remoteBase;
    if (localHost && location.port !== '8000' && !search.includes('localapi=1')) return remoteBase;
    return sameOrigin;
  }
  return RENDER_API_BASE;
}

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetry(method, path, error) {
  const status = Number(error?.status);
  const verb = String(method || 'GET').toUpperCase();
  const retryable = status === 0 || status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  if (!retryable) return false;
  if (verb === 'GET') return true;
  return verb === 'POST' && path === '/auth/login';
}

export async function fetchJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const parent = options.signal;
  const onParentAbort = () => controller.abort();
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      error.status = 408;
      error.code = 'TIMEOUT';
    } else if (!error.status) {
      error.status = 0;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  }
}

async function request(path, options = {}, attempt = 0) {
  const headers = new Headers(options.headers || {});
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body !== undefined && options.body !== null && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = readToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${getApiBase()}${path}`, { ...fetchOptions, headers, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError') {
      error.status = 408;
      error.code = 'TIMEOUT';
      error.message = 'Cloud API neodpovedala včas';
    } else {
      error.status = 0;
      error.code = error.code || 'NETWORK_ERROR';
    }
    if (attempt === 0 && shouldRetry(options.method, path, error)) {
      await sleep(RETRY_DELAY_MS);
      return request(path, options, 1);
    }
    throw error;
  }
  clearTimeout(timer);

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
    if (attempt === 0 && shouldRetry(options.method, path, error)) {
      await sleep(RETRY_DELAY_MS);
      return request(path, options, 1);
    }
    throw error;
  }
  return payload;
}

function persistSession(payload) {
  if (payload?.token) writeToken(payload.token);
  return payload?.user || null;
}

export const backendApi = {
  TOKEN_KEY,
  getApiBase,
  hasToken() {
    return Boolean(readToken());
  },
  async health() {
    const result = await request('/health', { method: 'GET', timeoutMs: 8000 });
    return result;
  },
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
    const status = Number(error?.status);
    return !status || status === 408 || status === 429 || status >= 500;
  }
};
