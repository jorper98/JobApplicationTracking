"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Target, CheckCircle2, XCircle } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("Missing verification token. Use the link from your email.");
      return;
    }
    api
      .verifyEmail(token)
      .then((data) => {
        setState("success");
        setMessage(data.message || "Email verified");
      })
      .catch((err) => {
        setState("error");
        setMessage(err?.response?.data?.detail || "Verification failed. The link may be invalid or expired.");
      });
  }, [token]);

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
          {state === "loading" && (
            <p className="text-sm text-gray-500 dark:text-[#8b8b96]">Verifying your email…</p>
          )}

          {state === "success" && (
            <>
              <div className="w-14 h-14 bg-emerald-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Email verified</h1>
              <p className="text-sm text-gray-500 dark:text-[#8b8b96] mb-6">{message}</p>
              <Link
                href="/login"
                className="inline-block bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Go to login
              </Link>
            </>
          )}

          {state === "error" && (
            <>
              <div className="w-14 h-14 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-7 h-7 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Verification failed</h1>
              <p className="text-sm text-gray-500 dark:text-[#8b8b96] mb-6">{message}</p>
              <Link
                href="/login"
                className="inline-block bg-indigo-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Go to login
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-500 dark:text-[#8b8b96]">
          Verifying your email…
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
