"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/PageShell";
import {
  History,
  Briefcase,
  Building2,
  Contact as ContactIcon,
  FileText,
  StickyNote,
  Database,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react";

interface ActivityEntry {
  id: string;
  action: string; // created | updated | deleted
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: string | null;
  created_at?: string | null;
}

const ACTION_META: Record<string, { label: string; badge: string; icon: typeof Plus }> = {
  created: {
    label: "Created",
    badge: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
    icon: Plus,
  },
  updated: {
    label: "Updated",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    icon: Pencil,
  },
  deleted: {
    label: "Deleted",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    icon: Trash2,
  },
};

const TYPE_META: Record<string, { label: string; icon: typeof Briefcase; color: string }> = {
  job: { label: "Job", icon: Briefcase, color: "bg-blue-500/15 text-blue-600 dark:text-blue-300" },
  application: { label: "Application", icon: CheckCircle2, color: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300" },
  company: { label: "Company", icon: Building2, color: "bg-amber-500/15 text-amber-600 dark:text-amber-300" },
  contact: { label: "Contact", icon: ContactIcon, color: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" },
  note: { label: "Note", icon: StickyNote, color: "bg-gray-500/15 text-gray-600 dark:text-gray-300" },
  resume: { label: "Resume", icon: FileText, color: "bg-teal-500/15 text-teal-600 dark:text-teal-300" },
  data: { label: "Data", icon: Database, color: "bg-purple-500/15 text-purple-600 dark:text-purple-300" },
};

function recordHref(entry: ActivityEntry): string | undefined {
  if (!entry.entity_id) return undefined;
  if (entry.entity_type === "job") return `/jobs?job_id=${entry.entity_id}`;
  if (entry.entity_type === "company") return `/companies?company_id=${entry.entity_id}`;
  if (entry.entity_type === "contact") return `/contacts?contact_id=${entry.entity_id}`;
  return undefined;
}

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api
      .getActivity()
      .then((data) => setEntries(data || []))
      .catch(() => setError("Could not load activity"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageShell>
      <PageHeader
        title="Activity"
        subtitle="Recent changes to your data — adds, edits, and deletes"
        className="mb-6"
      />

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-16 bg-white dark:bg-[#16161f] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white dark:bg-[#16161f]/50 border border-dashed border-gray-200 dark:border-white/[0.1] rounded-xl p-12 text-center">
          <History className="w-8 h-8 mx-auto text-gray-300 dark:text-[#3a3a42] mb-2" />
          <p className="text-gray-400 dark:text-[#5a5a64] text-sm">
            No activity yet. Adds, edits, and deletes will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const actionMeta = ACTION_META[entry.action] || ACTION_META.updated;
            const ActionIcon = actionMeta.icon;
            const typeMeta = TYPE_META[entry.entity_type] || {
              label: entry.entity_type,
              icon: StickyNote,
              color: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
            };
            const TypeIcon = typeMeta.icon;
            const href = recordHref(entry);

            const when = entry.created_at
              ? new Date(entry.created_at).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "—";

            const title = entry.entity_name || entry.entity_type;

            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] px-4 py-3"
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${typeMeta.color}`}>
                  <TypeIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${actionMeta.badge}`}>
                      <ActionIcon className="w-3 h-3" />
                      {actionMeta.label}
                    </span>
                    {href ? (
                      <Link
                        href={href}
                        className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{title}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">
                    {typeMeta.label}
                    {entry.details ? ` — ${entry.details}` : ""}
                  </p>
                </div>
                <div className="text-xs text-gray-400 dark:text-[#6b6b72] shrink-0 text-right whitespace-nowrap">
                  {when}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
