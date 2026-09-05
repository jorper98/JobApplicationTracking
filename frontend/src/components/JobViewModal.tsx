"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { type Job } from "@/lib/types";
import { X, MapPin, CalendarDays, Tag, Building2, ChevronDown, ChevronRight, FileText, Loader2 } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  not_pursued: "Not Pursued",
};

const STATUS_BADGE: Record<string, string> = {
  saved: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  applied: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  interview: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  offer: "bg-green-500/15 text-green-700 dark:text-green-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  ghosted: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  not_pursued: "bg-gray-200 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
};

interface JobNote {
  id: string;
  note: string;
  created_at?: string;
}

interface JobViewModalProps {
  jobId: string | null;
  status?: string;
  onClose: () => void;
}

export function JobViewModal({ jobId, status, onClose }: JobViewModalProps) {
  const [job, setJob] = useState<Job | null>(null);
  const [companyNotes, setCompanyNotes] = useState("");
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDesc, setShowDesc] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setJob(null);
    setCompanyNotes("");
    setNotes([]);
    setShowDesc(false);
    setError("");
    setLoading(true);
    (async () => {
      try {
        const j = await api.getJob(jobId);
        setJob(j);
        const [ns, company] = await Promise.all([
          api.listJobNotes(jobId).catch(() => [] as JobNote[]),
          j.company_id ? api.getCompany(j.company_id).catch(() => null) : Promise.resolve(null),
        ]);
        setNotes(ns || []);
        setCompanyNotes(company?.notes || "");
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to load job");
      } finally {
        setLoading(false);
      }
    })();
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [jobId, onClose]);

  if (!jobId) return null;

  const statusKey = status && status in STATUS_LABELS ? status : undefined;

  const infoRow = (
    icon: React.ReactNode,
    label: string,
    value?: string | null
  ) =>
    value ? (
      <div className="flex items-start gap-2">
        <span className="text-gray-400 dark:text-[#5a5a64] mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a64]">{label}</p>
          <p className="text-sm text-gray-900 dark:text-white break-words">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {job?.title || "Job"}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {job?.company && (
                <p className="text-sm text-gray-500 dark:text-[#8b8b96] truncate">{job.company}</p>
              )}
              {statusKey && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[statusKey]}`}>
                  {STATUS_LABELS[statusKey]}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 overscroll-contain space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96] py-10">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading job…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">{error}</p>
          ) : job ? (
            <>
              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {infoRow(
                  <Building2 className="w-3.5 h-3.5" />,
                  "Company Notes",
                  companyNotes || undefined
                )}
                {infoRow(<MapPin className="w-3.5 h-3.5" />, "Location", job.location)}
                {infoRow(
                  <CalendarDays className="w-3.5 h-3.5" />,
                  "Date Added",
                  job.created_at ? new Date(job.created_at).toLocaleDateString() : undefined
                )}
                {infoRow(
                  <FileText className="w-3.5 h-3.5" />,
                  "Status",
                  statusKey ? STATUS_LABELS[statusKey] : undefined
                )}
              </div>

              {/* Tags */}
              {job.extracted_skills && job.extracted_skills.length > 0 && (
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a64] mb-1.5">
                    <Tag className="w-3 h-3" />
                    Tags
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {job.extracted_skills.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a64] mb-1.5">
                  Notes ({notes.length})
                </p>
                {notes.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-[#5a5a64]">No notes for this job.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto overscroll-contain">
                    {notes.map((n) => (
                      <div
                        key={n.id}
                        className="rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-2"
                      >
                        <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap break-words">
                          {n.note}
                        </p>
                        {n.created_at && (
                          <p className="text-[10px] text-gray-400 dark:text-[#5a5a64] mt-1">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Description (collapsible) */}
              {job.description && job.description.trim() && (
                <div>
                  <button
                    onClick={() => setShowDesc((v) => !v)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-[#c0c0c8] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                  >
                    {showDesc ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                    {showDesc ? "Hide description" : "Show description"}
                  </button>
                  {showDesc && (
                    <p className="mt-2 text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.08] rounded-lg p-3 max-h-64 overflow-y-auto overscroll-contain">
                      {job.description}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">Job not found.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-white/[0.08] shrink-0">
          {job && (
            <Link
              href={`/jobs?job_id=${job.id}`}
              onClick={onClose}
              className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Go to Job
            </Link>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
