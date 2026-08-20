"use client";

import { useEffect, useState } from "react";
import { X, FileText, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

interface ResumeModalProps {
  resumeId: string | null;
  filename: string;
  onClose: () => void;
}

export function ResumeModal({ resumeId, filename, onClose }: ResumeModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!resumeId) return;
    setLoading(true);
    setText("");
    api
      .getResumeText(resumeId)
      .then((data) => setText(data.raw_text || ""))
      .catch(() => setText(""))
      .finally(() => setLoading(false));
  }, [resumeId]);

  if (!resumeId) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileText className="w-4 h-4 text-gray-400 dark:text-[#5a5a64] shrink-0" />
            <h3 className="font-semibold text-gray-900 dark:text-white truncate" title={filename}>
              {filename}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading…
            </div>
          ) : text ? (
            <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap leading-relaxed">{text}</p>
          ) : (
            <p className="text-sm text-gray-400 dark:text-[#5a5a64]">
              <em>No extracted text available for this resume.</em>
            </p>
          )}
        </div>

        <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-white/[0.08] shrink-0">
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
