"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, PageShell } from "@/components/PageShell";
import { Loader2, Save } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getAISettings()
      .then((data) => {
        setModel(data.gemini_model);
        setKeySet(data.gemini_api_key_set);
      })
      .catch((e) => setError(e?.response?.data?.detail || "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  if (!user?.is_admin) {
    return (
      <PageShell>
        <PageHeader title="Settings" subtitle="Admin only" />
        <p className="text-gray-500 dark:text-[#8b8b96]">You do not have permission to view this page.</p>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center gap-3 text-gray-500 dark:text-[#8b8b96]">
          <Loader2 className="animate-spin w-5 h-5" />
          Loading settings…
        </div>
      </PageShell>
    );
  }

  const inputClass =
    "w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    setError("");
    try {
      const payload: { gemini_model?: string; gemini_api_key?: string } = {};
      if (model.trim()) payload.gemini_model = model.trim();
      if (clearKey) {
        payload.gemini_api_key = "";
      } else if (apiKey.trim()) {
        payload.gemini_api_key = apiKey.trim();
      }
      const data = await api.updateAISettings(payload);
      setModel(data.gemini_model);
      setKeySet(data.gemini_api_key_set);
      setApiKey("");
      setClearKey(false);
      setMessage("Settings saved");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell maxWidth="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage the global AI configuration (admin only)" />

      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">AI model</label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. gemini-3.6-flash"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Falls back to the GEMINI_MODEL value from the server .env if left empty.
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Gemini API key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={keySet ? "•••••••• (a key is set — type to replace it)" : "Paste a new API key"}
            className={inputClass}
            autoComplete="off"
          />
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Falls back to the GEMINI_API_KEY value from the server .env if no key is stored.
          </p>
          {keySet && (
            <label className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-[#8b8b96] cursor-pointer">
              <input
                type="checkbox"
                checked={clearKey}
                onChange={(e) => setClearKey(e.target.checked)}
                className="accent-indigo-600"
              />
              Clear the stored key and fall back to the .env value
            </label>
          )}
        </div>

        {message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </PageShell>
  );
}
