import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 30000,
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
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
  getJob: (projectId: number, jobId: number) => api.get(`/api/projects/${projectId}/jobs/${jobId}`),
};

// ── Images ────────────────────────────────────────────────────────────────────
export const imagesApi = {
  list: (batchId: number, skip = 0, limit = 50) =>
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
  create: (imageId: number, data: unknown) => api.post(`/api/images/${imageId}/annotations`, data),
  update: (imageId: number, annId: number, data: unknown) =>
    api.patch(`/api/images/${imageId}/annotations/${annId}`, data),
  delete: (imageId: number, annId: number) =>
    api.delete(`/api/images/${imageId}/annotations/${annId}`),
  review: (imageId: number, reviews: unknown[]) =>
    api.post(`/api/images/${imageId}/annotations/review`, reviews),
};

// ── Export ────────────────────────────────────────────────────────────────────
export const exportApi = {
  export: (batchId: number, format: string, includeAi = false) =>
    api.post('/api/export/', { batch_id: batchId, format, include_ai_suggestions: includeAi }, {
      responseType: 'blob',
    }),
};