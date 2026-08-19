"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { type Job, type JobPreview } from "@/lib/types";
import { X, Link2, FileText, Building2, Check } from "lucide-react";

interface JobModalProps {
  isOpen: boolean;
  onClose: () => void;
  job?: Job;
  onSave: (job: Job) => void;
}

interface Company {
  id: string;
  name: string;
  notes?: string | null;
  job_count?: number;
}

type ModalMode = "manual" | "url";

export function JobModal({ isOpen, onClose, job, onSave }: JobModalProps) {
  const [mode, setMode] = useState<ModalMode>("manual");
  const [form, setForm] = useState<{ title: string; company: string; description: string; url: string; location: string; createdAt: string }>({
    title: "",
    company: "",
    description: "",
    url: "",
    location: "",
    createdAt: "",
  });
  const [urlInput, setUrlInput] = useState("");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState("");
  const [preview, setPreview] = useState<JobPreview | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [companySuggestions, setCompanySuggestions] = useState<Company[]>([]);
  const [companySearching, setCompanySearching] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyNotes, setCompanyNotes] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCompanySuggestions([]);
      setSuggestionsOpen(false);
      setSelectedCompany(null);
      setCompanyNotes("");
      if (job) {
        setForm({
          title: job.title || "",
          company: job.company || "",
          description: job.description || "",
          url: job.url || "",
          location: job.location || "",
          createdAt: job.created_at ? new Date(job.created_at).toISOString().slice(0,10) : "",
        });
        if (job.company_id) {
          api
            .getCompany(job.company_id)
            .then((company) => {
              setSelectedCompany(company);
              setCompanyNotes(company.notes || "");
            })
            .catch(console.error);
        }
        setMode("manual");
      } else {
        setForm({ title: "", company: "", description: "", url: "", location: "", createdAt: "" });
        setUrlInput("");
        setPreview(null);
        setScrapeError("");
        setError("");
      }
    }
  }, [isOpen, job]);

  const handleCompanyChange = (value: string) => {
    setForm({ ...form, company: value });
    if (selectedCompany && value.trim().toLowerCase() !== selectedCompany.name.toLowerCase()) {
      setSelectedCompany(null);
    }
    const q = value.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setCompanySuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setCompanySearching(true);
      try {
        const results = await api.listCompanies(q);
        setCompanySuggestions(results);
        setSuggestionsOpen(true);
      } catch (e) {
        console.error("Company search failed", e);
        setCompanySuggestions([]);
      } finally {
        setCompanySearching(false);
      }
    }, 250);
  };

  const handleSelectCompany = (company: Company) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setForm({ ...form, company: company.name });
    setSelectedCompany(company);
    setCompanyNotes(company.notes || "");
    setCompanySuggestions([]);
    setSuggestionsOpen(false);
  };

  const resolveCompany = async (): Promise<string | null> => {
    if (selectedCompany) {
      if (companyNotes.trim() !== (selectedCompany.notes || "")) {
        try {
          await api.updateCompany(selectedCompany.id, { notes: companyNotes.trim() });
        } catch (e) {
          console.error("Failed to save company notes", e);
        }
      }
      return selectedCompany.id;
    }
    const name = form.company.trim();
    if (!name) return null;
    try {
      const company = await api.createCompany({ name, notes: companyNotes.trim() });
      return company.id;
    } catch (e) {
      console.error("Failed to create company", e);
      return null;
    }
  };

  const handleScrape = async () => {
    if (!urlInput.trim()) return;
    setScraping(true);
    setScrapeError("");
    try {
      const extracted = await api.previewJobFromUrl(urlInput.trim());
      setPreview(extracted);
    } catch (e: any) {
      setScrapeError(e?.response?.data?.detail || "Couldn't scrape that URL");
    } finally {
      setScraping(false);
    }
  };

  const handleSubmit = async () => {
    if (!form.title || !form.company) {
      setError("Title and company are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const companyId = await resolveCompany();
      const payload = { ...form, company_id: companyId ?? undefined };
      let savedJob;
      if (job) {
        savedJob = await api.updateJob(job.id, { ...payload, created_at: form.createdAt ? new Date(form.createdAt).toISOString() : null });
      } else {
        // The backend saves the job AND its tracker entry atomically.
        savedJob = await api.createJob(payload);
      }
      onSave(savedJob);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUsePreview = async () => {
    if (!preview) return;
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        title: preview.title,
        company: preview.company,
        description: preview.description,
        url: preview.url,
        location: preview.location,
      };
      const savedJob = await api.createJob(payload);
      onSave(savedJob);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save job");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const inputClass =
    "w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-[#0b0b11] border-b border-gray-200 dark:border-white/[0.08] px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {job ? "Edit Job" : "Add Job"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {!job && (
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "manual"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-[#c0c0c8] hover:bg-gray-200 dark:hover:bg-white/[0.1]"
                }`}
              >
                <FileText className="w-4 h-4" />
                Add Manually
              </button>
              <button
                onClick={() => setMode("url")}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === "url"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-white/[0.06] text-gray-700 dark:text-[#c0c0c8] hover:bg-gray-200 dark:hover:bg-white/[0.1]"
                }`}
              >
                <Link2 className="w-4 h-4" />
                Import from URL
              </button>
            </div>
          )}

          {mode === "manual" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Job Title *</label>
                <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Software Engineer" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Company *</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Building2 className="w-4 h-4 text-gray-400 dark:text-[#5a5a64]" />
                  </div>
                  <input
                    type="text"
                    required
                    value={form.company}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    onFocus={() => {
                      if (companySuggestions.length > 0) setSuggestionsOpen(true);
                    }}
                    onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
                    placeholder="e.g. Acme Corp (type 2+ letters to search)"
                    className={inputClass + " pl-9"}
                  />
                  {companySearching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-[#5a5a64]">Searching…</span>
                  )}
                  {suggestionsOpen && companySuggestions.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] shadow-lg">
                      {companySuggestions.map((company) => (
                        <button
                          key={company.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCompany(company);
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
                        >
                          <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-[#5a5a64] shrink-0" />
                          <span className="flex-1 truncate">{company.name}</span>
                          {typeof company.job_count === "number" && company.job_count > 0 && (
                            <span className="text-xs text-gray-400 dark:text-[#5a5a64] shrink-0">{company.job_count} job{company.job_count !== 1 ? "s" : ""}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {suggestionsOpen && form.company.trim().length >= 2 && companySuggestions.length === 0 && !companySearching && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] shadow-lg px-3 py-2.5 text-sm text-gray-500 dark:text-[#8b8b96]">
                      No existing company — a new record for “{form.company.trim()}” will be created when you save.
                    </div>
                  )}
                </div>
                {(selectedCompany || form.company.trim().length >= 2) && (
                  <div className="mt-3">
                    <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">
                      Company notes
                      {selectedCompany && <span className="ml-1.5 text-xs text-emerald-600 dark:text-emerald-400"><Check className="inline w-3 h-3" /> Existing record</span>}
                    </label>
                    <textarea
                      value={companyNotes}
                      onChange={(e) => setCompanyNotes(e.target.value)}
                      placeholder="Contacts, application portal details, interview notes, etc."
                      rows={3}
                      className={inputClass + " resize-none"}
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Location</label>
                <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. San Francisco, CA" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Job URL</label>
                <input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Date added</label>
                <input type="date" value={form.createdAt} onChange={(e) => setForm({ ...form, createdAt: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Job Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Paste the job description here..." rows={6} className={inputClass + " resize-none"} />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !form.title || !form.company}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? "Saving..." : job ? "Update Job" : "Save Job"}
                </button>
                <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {mode === "url" && (
            <div className="space-y-4">
              {!preview ? (
                <div>
                  <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Job Posting URL</label>
                  <div className="flex gap-2">
                    <input type="url" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="https://..." className={inputClass + " flex-1"} disabled={scraping} />
                    <button onClick={handleScrape} disabled={scraping || !urlInput.trim()} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                      {scraping ? "Scraping..." : "Scrape"}
                    </button>
                  </div>
                  {scrapeError && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{scrapeError}</p>}
                </div>
              ) : (
                <>
                  <div className="bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{preview.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-[#8b8b96] mb-3">
                      {preview.company} {preview.location ? " | " + preview.location : ""}
                    </p>
                    <div className="max-h-48 overflow-y-auto bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.08] rounded-lg p-3 text-sm text-gray-700 dark:text-[#c0c0c8]">
                      {preview.description || <em className="text-gray-400 dark:text-[#5a5a64]">No description extracted</em>}
                    </div>
                  </div>

                  {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

                  <div className="flex gap-3">
                    <button onClick={handleUsePreview} disabled={submitting} className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                      {submitting ? "Saving..." : "Save Job"}
                    </button>
                    <button onClick={() => setPreview(null)} className="px-4 py-2.5 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                      Try Different URL
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
