import axios from 'axios';

// Use empty baseURL — all requests go through nginx proxy on the same origin.
// Never hardcode localhost:8000 — it bypasses nginx and breaks HttpOnly cookies.
export const api = axios.create({
  baseURL: '',
  timeout: 30000,
  withCredentials: true, // required for HttpOnly refresh_token cookie
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Auto token refresh on 401 ─────────────────────────────────────────────────
// When an access token expires the interceptor transparently refreshes it
// and retries the original request — no silent logout, no stuck modals.
let _refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (_refreshing) return _refreshing;
  _refreshing = axios
    .post('/api/auth/refresh', {}, { withCredentials: true })
    .then((r) => {
      const t = r.data.access_token as string;
      localStorage.setItem('access_token', t);
      api.defaults.headers.common['Authorization'] = `Bearer ${t}`;
      return t;
    })
    .catch(() => null)
    .finally(() => { _refreshing = null; });
  return _refreshing;
}

function hardLogout() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('marine-auth');
  delete api.defaults.headers.common['Authorization'];
  if (!['/login', '/'].includes(window.location.pathname)) {
    window.location.href = '/login';
  }
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const orig = err.config;
    if (err.response?.status === 401 && !orig._retried) {
      orig._retried = true;
      const newToken = await tryRefresh();
      if (newToken) {
        orig.headers.Authorization = `Bearer ${newToken}`;
        return api(orig);
      }
      hardLogout();
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) => {
    const form = new FormData();
    form.append('username', email);
    form.append('password', password);
    return api.post('/api/auth/token', form);
  },
  me: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/api/users/'),
  create: (data: unknown) => api.post('/api/users/', data),
  update: (id: number, data: unknown) => api.patch(`/api/users/${id}`, data),
};

// ── Projects ──────────────────────────────────────────────────────────────────
export const projectsApi = {
  list: () => api.get('/api/projects/'),
  create: (data: unknown) => api.post('/api/projects/', data),
  get: (id: number) => api.get(`/api/projects/${id}`),
  update: (id: number, data: unknown) => api.patch(`/api/projects/${id}`, data),
  members: (id: number) => api.get(`/api/projects/${id}/members`),
  addMember: (id: number, data: unknown) => api.post(`/api/projects/${id}/members`, data),
  labels: (id: number) => api.get(`/api/projects/${id}/labels`),
  createLabel: (id: number, data: unknown) => api.post(`/api/projects/${id}/labels`, data),
  batches: (id: number) => api.get(`/api/projects/${id}/batches`),
  createBatch: (id: number, data: unknown) => api.post(`/api/projects/${id}/batches`, data),
  models: (id: number) => api.get(`/api/projects/${id}/models`),
  uploadModel: (id: number, form: FormData) =>
    api.post(`/api/projects/${id}/models/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  jobs: (id: number) => api.get(`/api/projects/${id}/jobs`),
  createJob: (id: number, data: unknown) => api.post(`/api/projects/${id}/jobs`, data),
  getJob: (projectId: number, jobId: number) =>
    api.get(`/api/projects/${projectId}/jobs/${jobId}`),
};

// ── Images ────────────────────────────────────────────────────────────────────
export const imagesApi = {
  list: (batchId: number, skip = 0, limit = 200) =>
    api.get(`/api/batches/${batchId}/images`, { params: { skip, limit } }),
  upload: (batchId: number, files: File[], onProgress?: (p: number) => void) => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    return api.post(`/api/batches/${batchId}/images/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / (e.total || 1))),
    });
  },
  assign: (batchId: number, imageId: number, userId: number | null) =>
    api.patch(`/api/batches/${batchId}/images/${imageId}/assign`, { user_id: userId }),
  complete: (imageId: number) => api.post(`/api/images/${imageId}/complete`),
  delete: (batchId: number, imageId: number) =>
    api.delete(`/api/batches/${batchId}/images/${imageId}`),
};

// ── Annotations ───────────────────────────────────────────────────────────────
export const annotationsApi = {
  list: (imageId: number) => api.get(`/api/images/${imageId}/annotations`),
  create: (imageId: number, data: unknown) =>
    api.post(`/api/images/${imageId}/annotations`, data),
  update: (imageId: number, annId: number, data: unknown) =>
    api.patch(`/api/images/${imageId}/annotations/${annId}`, data),
  delete: (imageId: number, annId: number) =>
    api.delete(`/api/images/${imageId}/annotations/${annId}`),
  review: (imageId: number, reviews: unknown[]) =>
    api.post(`/api/images/${imageId}/annotations/review`, reviews),
};

// ── Export ────────────────────────────────────────────────────────────────────
export const exportApi = {
  export: (
    batchId: number,
    format: string,
    includeAi = false,
    includeImages = true,
    split = { train: 0.7, val: 0.2, test: 0.1 },
  ) =>
    api.post(
      '/api/export/',
      { batch_id: batchId, format, include_ai_suggestions: includeAi, include_images: includeImages, split },
      { responseType: 'blob', timeout: 180000 }, // 3 min — large batches with images take time
    ),
};
