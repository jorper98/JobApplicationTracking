"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/PageShell";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { Briefcase, Building2, Contact as ContactIcon, Search, ChevronRight } from "lucide-react";
import { type Job } from "@/lib/types";

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
  job_id: string;
  title: string;
  company: string;
  location?: string;
  match_score?: number;
  applied_date?: string;
  notes?: string;
}

interface Company {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
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
  const [companyCount, setCompanyCount] = useState(0);
  const [contactCount, setContactCount] = useState(0);
  const [resumeCount, setResumeCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [listsReady, setListsReady] = useState(false);
  const [notesIndex, setNotesIndex] = useState<Record<string, { text: string; count: number }>>({});
  const [notesLoaded, setNotesLoaded] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    setGreetingText(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");

    Promise.all([
      api.getKanban().then(setBoard),
      api.listCompanies().then((list) => {
        setCompanies(list);
        setCompanyCount(list.length);
      }),
      api.listContacts().then((list) => {
        setContacts(list);
        setContactCount(list.length);
      }),
      api.listResumes().then((list) => setResumeCount(list.length)),
      api.listJobs().then((list) => {
        setJobs(list);
        setJobCount(list.length);
      }),
    ])
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        setListsReady(true);
      });
  }, []);

  // Notes are not part of the list payloads, so prefetch them once in the
  // background after the lists load; searching note text is then instant.
  useEffect(() => {
    if (!listsReady || notesLoaded) return;
    let cancelled = false;
    const collect = async (
      entries: { key: string; id: string }[],
      loader: (id: string) => Promise<{ note?: string }[]>
    ): Promise<Record<string, { text: string; count: number }>> => {
      const rows = await Promise.all(
        entries.map(async (entry) => {
          try {
            const notes = await loader(entry.id);
            return [entry.key, { text: notes.map((n) => n.note || "").join("\n"), count: notes.length }] as const;
          } catch {
            return [entry.key, { text: "", count: 0 }] as const;
          }
        })
      );
      return Object.fromEntries(rows) as Record<string, { text: string; count: number }>;
    };
    (async () => {
      const [jobNotes, companyNotes, contactNotes] = await Promise.all([
        collect(
          jobs.map((j) => ({ key: `job:${j.id}`, id: j.id })),
          (id) => api.listJobNotes(id)
        ),
        collect(
          companies.map((c) => ({ key: `company:${c.id}`, id: c.id })),
          (id) => api.listCompanyNotes(id)
        ),
        collect(
          contacts.map((c) => ({ key: `contact:${c.id}`, id: c.id })),
          (id) => api.listContactNotes(id)
        ),
      ]);
      if (!cancelled) {
        setNotesIndex({ ...jobNotes, ...companyNotes, ...contactNotes });
        setNotesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listsReady, jobs, companies, contacts, notesLoaded]);

  const all = Object.values(board).flat();
  const total = all.length;
  const applicationsCount =
    total - (board.saved?.length || 0) - (board.not_pursued?.length || 0);

  const pieData = Object.entries(STATUS_META)
    .map(([key, meta]) => ({ key, name: meta.label, value: board[key]?.length || 0, color: meta.color }))
    .filter((d) => d.value > 0);

  const recent = [...all]
    .sort((a, b) => (b.applied_date || "").localeCompare(a.applied_date || ""))
    .slice(0, 5);

  const q = searchQuery.trim().toLowerCase();
  const notesSearching = !!q && !notesLoaded;

  const noteSnippet = (type: "job" | "company" | "contact", id: string): string => {
    const text = notesIndex[`${type}:${id}`]?.text || "";
    const i = text.toLowerCase().indexOf(q);
    if (i < 0) return "";
    const start = Math.max(0, i - 35);
    const end = Math.min(text.length, i + q.length + 65);
    return (start > 0 ? "…" : "") + text.slice(start, end).trim() + (end < text.length ? "…" : "");
  };

  interface SearchHit {
    type: "job" | "company" | "contact";
    id: string;
    title: string;
    sub: string;
    href: string;
  }

  const searchResults: SearchHit[] = (() => {
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const j of jobs) {
      const fieldHit = [j.title, j.company, j.location, j.description].some((f) =>
        (f || "").toLowerCase().includes(q)
      );
      const snippet = noteSnippet("job", j.id);
      if (fieldHit || snippet) {
        hits.push({
          type: "job",
          id: j.id,
          title: j.title,
          sub: fieldHit ? j.company || "" : `Note — ${snippet}`,
          href: `/jobs?job_id=${j.id}`,
        });
      }
    }
    for (const c of companies) {
      const fieldHit = (c.name || "").toLowerCase().includes(q);
      const snippet = noteSnippet("company", c.id);
      if (fieldHit || snippet) {
        hits.push({
          type: "company",
          id: c.id,
          title: c.name,
          sub: fieldHit ? "Company" : `Note — ${snippet}`,
          href: `/companies?company_id=${c.id}`,
        });
      }
    }
    for (const c of contacts) {
      const fieldHit = [c.name, c.email, c.phone].some((f) =>
        (f || "").toLowerCase().includes(q)
      );
      const snippet = noteSnippet("contact", c.id);
      if (fieldHit || snippet) {
        hits.push({
          type: "contact",
          id: c.id,
          title: c.name,
          sub: fieldHit ? c.email || c.phone || "Contact" : `Note — ${snippet}`,
          href: `/contacts?contact_id=${c.id}`,
        });
      }
    }
    return hits.slice(0, 12);
  })();

  // Applications count their records' job notes; the tracker's own per-card
  // notes field is unused, so counting it would always show 0.
  const applicationJobIds = new Set<string>();
  Object.entries(board).forEach(([status, apps]) => {
    if (status === "saved" || status === "not_pursued") return;
    apps.forEach((a) => applicationJobIds.add(a.job_id));
  });
  const applicationsNotes = Array.from(applicationJobIds).reduce(
    (sum, id) => sum + (notesIndex[`job:${id}`]?.count || 0),
    0
  );

  const cards = [
    {
      label: "Jobs",
      value: jobCount,
      color: "#60a5fa",
      href: "/jobs",
      notes: jobs.reduce((sum, j) => sum + (notesIndex[`job:${j.id}`]?.count || 0), 0),
    },
    {
      label: "Applications",
      value: applicationsCount,
      color: "#34d399",
      href: "/tracker",
      notes: applicationsNotes,
    },
    {
      label: "Companies",
      value: companyCount,
      color: "#fbbf24",
      href: "/companies",
      notes: companies.reduce((sum, c) => sum + (notesIndex[`company:${c.id}`]?.count || 0), 0),
    },
    {
      label: "Contacts",
      value: contactCount,
      color: "#a78bfa",
      href: "/contacts",
      notes: contacts.reduce((sum, c) => sum + (notesIndex[`contact:${c.id}`]?.count || 0), 0),
    },
    { label: "Resumes", value: resumeCount, color: "#22d3ee", href: "/resume" },
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
        <div className="flex flex-wrap gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="w-20 h-20 bg-white dark:bg-[#16161f] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              title={card.label}
              className="w-24 h-24 bg-white dark:bg-[#16161f] rounded-xl border border-gray-200 dark:border-white/[0.08] flex flex-col items-center justify-center gap-1 hover:border-indigo-500/50 hover:ring-1 hover:ring-indigo-500/20 hover:shadow-md transition-all"
            >
              <p className="text-xl font-bold leading-none" style={{ color: card.color }}>
                {card.value}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-[#8b8b96]">{card.label}</p>
              {"notes" in card && notesLoaded && (
                <p className="text-[9px] text-gray-400 dark:text-[#6b6b72]">
                  {card.notes} {card.notes === 1 ? "note" : "notes"}
                </p>
              )}
            </Link>
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
                  <Link key={d.key} href={`/jobs?status=${d.key}`} className="flex items-center gap-2 group">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-gray-500 dark:text-[#8b8b96] text-xs flex-1 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                      {d.name}
                    </span>
                    <span className="text-gray-900 dark:text-white text-xs font-medium group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {d.value}
                    </span>
                    <ChevronRight className="w-3 h-3 text-gray-400 dark:text-[#5a5a64] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* Recent applications + search */}
          <div className="lg:col-span-3 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-gray-900 dark:text-white font-semibold text-sm">Recent Applications</h2>
              <div className="relative w-52 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5a5a64]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search jobs, companies, contacts, notes..."
                  className="w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {searchQuery.trim() ? (
              <div className="space-y-2">
                {searchResults.length === 0 ? (
                  notesSearching ? (
                    <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">
                      Searching notes…
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">No matches found.</p>
                  )
                ) : (
                  searchResults.map((r) => (
                    <Link
                      key={`${r.type}-${r.id}`}
                      href={r.href}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.04] hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors group"
                    >
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          r.type === "company"
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                            : r.type === "job"
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                            : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                        }`}
                      >
                        {r.type === "company" ? (
                          <Building2 className="w-3.5 h-3.5" />
                        ) : r.type === "job" ? (
                          <Briefcase className="w-3.5 h-3.5" />
                        ) : (
                          <ContactIcon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-gray-900 dark:text-white text-sm font-medium truncate">{r.title}</p>
                        <p className="text-gray-500 dark:text-[#8b8b96] text-xs truncate">{r.sub}</p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-[#5a5a64] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {recent.map((app) => (
                  <Link
                    key={app.id}
                    href={`/jobs?job_id=${app.job_id}`}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/[0.04] hover:border-indigo-500/40 hover:bg-indigo-500/5 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-gray-900 dark:text-white text-sm font-medium truncate">{app.title}</p>
                      <p className="text-gray-500 dark:text-[#8b8b96] text-xs truncate">{app.company}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {typeof app.match_score === "number" && (
                        <span className="text-xs font-semibold" style={{ color: scoreColor(app.match_score) }}>
                          {app.match_score}%
                        </span>
                      )}
                      <ChevronRight className="w-3.5 h-3.5 text-gray-400 dark:text-[#5a5a64] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
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




