"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

interface WelcomeContent {
  show: boolean;
  title: string;
  html: string;
}

export function WelcomeModal({ userId }: { userId: string }) {
  const [content, setContent] = useState<WelcomeContent | null>(null);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getWelcome()
      .then((data) => {
        if (!cancelled) setContent(data);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!content?.show) return null;

  const safeHtml = sanitizeHtml(content.html);

  const dismiss = async () => {
    setDismissing(true);
    try {
      await api.dismissWelcome();
      setContent((current) => (current ? { ...current, show: false } : current));
    } catch (error) {
      console.error("Failed to dismiss welcome modal", error);
    } finally {
      setDismissing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl border border-white/20 bg-white dark:bg-[#101018] shadow-2xl"
      >
        <div className="bg-gradient-to-br from-indigo-600 via-violet-600 to-sky-600 px-6 py-5 text-white">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-xs uppercase tracking-[0.24em] text-white/70">First Login</p>
              <h2 id="welcome-title" className="mt-1 text-2xl font-bold">
                {content.title}
              </h2>
            </div>
            <button
              onClick={dismiss}
              disabled={dismissing}
              className="rounded-full p-2 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-50 transition-colors"
              title="Close welcome message"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-6 py-5">
          <div
            className="welcome-modal-html text-sm leading-6 text-gray-700 dark:text-[#d4d4dd] [&_a]:text-indigo-600 [&_a]:underline dark:[&_a]:text-indigo-400 [&_h3]:mt-4 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-1 [&_p]:mt-3"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>

        <div className="flex justify-end border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-white/[0.08] dark:bg-[#0b0b11]">
          <button
            onClick={dismiss}
            disabled={dismissing}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {dismissing ? "Saving..." : "Start using the app"}
          </button>
        </div>
      </section>
    </div>
  );
}
