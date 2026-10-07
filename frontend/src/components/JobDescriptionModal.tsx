"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, ExternalLink, ArrowRight, Pencil } from "lucide-react";

interface JobDescriptionModalProps {
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  jobId?: string;
  title: string;
  company?: string;
  description?: string;
  originalDescription?: string;
  descriptionFetchMethod?: string;
  url?: string;
}

export function JobDescriptionModal({ open, onClose, onEdit, jobId, title, company, description, originalDescription, descriptionFetchMethod, url }: JobDescriptionModalProps) {
  const [view, setView] = useState<"summary" | "original">("summary");
  const hasOriginal = !!originalDescription?.trim();

  // Lock page scrolling while the modal is open so the wheel only scrolls
  // inside the modal, never the page behind it.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
    setView("summary");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">{title}</h3>
            {company && <p className="text-sm text-gray-500 dark:text-[#8b8b96] truncate">{company}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <button
                onClick={onEdit}
                title="Edit job"
                className="p-1.5 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {hasOriginal && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setView("summary")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  view === "summary"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-[#c0c0c8] hover:bg-gray-200 dark:hover:bg-white/[0.1]"
                }`}
              >
                AI summary
              </button>
              <button
                type="button"
                onClick={() => setView("original")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  view === "original"
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 dark:bg-white/[0.06] text-gray-600 dark:text-[#c0c0c8] hover:bg-gray-200 dark:hover:bg-white/[0.1]"
                }`}
              >
                Original posting
              </button>
              {descriptionFetchMethod && (
                <span className="text-xs text-gray-400 dark:text-[#5a5a64]">
                  Source: {descriptionFetchMethod}
                </span>
              )}
            </div>
          )}

          {view === "original" && hasOriginal ? (
            <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap leading-relaxed">
              {originalDescription}
            </p>
          ) : description ? (
            <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap leading-relaxed">
              {description}
            </p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-[#5a5a64]">
              <em>No description for this job.</em>
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 dark:border-white/[0.08] shrink-0">
          <div className="flex items-center gap-4">
            {jobId && (
              <Link
                href={`/jobs?job_id=${jobId}`}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#c0c0c8] hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline"
              >
                <ArrowRight className="w-4 h-4" />
                Go to Record
              </Link>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                View original posting
              </a>
            )}
          </div>
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
