"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/PageShell";
import { PieChart, Pie, Cell, Tooltip } from "recharts";

const STATUS_META: Record<string, { label: string; color: string }> = {
  saved: { label: "Saved", color: "#94a3b8" },
  applied: { label: "Applied", color: "#60a5fa" },
  interview: { label: "Interview", color: "#fbbf24" },
  offer: { label: "Offer", color: "#4ade80" },
  rejected: { label: "Rejected", color: "#f87171" },
  ghosted: { label: "Ghosted", color: "#9ca3af" },
  not_pursued: { label: "Not Pursued", color: "#6b7280" },
};

interface Card {
  id: string;
  title: string;
  company: string;
  location?: string;
  match_score?: number;
  applied_date?: string;
}

function scoreColor(score?: number) {
  if (!score) return "#8b8b96";
  if (score >= 75) return "#4ade80";
  if (score >= 50) return "#fbbf24";
  return "#f87171";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<Record<string, Card[]>>({});
  const [loading, setLoading] = useState(true);
  const [greetingText, setGreetingText] = useState("Hello");
  const [resumeCount, setResumeCount] = useState(0);

  useEffect(() => {
    const h = new Date().getHours();
    setGreetingText(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

    api
      .getKanban()
      .then(setBoard)
      .catch(console.error);

    api
      .listResumes()
      .then((resumes) => setResumeCount(resumes.length))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const all = Object.values(board).flat();
  const total = all.length;
  const saved = board.saved?.length || 0;
  const interview = board.interview?.length || 0;
  const offer = board.offer?.length || 0;
  const archived =
    (board.rejected?.length || 0) + (board.not_pursued?.length || 0) + (board.ghosted?.length || 0);

  const pieData = Object.entries(STATUS_META)
    .map(([key, meta]) => ({ name: meta.label, value: board[key]?.length || 0, color: meta.color }))
    .filter((d) => d.value > 0);

  const recent = [...all]
    .sort((a, b) => (b.applied_date || "").localeCompare(a.applied_date || ""))
    .slice(0, 5);

  const cards = [
    { label: "Saved", value: saved, color: "#94a3b8" },
    { label: "Applications", value: total, color: "#60a5fa" },
    { label: "Interviews", value: interview, color: "#fbbf24" },
    { label: "Offers", value: offer, color: "#4ade80" },
    { label: "Resumes", value: resumeCount, color: "#22d3ee" },
    { label: "Archived", value: archived, color: "#8b8b96" },
  ];

  return (
    <PageShell>
      <PageHeader
        className="mb-8"
        title={greetingText + (user?.full_name ? ", " + user.full_name : "")}
        subtitle="Your job search at a glance"
      />

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square bg-white dark:bg-[#16161f] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {cards.map((card) => (
            <div
              key={card.label}
              title={card.label}
              className="aspect-square bg-white dark:bg-[#16161f] rounded-xl border border-gray-200 dark:border-white/[0.08] flex flex-col items-center justify-center gap-0.5"
            >
              <p className="text-2xl font-bold" style={{ color: card.color }}>
                {card.value}
              </p>
              <p className="text-xs text-gray-500 dark:text-[#8b8b96]">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Charts + recent row */}
      {!loading && total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-6">
          {/* Status breakdown */}
          <div className="lg:col-span-2 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
            <h2 className="text-gray-900 dark:text-white font-semibold text-sm mb-4">Status Breakdown</h2>
            <div className="flex items-center gap-4">
              <div style={{ width: 140, height: 140 }}>
                <PieChart width={140} height={140}>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                    {pieData.map((d, i) => (
                      <Cell key={i} fill={d.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "#0d0d14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 12 }}
                  />
                </PieChart>
              </div>
              <div className="flex-1 space-y-2">
                {pieData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    <span className="text-gray-500 dark:text-[#8b8b96] text-xs flex-1">{d.name}</span>
                    <span className="text-gray-900 dark:text-white text-xs font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent applications */}
          <div className="lg:col-span-3 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
            <h2 className="text-gray-900 dark:text-white font-semibold text-sm mb-4">Recent Applications</h2>
            <div className="space-y-2">
              {recent.map((app) => (
                <div key={app.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.04]">
                  <div className="min-w-0">
                    <p className="text-gray-900 dark:text-white text-sm font-medium truncate">{app.title}</p>
                    <p className="text-gray-500 dark:text-[#8b8b96] text-xs truncate">{app.company}</p>
                  </div>
                  {typeof app.match_score === "number" && (
                    <span className="text-xs font-semibold shrink-0 ml-3" style={{ color: scoreColor(app.match_score) }}>
                      {app.match_score}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && total === 0 && (
        <div className="mt-10 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Getting Started</h2>
          <ol className="text-sm text-gray-500 dark:text-[#8b8b96] space-y-1.5 list-decimal list-inside">
            <li>Upload your resume under <span className="text-[#a5b4fc]">Resume</span></li>
            <li>Add a job description under <span className="text-[#a5b4fc]">Jobs</span></li>
            <li>Run AI analysis to get a match score</li>
            <li>Track your applications on the <span className="text-[#a5b4fc]">Tracker</span> board</li>
          </ol>
        </div>
      )}
    </PageShell>
  );
}




