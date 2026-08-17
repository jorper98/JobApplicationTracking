import React from "react";
import { Loader2 } from "lucide-react";

export function PageShell({
  children,
  maxWidth,
}: {
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return <div className={`p-8 min-h-screen${maxWidth ? " " + maxWidth : ""}`}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  className = "mb-6",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{title}</h1>
      {subtitle && <p className="text-gray-500 dark:text-[#8b8b96]">{subtitle}</p>}
    </div>
  );
}

export function PageLoading({ message = "Loading…" }: { message?: string }) {
  return (
    <div className="p-8 flex items-center gap-3 text-gray-500 dark:text-[#8b8b96] min-h-screen">
      <Loader2 className="animate-spin w-5 h-5" />
      {message}
    </div>
  );
}
