import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8136";

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
  withCredentials: true,
});

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
  logout: async () => {
    await client.post("/api/auth/logout");
  },
  me: async () => {
    const { data } = await client.get("/api/auth/me");
    return data;
  },
  verifyEmail: async (token: string) => {
    const { data } = await client.get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    return data;
  },
  resendVerification: async (email: string) => {
    const { data } = await client.post("/api/auth/resend-verification", { email });
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
  // Admin: AI settings
  getAISettings: async () => {
    const { data } = await client.get("/api/users/settings/ai");
    return data;
  },
  updateAISettings: async (payload: { gemini_model?: string; gemini_api_key?: string }) => {
    const { data } = await client.put("/api/users/settings/ai", payload);
    return data;
  },
  // Admin: SMTP settings
  getSmtpSettings: async () => {
    const { data } = await client.get("/api/users/settings/smtp");
    return data;
  },
  updateSmtpSettings: async (payload: Record<string, unknown>) => {
    const { data } = await client.put("/api/users/settings/smtp", payload);
    return data;
  },
  testSmtpSettings: async () => {
    const { data } = await client.post("/api/users/settings/smtp/test");
    return data;
  },
  // Admin: login page branding
  getLoginPageSettings: async () => {
    const { data } = await client.get("/api/users/settings/login-page");
    return data;
  },
  updateLoginPageSettings: async (loginPageHtml: string) => {
    const { data } = await client.put("/api/users/settings/login-page", { login_page_html: loginPageHtml });
    return data;
  },
  // Public: login page branding (no auth)
  getLoginPageHtml: async () => {
    const { data } = await client.get("/api/auth/login-page");
    return data;
  },
  // Admin: AI usage log
  getAIUsage: async (params?: { user_id?: string; feature?: string; limit?: number; offset?: number }) => {
    const { data } = await client.get("/api/users/usage", { params });
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
  getResumeText: async (id: string) => {
    const { data } = await client.get(`/api/resume/${id}/text`);
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
  updateJobNote: async (jobId: string, noteId: string, note: string, createdAt?: string) => {
    const { data } = await client.patch(`/api/jobs/${jobId}/notes/${noteId}`, {
      note,
      ...(createdAt ? { created_at: createdAt } : {}),
    });
    return data;
  },
  deleteJobNote: async (jobId: string, noteId: string) => {
    const { data } = await client.delete(`/api/jobs/${jobId}/notes/${noteId}`);
    return data;
  },
  listJobContacts: async (jobId: string) => {
    const { data } = await client.get(`/api/jobs/${jobId}/contacts`);
    return data;
  },
  getJobRelationships: async (jobId: string) => {
    const { data } = await client.get(`/api/jobs/${jobId}/relationships`);
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
  updateCompany: async (id: string, payload: { name?: string; notes?: string | null }) => {
    const { data } = await client.patch(`/api/companies/${id}`, payload);
    return data;
  },
  deleteCompany: async (id: string) => {
    const { data } = await client.delete(`/api/companies/${id}`);
    return data;
  },
  listCompanyNotes: async (companyId: string) => {
    const { data } = await client.get(`/api/companies/${companyId}/notes`);
    return data;
  },
  createCompanyNote: async (companyId: string, note: string) => {
    const { data } = await client.post(`/api/companies/${companyId}/notes`, { note });
    return data;
  },
  updateCompanyNote: async (companyId: string, noteId: string, note: string) => {
    const { data } = await client.patch(`/api/companies/${companyId}/notes/${noteId}`, { note });
    return data;
  },
  deleteCompanyNote: async (companyId: string, noteId: string) => {
    const { data } = await client.delete(`/api/companies/${companyId}/notes/${noteId}`);
    return data;
  },
  listCompanyContacts: async (companyId: string) => {
    const { data } = await client.get(`/api/companies/${companyId}/contacts`);
    return data;
  },
  getCompanyRelationships: async (companyId: string) => {
    const { data } = await client.get(`/api/companies/${companyId}/relationships`);
    return data;
  },

  // Contacts
  listContacts: async (params?: { search?: string }) => {
    const { data } = await client.get("/api/contacts/", { params });
    return data;
  },
  getContact: async (id: string) => {
    const { data } = await client.get(`/api/contacts/${id}`);
    return data;
  },
  createContact: async (payload: { name: string; email?: string; phone?: string }) => {
    const { data } = await client.post("/api/contacts/", payload);
    return data;
  },
  updateContact: async (
    id: string,
    payload: { name?: string; email?: string | null; phone?: string | null }
  ) => {
    const { data } = await client.patch(`/api/contacts/${id}`, payload);
    return data;
  },
  deleteContact: async (id: string) => {
    const { data } = await client.delete(`/api/contacts/${id}`);
    return data;
  },
  getContactRelationships: async (contactId: string) => {
    const { data } = await client.get(`/api/contacts/${contactId}/relationships`);
    return data;
  },
  addContactRelationship: async (contactId: string, entityType: string, entityId: string) => {
    const { data } = await client.post(`/api/contacts/${contactId}/relationships`, {
      entity_type: entityType,
      entity_id: entityId,
    });
    return data;
  },
  removeContactRelationship: async (contactId: string, entityType: string, entityId: string) => {
    const { data } = await client.delete(`/api/contacts/${contactId}/relationships/${entityType}/${entityId}`);
    return data;
  },
  listContactNotes: async (contactId: string) => {
    const { data } = await client.get(`/api/contacts/${contactId}/notes`);
    return data;
  },
  createContactNote: async (
    contactId: string,
    note: string,
    tags?: { entity_type: string; entity_id: string }[]
  ) => {
    const { data } = await client.post(`/api/contacts/${contactId}/notes`, {
      note,
      ...(tags ? { tags } : {}),
    });
    return data;
  },
  updateContactNote: async (
    contactId: string,
    noteId: string,
    note: string,
    opts?: { tags?: { entity_type: string; entity_id: string }[]; createdAt?: string }
  ) => {
    const { data } = await client.patch(`/api/contacts/${contactId}/notes/${noteId}`, {
      note,
      ...(opts?.tags !== undefined ? { tags: opts.tags } : {}),
      ...(opts?.createdAt ? { created_at: opts.createdAt } : {}),
    });
    return data;
  },
  deleteContactNote: async (contactId: string, noteId: string) => {
    const { data } = await client.delete(`/api/contacts/${contactId}/notes/${noteId}`);
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
  previewJobFromText: async (text: string) => {
    const { data } = await client.post("/api/jobs/from-text/preview", { text });
    return data;
  },
  createJobFromText: async (text: string) => {
    const { data } = await client.post("/api/jobs/from-text", { text });
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

  // Job relationships
  addJobRelationship: async (jobId: string, entityType: string, entityId: string) => {
    const { data } = await client.post(`/api/jobs/${jobId}/relationships`, {
      entity_type: entityType,
      entity_id: entityId,
    });
    return data;
  },
  removeJobRelationship: async (jobId: string, entityType: string, entityId: string) => {
    const { data } = await client.delete(`/api/jobs/${jobId}/relationships/${entityType}/${entityId}`);
    return data;
  },

  // Activity log
  getActivity: async (limit?: number) => {
    const { data } = await client.get("/api/activity/", {
      params: limit ? { limit } : {},
    });
    return data;
  },
};







