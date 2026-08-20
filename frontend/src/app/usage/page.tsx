"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageLoading, PageShell } from "@/components/PageShell";
import { RefreshCw, Cpu, Coins, Activity } from "lucide-react";

interface UsageRecord {
  id: string;
  user_id: string;
  user_email: string;
  feature: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
  status: string;
  error?: string | null;
  created_at: string | null;
}

interface UsageSummary {
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost: number;
}

interface UsageUser {
  id: string;
  email: string;
  full_name?: string | null;
}

const FEATURE_LABELS: Record<string, string> = {
  analyze_match: "Match Analysis",
  cover_letter: "Cover Letter",
  extract_resume_skills: "Resume Skills",
  extract_job_skills: "Job Skills",
  extract_job: "Job Extraction",
};

const featureLabel = (feature: string) => FEATURE_LABELS[feature] || feature;

const formatTokens = (n: number) => n.toLocaleString();

const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

export default function UsagePage() {
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [summary, setSummary] = useState<UsageSummary>({
    calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    cost: 0,
  });
  const [users, setUsers] = useState<UsageUser[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [featureFilter, setFeatureFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    setError("");
    try {
      const data = await api.getAIUsage({
        ...(userFilter ? { user_id: userFilter } : {}),
        ...(featureFilter ? { feature: featureFilter } : {}),
      });
      setRecords(data.records || []);
      setSummary(data.summary);
      setUsers(data.users || []);
      setFeatures(data.features || []);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setError("Admin access required.");
      } else {
        setError("Could not load AI usage.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userFilter, featureFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const summaryCards = [
    { label: "AI Calls", value: formatTokens(summary.calls), color: "#60a5fa", icon: Activity },
    { label: "Total Tokens", value: formatTokens(summary.total_tokens), color: "#a78bfa", icon: Cpu },
    { label: "Est. Cost", value: formatCost(summary.cost), color: "#4ade80", icon: Coins },
  ];

  if (loading) {
    return <PageLoading message="Loading AI usage..." />;
  }

  return (
    <PageShell maxWidth="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">AI Usage</h1>
          <p className="text-gray-500 dark:text-[#8b8b96]">
            Token usage and estimated cost per user (admin only)
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96] border border-gray-200 dark:border-white/[0.08] px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5 flex items-center gap-4"
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${card.color}22`, color: card.color }}
            >
              <card.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold text-gray-900 dark:text-white truncate" style={{ color: card.color }}>
                {card.value}
              </p>
              <p className="text-xs text-gray-500 dark:text-[#8b8b96]">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white cursor-pointer outline-none focus:border-indigo-500 max-w-[260px]"
        >
          <option value="">All Users</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name ? `${u.full_name} (${u.email})` : u.email}
            </option>
          ))}
        </select>
        <select
          value={featureFilter}
          onChange={(e) => setFeatureFilter(e.target.value)}
          className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white cursor-pointer outline-none focus:border-indigo-500 max-w-[260px]"
        >
          <option value="">All Features</option>
          {features.map((f) => (
            <option key={f} value={f}>
              {featureLabel(f)}
            </option>
          ))}
        </select>
        {(userFilter || featureFilter) && (
          <button
            onClick={() => {
              setUserFilter("");
              setFeatureFilter("");
            }}
            className="text-sm text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
        {records.length === 0 ? (
          <p className="text-gray-400 dark:text-[#5a5a64] text-sm text-center py-10">
            No AI usage recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a64] border-b border-gray-100 dark:border-white/[0.06]">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">User</th>
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold text-right">Prompt</th>
                  <th className="px-4 py-3 font-semibold text-right">Output</th>
                  <th className="px-4 py-3 font-semibold text-right">Total</th>
                  <th className="px-4 py-3 font-semibold text-right">Est. Cost</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                {records.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-gray-50 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8b8b96] whitespace-nowrap">
                      {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium truncate max-w-[200px]" title={r.user_email}>
                      {r.user_email}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-[#c0c0c8]">{featureLabel(r.feature)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-[#8b8b96]">{r.model || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-[#c0c0c8] text-right">{formatTokens(r.prompt_tokens)}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-[#c0c0c8] text-right">{formatTokens(r.completion_tokens)}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium text-right">{formatTokens(r.total_tokens)}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white text-right">{formatCost(r.cost)}</td>
                    <td className="px-4 py-3">
                      <span
                        title={r.error || ""}
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          r.status === "success"
                            ? "bg-green-500/15 text-green-700 dark:text-green-300"
                            : "bg-red-500/15 text-red-700 dark:text-red-300"
                        }`}
                      >
                        {r.status === "success" ? "OK" : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400 dark:text-[#5a5a64]">
        Costs are estimates based on model token pricing and may not match the final bill.
      </p>
    </PageShell>
  );
}
