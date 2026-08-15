import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8136";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

let tokenProvider: (() => Promise<string | null>) | null = null;

/** Register a callback that returns a fresh Clerk token (see AuthBridge). */
export function registerTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}

// Fetch a fresh token before every request so the token never expires mid-session.
client.interceptors.request.use(async (config) => {
  if (tokenProvider) {
    try {
      const token = await tokenProvider();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // no token available — request proceeds, backend will reject with 401
    }
  }
  return config;
});

// If a request fails with 401, retry once with a freshly minted token.
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !(original as any)?._retried && tokenProvider) {
      (original as any)._retried = true;
      try {
        const token = await tokenProvider();
        if (token) {
          original.headers.Authorization = `Bearer ${token}`;
          return client(original);
        }
      } catch {
        // fall through to the original error
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Auth
  register: async (email: string, password: string, fullName?: string) => {
    const { data } = await client.post("/api/auth/register", { email, password, full_name: fullName });
    return data;
  },
  login: async (email: string, password: string) => {
    const { data } = await client.post("/api/auth/login", { email, password });
    return data;
  },
  me: async () => {
    const { data } = await client.get("/api/auth/me");
    return data;
  },
  // Admin: user management
  listUsers: async () => {
    const { data } = await client.get("/api/users/");
    return data;
  },
  createUser: async (payload: { email: string; password: string; full_name?: string; is_admin?: boolean }) => {
    const { data } = await client.post("/api/users/", payload);
    return data;
  },
  updateUser: async (id: string, payload: { full_name?: string; is_admin?: boolean; password?: string }) => {
    const { data } = await client.patch(`/api/users/${id}`, payload);
    return data;
  },
  deleteUser: async (id: string) => {
    const { data } = await client.delete(`/api/users/${id}`);
    return data;
  },
  // Resume
  uploadResume: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await client.post("/api/resume/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
  listResumes: async () => {
    const { data } = await client.get("/api/resume/");
    return data;
  },
  getActiveResume: async () => {
    const { data } = await client.get("/api/resume/active");
    return data;
  },
  deleteResume: async (id: string) => {
    const { data } = await client.delete(`/api/resume/${id}`);
    return data;
  },
  setActiveResume: async (id: string) => {
    const { data } = await client.patch(`/api/resume/${id}/activate`);
    return data;
  },

  // Jobs
  createJob: async (job: {
    title: string;
    company: string;
    company_id?: string;
    description?: string;
    url?: string;
    location?: string;
  }) => {
    const { data } = await client.post("/api/jobs/", job);
    return data;
  },
  updateJob: async (id: string, job: {
    title?: string;
    company?: string;
    company_id?: string | null;
    description?: string;
    url?: string;
    location?: string;
    created_at?: string | null;
  }) => {
    const { data } = await client.patch(`/api/jobs/${id}`, job);
    return data;
  },
  deleteJob: async (id: string) => {
    const { data } = await client.delete(`/api/jobs/${id}`);
    return data;
  },
  listJobNotes: async (jobId: string) => {
    const { data } = await client.get(`/api/jobs/${jobId}/notes`);
    return data;
  },
  createJobNote: async (jobId: string, note: string) => {
    const { data } = await client.post(`/api/jobs/${jobId}/notes`, { note });
    return data;
  },
  updateJobNote: async (jobId: string, noteId: string, note: string) => {
    const { data } = await client.patch(`/api/jobs/${jobId}/notes/${noteId}`, { note });
    return data;
  },
  deleteJobNote: async (jobId: string, noteId: string) => {
    const { data } = await client.delete(`/api/jobs/${jobId}/notes/${noteId}`);
    return data;
  },
  listJobs: async () => {
    const { data } = await client.get("/api/jobs/");
    return data;
  },

  // Companies
  listCompanies: async (search?: string) => {
    const { data } = await client.get("/api/companies/", {
      params: search && search.trim().length >= 2 ? { search } : {},
    });
    return data;
  },
  getCompany: async (id: string) => {
    const { data } = await client.get(`/api/companies/${id}`);
    return data;
  },
  createCompany: async (payload: { name: string; notes?: string }) => {
    const { data } = await client.post("/api/companies/", payload);
    return data;
  },
  updateCompany: async (id: string, payload: { name?: string; notes?: string }) => {
    const { data } = await client.patch(`/api/companies/${id}`, payload);
    return data;
  },
  deleteCompany: async (id: string) => {
    const { data } = await client.delete(`/api/companies/${id}`);
    return data;
  },

  exportData: async () => {
    const response = await client.get("/api/data/export", {
      responseType: "blob",
    });
    return response.data;
  },

  clearAllData: async () => {
    const { data } = await client.delete("/api/data/clear");
    return data;
  },

  importData: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await client.post("/api/data/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  // Admin: full system backup / restore
  systemBackup: async () => {
    const response = await client.get("/api/data/system-backup", {
      responseType: "blob",
    });
    return response.data;
  },
  systemRestore: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await client.post("/api/data/system-restore", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  createJobFromUrl: async (url: string) => {
    const { data } = await client.post("/api/jobs/from-url", { url });
    return data;
  },
  previewJobFromUrl: async (url: string) => {
    const { data } = await client.post("/api/jobs/from-url/preview", { url });
    return data;
  },

  // Analysis
  analyzeMatch: async (jobId: string, resumeId: string) => {
    const { data } = await client.post("/api/analysis/match", {
      job_id: jobId,
      resume_id: resumeId,
    });
    return data;
  },
  generateCoverLetter: async (analysisId: string) => {
    const { data } = await client.post(`/api/analysis/${analysisId}/cover-letter`);
    return data;
  },
  getAnalysisForJob: async (jobId: string) => {
    const { data } = await client.get(`/api/analysis/job/${jobId}`);
    return data;
  },

  // Applications / Kanban
  createApplication: async (jobId: string, status?: string) => {
    const { data } = await client.post("/api/applications/", {
      job_id: jobId,
      ...(status ? { status } : {}),
    });
    return data;
  },
  getKanban: async () => {
    const { data } = await client.get("/api/applications/kanban");
    return data;
  },
  updateApplication: async (
    appId: string,
    update: { status?: string; notes?: string }
  ) => {
    const { data } = await client.patch(`/api/applications/${appId}`, update);
    return data;
  },
  deleteApplication: async (id: string) => {
    const { data } = await client.delete(`/api/applications/${id}`);
    return data;
  },
};







