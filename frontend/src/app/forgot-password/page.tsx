"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const result = await api.forgotPassword(email);
      setMessage(result.message || "If that email has an account, a password reset link has been sent.");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not send the password reset email. Please try again later.");
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Forgot password</h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-[#8b8b96]">
            Enter your account email and we will send a unique password reset link that expires in 6 hours.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
              />
            </div>

            {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500 dark:text-[#8b8b96]">
            Remembered your password?{" "}
            <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </main>
    </div>
  );
}
