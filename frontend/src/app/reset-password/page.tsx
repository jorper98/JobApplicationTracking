"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { api } from "@/lib/api";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.resetPassword(token, password);
      setMessage(result.message || "Password updated. You can log in with your new password.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not reset password. The link may be invalid or expired.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-[#0a0a0f]">
      <header className="bg-slate-700 text-white text-center py-4">
        <Link href="/login" className="inline-flex items-baseline gap-2">
          <span className="text-lg font-semibold">JobApplicationTracker</span>
          <span className="text-xs text-slate-300">v1.2.7</span>
        </Link>
      </header>

      <main className="flex min-h-[calc(100vh-64px)] items-start justify-center p-10">
        <section className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reset password</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-[#8b8b96]">
            Choose a new password for your account. Reset links expire after 6 hours and can only be used once.
          </p>

          {!token ? (
            <p className="mt-6 text-sm text-red-600 dark:text-red-400">This reset link is missing a token.</p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">New password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="w-full bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-indigo-500"
                />
              </div>

              {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={submitting || !password || !confirmPassword}
                className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Saving..." : "Reset password"}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-gray-500 dark:text-[#8b8b96]">
            <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Back to sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading...</div>}>
      <ResetPasswordContent />
    </Suspense>
  );
}
