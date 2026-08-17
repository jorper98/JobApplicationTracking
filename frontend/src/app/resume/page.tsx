"use client";

import { Upload, CheckCircle, FileText, Loader2, Trash2 } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { PageHeader, PageShell } from "@/components/PageShell";
import { useDropzone } from "react-dropzone";
import { api } from "@/lib/api";


interface Resume {
  id: string;
  filename: string;
  extracted_skills: string[];
  is_active: boolean;
  version: number;
  created_at: string;
}

export default function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listResumes().then(setResumes).catch(console.error);
  }, []);

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const resume = await api.uploadResume(file);
      setResumes((prev) => [resume, ...prev.map((r) => ({ ...r, is_active: false }))]);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this resume?")) return;
    try {
      await api.deleteResume(id);
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete");
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await api.setActiveResume(id);
      setResumes((prev) =>
        prev.map((r) => ({ ...r, is_active: r.id === id }))
      );
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to set active");
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <PageShell maxWidth="max-w-3xl">
      <PageHeader title="Resume" subtitle="Upload your PDF resume — AI will extract your skills automatically" />

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-indigo-400 bg-indigo-500/10" : "border-gray-200 dark:border-white/[0.12] hover:border-indigo-400/50 hover:bg-gray-50 dark:bg-white/[0.02]"
        }`}
      >
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3 text-indigo-600 dark:text-indigo-400">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="font-medium">Uploading & analyzing…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-500 dark:text-[#8b8b96]">
            <Upload className="w-8 h-8" />
            <p className="font-medium text-gray-900 dark:text-white">Drop your PDF here, or click to browse</p>
            <p className="text-sm">PDF only · Max 10MB</p>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-red-600 dark:text-red-400 text-sm">{error}</p>}

      {resumes.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-white">Uploaded Resumes</h2>
          {resumes.map((r) => (
            <div
              key={r.id}
              className={`bg-white dark:bg-[#16161f] border rounded-xl p-4 flex items-start gap-3 ${
                r.is_active ? "border-indigo-500/40 ring-1 ring-indigo-500/20" : "border-gray-200 dark:border-white/[0.08]"
              }`}
            >
              <FileText className="w-5 h-5 text-gray-500 dark:text-[#8b8b96] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 dark:text-white truncate">{r.filename}</p>
                  {r.is_active && (
                    <span className="text-xs bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-[#8b8b96] mt-0.5">Version {r.version}</p>
                {r.extracted_skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.extracted_skills.slice(0, 12).map((s) => (
                      <span key={s} className="text-xs bg-gray-100 dark:bg-white/[0.05] text-gray-700 dark:text-[#c0c0c8] px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                    {r.extracted_skills.length > 12 && (
                      <span className="text-xs text-gray-500 dark:text-[#8b8b96]">+{r.extracted_skills.length - 12} more</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.is_active ? (
                  <CheckCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <button
                    onClick={() => handleSetActive(r.id)}
                    className="text-xs bg-gray-100 dark:bg-white/[0.06] hover:bg-indigo-500/20 text-gray-700 dark:text-[#c0c0c8] hover:text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-white/[0.08] transition-colors"
                  >
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-gray-400 dark:text-[#5a5a64] hover:text-red-600 dark:text-red-400 transition-colors p-1"
                  title="Delete resume"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
