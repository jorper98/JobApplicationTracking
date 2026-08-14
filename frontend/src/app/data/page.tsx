"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { DownloadCloud, UploadCloud, Trash2 } from "lucide-react";

export default function DataPage() {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const blob = await api.exportData();
      const url = window.URL.createObjectURL(new Blob([blob], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "job-tracker-export.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage("Export complete. The zip file should download automatically.");
    } catch (error) {
      console.error(error);
      setMessage("Export failed. Try again or check the backend logs.");
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setMessage(null);
    try {
      await api.importData(file);
      setMessage("Import complete. Reload the app to see restored data.");
    } catch (error) {
      console.error(error);
      setMessage("Import failed. Make sure you selected a valid export zip.");
    } finally {
      setImporting(false);
    }
  };

  const handleClearAll = async () => {
    if (!confirm("This will permanently delete ALL jobs, resumes, applications, analyses, and uploaded files. This cannot be undone. Continue?")) return;
    setClearing(true);
    setMessage(null);
    try {
      await api.clearAllData();
      setMessage("All data cleared.");
    } catch (error) {
      console.error(error);
      setMessage("Clear failed. Check the backend logs.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Export / Import Data</h1>
      <p className="text-gray-500 dark:text-[#8b8b96] mb-6">Download a backup of your database and upload files, or restore from a previous export.</p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-indigo-600/10 text-indigo-700 dark:text-indigo-300">
              <DownloadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-white text-lg font-semibold">Export Backup</h2>
              <p className="text-sm text-gray-500 dark:text-[#8b8b96] mt-1">Download a zip archive containing your app data and uploaded resume files.</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-medium text-gray-900 dark:text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Download Backup"}
          </button>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-3 rounded-2xl bg-sky-600/10 text-sky-700 dark:text-sky-300">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-gray-900 dark:text-white text-lg font-semibold">Import Backup</h2>
              <p className="text-sm text-gray-500 dark:text-[#8b8b96] mt-1">Upload a previously exported zip file to restore all jobs, resumes, applications, and uploads.</p>
            </div>
          </div>
          <input
            type="file"
            accept=".zip"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                handleImport(file);
              }
            }}
            className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-3 text-sm text-gray-900 dark:text-white file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-900 dark:text-white file:hover:bg-indigo-500"
          />
          <p className="mt-3 text-xs text-gray-400 dark:text-[#6b6b72]">Upload a .zip file exported by this app. Import will restore all data and uploaded resume files.</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-red-500/20 bg-white dark:bg-[#16161f] p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-3 rounded-2xl bg-red-600/10 text-red-600 dark:text-red-400">
            <Trash2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-white text-lg font-semibold">Clear All Data</h2>
            <p className="text-sm text-gray-500 dark:text-[#8b8b96] mt-1">Permanently delete all jobs, resumes, applications, analyses, and uploaded files. This cannot be undone.</p>
          </div>
        </div>
        <button
          onClick={handleClearAll}
          disabled={clearing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-gray-900 dark:text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {clearing ? "Clearing..." : "Clear All Data"}
        </button>
      </div>

      {message ? <div className="mt-6 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-4 text-sm text-gray-700 dark:text-[#c0c0c8]">{message}</div> : null}
    </div>
  );
}



