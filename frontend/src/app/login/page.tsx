"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setResendMessage("");
    setSubmitting(true);
    try {
      await login(email, password);
      // AuthGate redirects to /dashboard automatically
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (err?.response?.status === 403) {
        setNeedsVerification(true);
      }
      setError(Array.isArray(detail) ? detail[0]?.msg || "Invalid input" : detail || "Login failed. Check your email and password.");
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setResendMessage("");
    try {
      const data = await api.resendVerification(email);
      setResendMessage(data.message);
    } catch (err: any) {
      setResendMessage(err?.response?.data?.detail || "Could not resend the verification email. Try again later.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-[#0a0a0f]">
      <header className="bg-slate-700 text-white text-center py-4">
        <Link href="/" className="inline-flex items-baseline gap-2">
          <span className="text-lg font-semibold">JobApplicationTracker</span>
          <span className="text-xs text-slate-300">v1.2.1</span>
        </Link>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200 dark:bg-white/[0.04]">
        <section className="bg-gray-100 dark:bg-[#0a0a0f] flex items-start justify-center p-10">
          <div className="w-full max-w-sm space-y-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white text-center">JobApplicationTracker</h1>
            <p className="text-sm text-gray-500 dark:text-[#8b8b96] text-center -mt-4">v1.2.1</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="w-full bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              {needsVerification && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4 space-y-3">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    Please verify your email before logging in. Check your inbox (or spam folders) for the
                    verification link.
                  </p>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending || !email}
                    className="w-full bg-amber-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {resending ? "Sending..." : "Resend verification email"}
                  </button>
                  {resendMessage && <p className="text-xs text-amber-700 dark:text-amber-400">{resendMessage}</p>}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !email || !password}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <div className="rounded-lg bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] p-4 text-sm text-gray-700 dark:text-[#c0c0c8]">
              <span className="font-semibold text-gray-900 dark:text-white">Note:</span> Enter your email and password to access the system.
            </div>

            <p className="text-center text-sm text-gray-500 dark:text-[#8b8b96]">
              No account?{" "}
              <Link href="/register" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </section>

        <section className="bg-gray-100 dark:bg-[#0a0a0f] p-10 space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">JobApplicationTracker</h2>
            <p className="text-sm text-gray-500 dark:text-[#8b8b96] mt-1">Track applications, score matches, generate cover letters. Free to use.</p>
          </div>

          <div className="rounded-lg bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">What you can do</h3>
            <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-[#c0c0c8] list-disc list-inside">
              <li>Upload resumes and auto-extract skills with AI</li>
              <li>Add jobs manually or scrape from a URL</li>
              <li>Score resume-to-job matches and find skill gaps</li>
              <li>Generate tailored cover letters in one click</li>
              <li>Track applications on a Kanban board (Saved &rarr; Offer)</li>
              <li>Take notes per company and per job</li>
            </ul>
          </div>

          <div className="rounded-lg bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">About this app</h3>
            <p className="mt-2 text-sm text-gray-600 dark:text-[#c0c0c8]">
              JobApplicationTracker is open source and free to use. It is also provided as a managed application at{" "}
              <a
                href="https://35sites.com/applications/job-application-tracker/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                35sites.com/applications/job-application-tracker/
              </a>
              .
            </p>
          </div>
        </section>
      </div>

      <div className="text-center py-4 text-sm text-gray-500 dark:text-[#8b8b96]">
        For more info, go to the{" "}
        <a
          href="https://35sites.com/applications/job-application-tracker/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Application Page
        </a>
      </div>

      <footer className="bg-slate-700 text-white text-center py-4 text-sm">
        By Jorge Pereira (<a href="https://35sites.com" className="underline" target="_blank" rel="noopener noreferrer">35sites.com LLC</a>).
      </footer>
    </div>
  );
}
