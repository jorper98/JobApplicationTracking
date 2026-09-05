"use client";

import { useState } from "react";
import Link from "next/link";
import { Target, MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const { register } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await register(email, password, fullName || undefined);
      if (!data.access_token) {
        setRegistered(true);
      }
      // Otherwise AuthGate redirects to /dashboard automatically
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail[0]?.msg || "Invalid input" : detail || "Registration failed. Try again.");
      setSubmitting(false);
    }
  };

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100 dark:bg-[#0a0a0f]">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-gray-900 dark:text-white">JobApplicationTracker</span>
              <span className="text-[10px] text-gray-400 dark:text-[#6b6b72] mt-0.5">v1.2.5</span>
            </div>
          </div>

          <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-8 text-center">
            <div className="w-14 h-14 bg-emerald-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <MailCheck className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Check your inbox</h1>
            <p className="text-sm text-gray-500 dark:text-[#8b8b96] mb-6">
              To avoid spammers and bad actors, we need to confirm the email is really yours. Please check your inbox
              (or spam folders) and click the link provided to verify, then log in with your credentials.
            </p>
            <Link
              href="/login"
              className="inline-block bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
            >
              Go to login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-100 dark:bg-[#0a0a0f]">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-6">
          <div className="w-9 h-9 bg-indigo-600 rounded-lg flex items-center justify-center">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-bold text-gray-900 dark:text-white">JobApplicationTracker</span>
            <span className="text-[10px] text-gray-400 dark:text-[#6b6b72] mt-0.5">v1.2.5</span>
          </div>
        </div>

        <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-2xl p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Create account</h1>
          <p className="text-sm text-gray-500 dark:text-[#8b8b96] mb-5">Set up your job tracker account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Name (optional)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
              />
            </div>

            {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || !email || password.length < 6}
              className="w-full bg-indigo-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 dark:text-[#8b8b96] mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}




