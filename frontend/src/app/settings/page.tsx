"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, PageShell } from "@/components/PageShell";
import { Loader2, Save, Send } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // AI settings
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const [clearKey, setClearKey] = useState(false);

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpBcc, setSmtpBcc] = useState("");
  const [smtpTls, setSmtpTls] = useState(true);
  const [smtpSsl, setSmtpSsl] = useState(false);

  // Login page settings
  const [loginPageHtml, setLoginPageHtml] = useState("");

  const [savingAi, setSavingAi] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingLoginPage, setSavingLoginPage] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null);
  const [loginPageMessage, setLoginPageMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState("");
  const [smtpError, setSmtpError] = useState("");
  const [loginPageError, setLoginPageError] = useState("");

  useEffect(() => {
    Promise.all([api.getAISettings(), api.getSmtpSettings(), api.getLoginPageSettings()])
      .then(([ai, smtp, loginPage]) => {
        setModel(ai.gemini_model);
        setKeySet(ai.gemini_api_key_set);
        setSmtpHost(smtp.smtp_host);
        setSmtpPort(smtp.smtp_port);
        setSmtpUser(smtp.smtp_user);
        setSmtpPasswordSet(smtp.smtp_password_set);
        setSmtpFrom(smtp.smtp_from);
        setSmtpFromName(smtp.smtp_from_name);
        setSmtpBcc(smtp.smtp_bcc);
        setSmtpTls(smtp.smtp_tls);
        setSmtpSsl(smtp.smtp_ssl);
        setLoginPageHtml(loginPage.login_page_html);
      })
      .catch((e) => setAiError(e?.response?.data?.detail || "Failed to load settings"))
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

  const handleSaveAi = async () => {
    setSavingAi(true);
    setAiMessage(null);
    setAiError("");
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
      setAiMessage("AI settings saved");
    } catch (e: any) {
      setAiError(e?.response?.data?.detail || "Failed to save AI settings");
    } finally {
      setSavingAi(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    setSmtpMessage(null);
    setSmtpError("");
    try {
      const payload: Record<string, unknown> = {
        smtp_host: smtpHost.trim(),
        smtp_port: smtpPort,
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
        smtp_from_name: smtpFromName.trim(),
        smtp_bcc: smtpBcc.trim(),
        smtp_tls: smtpTls,
        smtp_ssl: smtpSsl,
      };
      if (smtpPassword.trim()) payload.smtp_password = smtpPassword.trim();
      const data = await api.updateSmtpSettings(payload);
      setSmtpPasswordSet(data.smtp_password_set);
      setSmtpPassword("");
      setSmtpMessage("SMTP settings saved");
    } catch (e: any) {
      setSmtpError(e?.response?.data?.detail || "Failed to save SMTP settings");
    } finally {
      setSavingSmtp(false);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpMessage(null);
    setSmtpError("");
    try {
      const data = await api.testSmtpSettings();
      setSmtpMessage(data.message);
    } catch (e: any) {
      setSmtpError(e?.response?.data?.detail || "SMTP test failed");
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveLoginPage = async () => {
    setSavingLoginPage(true);
    setLoginPageMessage(null);
    setLoginPageError("");
    try {
      const data = await api.updateLoginPageSettings(loginPageHtml);
      setLoginPageHtml(data.login_page_html);
      setLoginPageMessage("Login page settings saved");
    } catch (e: any) {
      setLoginPageError(e?.response?.data?.detail || "Failed to save login page settings");
    } finally {
      setSavingLoginPage(false);
    }
  };

  return (
    <PageShell maxWidth="max-w-2xl">
      <PageHeader title="Settings" subtitle="Manage the global configuration (admin only)" />

      {/* AI settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 space-y-4 mb-6">
        <h2 className="font-semibold text-gray-900 dark:text-white">AI settings</h2>
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

        {aiMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{aiMessage}</p>}
        {aiError && <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>}

        <button
          onClick={handleSaveAi}
          disabled={savingAi}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {savingAi ? "Saving..." : "Save AI Settings"}
        </button>
      </div>

      {/* SMTP settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">SMTP settings</h2>
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Used to send registration verification emails (double opt-in). When SMTP is not configured, new
            registrations are auto-verified.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">SMTP host</label>
            <input
              type="text"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="e.g. smtp.gmail.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Port</label>
            <input
              type="number"
              value={smtpPort}
              onChange={(e) => setSmtpPort(parseInt(e.target.value) || 587)}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">SMTP user</label>
          <input
            type="text"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder="e.g. you@gmail.com"
            className={inputClass}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">SMTP password</label>
          <input
            type="password"
            value={smtpPassword}
            onChange={(e) => setSmtpPassword(e.target.value)}
            placeholder={smtpPasswordSet ? "•••••••• (a password is set — type to replace it)" : "App password or API key"}
            className={inputClass}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">From email</label>
            <input
              type="email"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="noreply@yourdomain.com"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">From name</label>
            <input
              type="text"
              value={smtpFromName}
              onChange={(e) => setSmtpFromName(e.target.value)}
              placeholder="JobApplicationTracker"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">BCC (optional)</label>
          <input
            type="email"
            value={smtpBcc}
            onChange={(e) => setSmtpBcc(e.target.value)}
            placeholder="blind copy address for outgoing emails"
            className={inputClass}
          />
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Every outgoing email (verification, test) is blind-copied to this address.
          </p>
        </div>

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96] cursor-pointer">
            <input
              type="checkbox"
              checked={smtpTls}
              onChange={(e) => setSmtpTls(e.target.checked)}
              className="accent-indigo-600"
            />
            STARTTLS
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96] cursor-pointer">
            <input
              type="checkbox"
              checked={smtpSsl}
              onChange={(e) => setSmtpSsl(e.target.checked)}
              className="accent-indigo-600"
            />
            SSL (implicit)
          </label>
        </div>

        {smtpMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{smtpMessage}</p>}
        {smtpError && <p className="text-sm text-red-600 dark:text-red-400">{smtpError}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleSaveSmtp}
            disabled={savingSmtp}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save className="w-4 h-4" />
            {savingSmtp ? "Saving..." : "Save SMTP Settings"}
          </button>
          <button
            onClick={handleTestSmtp}
            disabled={testingSmtp}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
            {testingSmtp ? "Sending..." : "Send test email"}
          </button>
        </div>
      </div>

      {/* Login page settings */}
      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">Login page</h2>
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Custom HTML rendered in the right panel of the login page (visible to everyone). Rendered as-is, so only
            add trusted HTML.
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Right panel HTML</label>
          <textarea
            value={loginPageHtml}
            onChange={(e) => setLoginPageHtml(e.target.value)}
            rows={10}
            spellCheck={false}
            placeholder={"<div>\n  <h3>Welcome</h3>\n  <p>Some announcement…</p>\n</div>"}
            className="w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm font-mono text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
          />
          <p className="text-xs text-gray-400 dark:text-[#5a5a64] mt-1">
            Leave empty to show the default login page content.
          </p>
        </div>

        {loginPageMessage && <p className="text-sm text-emerald-600 dark:text-emerald-400">{loginPageMessage}</p>}
        {loginPageError && <p className="text-sm text-red-600 dark:text-red-400">{loginPageError}</p>}

        <button
          onClick={handleSaveLoginPage}
          disabled={savingLoginPage}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="w-4 h-4" />
          {savingLoginPage ? "Saving..." : "Save Login Page Settings"}
        </button>
      </div>
    </PageShell>
  );
}
