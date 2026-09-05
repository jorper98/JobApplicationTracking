"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PageHeader, PageLoading, PageShell } from "@/components/PageShell";
import { GripVertical, Search, Pencil, Eye, ChevronDown, LayoutGrid, Archive } from "lucide-react";
import { JobViewModal } from "@/components/JobViewModal";

const ACTIVE_COLUMNS = [
  { key: "saved", label: "Saved", color: "#94a3b8" },
  { key: "applied", label: "Applied", color: "#60a5fa" },
  { key: "interview", label: "Interview", color: "#fbbf24" },
  { key: "offer", label: "Offer", color: "#4ade80" },
];

const ARCHIVE_COLUMNS = [
  { key: "rejected", label: "Rejected", color: "#f87171" },
  { key: "ghosted", label: "Ghosted", color: "#9ca3af" },
  { key: "not_pursued", label: "Not Pursued", color: "#6b7280" },
];

const LS = {
  compact: "jobtracker.tracker.compact",
  collapsed: "jobtracker.tracker.collapsed",
};

const DEFAULT_COLLAPSED: Record<string, boolean> = {
  rejected: true,
  ghosted: true,
  not_pursued: true,
};

interface AppCard {
  id: string;
  job_id: string;
  title: string;
  company: string;
  company_id?: string | null;
  location?: string;
  match_score?: number;
  applied_date?: string;
  notes?: string;
  note_count?: number;
}

type Board = Record<string, AppCard[]>;

export default function TrackerPage() {
  const [board, setBoard] = useState<Board>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [dragging, setDragging] = useState<{ card: AppCard; from: string } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(DEFAULT_COLLAPSED);
  const [viewJob, setViewJob] = useState<{ jobId: string; status: string } | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(LS.compact) === "true") setCompact(true);
      const col = localStorage.getItem(LS.collapsed);
      if (col !== null) setCollapsed(JSON.parse(col));
    } catch {
      // localStorage unavailable — keep defaults
    }
    api.getKanban().then(setBoard).catch(console.error).finally(() => setLoading(false));
    api
      .listCompanies()
      .then(setCompanies)
      .catch(console.error);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS.compact, String(compact));
    } catch {
      /* ignore */
    }
  }, [compact]);

  useEffect(() => {
    try {
      localStorage.setItem(LS.collapsed, JSON.stringify(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  const matchesQuery = (card: AppCard) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [card.title, card.company, card.location, card.notes]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q));
  };

  const matchesCompany = (card: AppCard) => {
    if (!companyFilter) return true;
    const selected = companies.find((c) => c.id === companyFilter);
    return (
      card.company_id === companyFilter ||
      (!!selected && (card.company || "").toLowerCase() === selected.name.toLowerCase())
    );
  };

  const allColumns = [...ACTIVE_COLUMNS, ...ARCHIVE_COLUMNS];

  const totalActive = ACTIVE_COLUMNS.reduce((sum, { key }) => sum + (board[key] || []).length, 0);
  const totalArchive = ARCHIVE_COLUMNS.reduce((sum, { key }) => sum + (board[key] || []).length, 0);
  const allActiveCollapsed = ACTIVE_COLUMNS.every(({ key }) => collapsed[key]);
  const allArchiveCollapsed = ARCHIVE_COLUMNS.every(({ key }) => collapsed[key]);

  const toggleGroup = (columns: typeof ACTIVE_COLUMNS, allCollapsed: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev };
      columns.forEach(({ key }) => {
        next[key] = allCollapsed ? false : true;
      });
      return next;
    });
  };

  const handleDragStart = (card: AppCard, from: string) => setDragging({ card, from });

  const moveCardStatus = async (card: AppCard, from: string, to: string) => {
    if (from === to) return;
    const prev = board;
    setBoard((prevState) => {
      const updated = { ...prevState };
      updated[from] = updated[from].filter((c) => c.id !== card.id);
      updated[to] = [card, ...(updated[to] || [])];
      return updated;
    });
    setDragging(null);
    try {
      await api.updateApplication(card.id, { status: to });
    } catch (e) {
      console.error("Failed to update status", e);
      setBoard(prev);
    }
  };

  const handleDrop = async (to: string) => {
    setDragOver(null);
    if (!dragging) return;
    const { card, from } = dragging;
    setDragging(null);
    await moveCardStatus(card, from, to);
  };

  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(key);
  };

  const handleDragLeave = (key: string) => (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver((cur) => (cur === key ? null : cur));
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return <PageLoading message="Loading tracker…" />;
  }

  const inputClass =
    "rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors";
  const statusSelectClass =
    "rounded-md border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#0d0d14] px-1.5 py-1 text-[11px] text-gray-600 dark:text-[#c0c0c8] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

  return (
    <PageShell>
      <PageHeader title="Application Tracker" subtitle="Drag cards between columns to update status" />

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-[#5a5a64] pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, company, location, or notes…"
            className={inputClass + " w-full pl-10"}
          />
        </div>

        <select
          value={companyFilter}
          onChange={(event) => setCompanyFilter(event.target.value)}
          className={inputClass + " cursor-pointer max-w-[220px]"}
        >
          <option value="">All Companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>

        <button
          onClick={() => setCompact(!compact)}
          role="switch"
          aria-checked={compact}
          className="flex items-center gap-2 text-sm text-gray-600 dark:text-[#c0c0c8] hover:text-gray-900 dark:hover:text-white transition-colors"
          title="Toggle compact card view"
        >
          <span
            className={`relative w-8 h-[18px] rounded-full transition-colors ${
              compact ? "bg-indigo-600" : "bg-gray-300 dark:bg-white/[0.12]"
            }`}
          >
            <span
              className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow transition-all ${
                compact ? "left-4" : "left-0.5"
              }`}
            />
          </span>
          Compact View
        </button>

        <button
          onClick={() => toggleGroup(ACTIVE_COLUMNS, allActiveCollapsed)}
          title={allActiveCollapsed ? "Expand all pipeline columns" : "Collapse all pipeline columns"}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#c0c0c8] hover:text-gray-900 dark:hover:text-white transition-colors px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:border-indigo-500/40"
        >
          <LayoutGrid className="w-3.5 h-3.5" />
          Pipeline ({totalActive})
        </button>

        <button
          onClick={() => toggleGroup(ARCHIVE_COLUMNS, allArchiveCollapsed)}
          title={allArchiveCollapsed ? "Expand archive columns" : "Collapse archive columns"}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-[#c0c0c8] hover:text-gray-900 dark:hover:text-white transition-colors px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:border-indigo-500/40"
        >
          <Archive className="w-3.5 h-3.5" />
          Archive ({totalArchive})
        </button>

        {(query || companyFilter) && (
          <button
            onClick={() => {
              setQuery("");
              setCompanyFilter("");
            }}
            className="text-sm text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {allColumns.map(({ key, label, color }) => {
          const cards = (board[key] || []).filter(matchesQuery).filter(matchesCompany);
          const isCollapsed = !!collapsed[key];
          const isOver = dragOver === key;

          if (isCollapsed) {
            return (
              <div
                key={key}
                className="w-11 shrink-0"
                onDragOver={handleDragOver(key)}
                onDragLeave={handleDragLeave(key)}
                onDrop={() => handleDrop(key)}
              >
                <button
                  onClick={() => toggleCollapse(key)}
                  title={`Expand ${label}`}
                  className={`flex flex-col items-center gap-3 w-full h-full py-4 rounded-xl border transition-colors ${
                    isOver
                      ? "border-indigo-500/60 bg-indigo-500/5"
                      : "border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] hover:border-indigo-500/40"
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="flex-1 [writing-mode:vertical-rl] rotate-180 text-xs font-semibold text-gray-900 dark:text-white tracking-wide">
                    {label}
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-[#8b8b96] bg-gray-100 dark:bg-white/[0.05] px-1.5 py-0.5 rounded-full shrink-0">
                    {cards.length}
                  </span>
                </button>
              </div>
            );
          }

          return (
            <div
              key={key}
              className={`w-60 shrink-0 rounded-xl transition-colors ${
                isOver ? "bg-indigo-500/[0.04] ring-1 ring-indigo-500/30" : ""
              }`}
              onDragOver={handleDragOver(key)}
              onDragLeave={handleDragLeave(key)}
              onDrop={() => handleDrop(key)}
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <button
                  onClick={() => toggleCollapse(key)}
                  title="Collapse column"
                  className="text-gray-400 dark:text-[#5a5a64] hover:text-gray-900 dark:hover:text-white transition-colors p-0.5 -ml-1"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">{label}</span>
                <span className="ml-auto text-xs text-gray-500 dark:text-[#8b8b96] bg-gray-100 dark:bg-white/[0.05] px-2 py-0.5 rounded-full shrink-0">
                  {cards.length}
                </span>
              </div>

              <div className="space-y-2 max-h-[65vh] overflow-y-auto overscroll-contain pr-1">
                {cards.map((card) =>
                  compact ? (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card, key)}
                      className="group flex items-center gap-1.5 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-indigo-500/40 transition-colors"
                    >
                      <GripVertical className="w-3 h-3 text-gray-400 dark:text-[#5a5a64] shrink-0" />
                      <p className="flex-1 min-w-0 text-xs font-medium text-gray-900 dark:text-white truncate">
                        {card.title}
                        <span className="text-gray-400 dark:text-[#5a5a64]"> · {card.company}</span>
                      </p>
                      {typeof card.note_count === "number" && card.note_count > 0 && (
                        <span
                          title={`${card.note_count} ${card.note_count === 1 ? "note" : "notes"}`}
                          className="shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96] opacity-100 group-hover:opacity-0 transition-opacity"
                        >
                          {card.note_count}
                        </span>
                      )}
                      <label className="sr-only" htmlFor={`status-${card.id}`}>
                        Move {card.title} to status
                      </label>
                      <select
                        id={`status-${card.id}`}
                        value={key}
                        onChange={(event) => moveCardStatus(card, key, event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                        className={statusSelectClass + " max-w-[86px] opacity-0 group-hover:opacity-100 focus:opacity-100"}
                      >
                        {allColumns.map((column) => (
                          <option key={column.key} value={column.key}>
                            {column.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setViewJob({ jobId: card.job_id, status: key })}
                        title="View job"
                        className="shrink-0 text-gray-400 dark:text-[#5a5a64] hover:text-indigo-600 dark:hover:text-indigo-400 transition-all p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                      <Link
                        href={`/jobs?job_id=${card.job_id}`}
                        title="Open in Jobs"
                        className="shrink-0 text-gray-400 dark:text-[#5a5a64] hover:text-indigo-600 dark:hover:text-indigo-400 transition-all p-0.5 opacity-0 group-hover:opacity-100"
                      >
                        <Pencil className="w-3 h-3" />
                      </Link>
                    </div>
                  ) : (
                    <div
                      key={card.id}
                      draggable
                      onDragStart={() => handleDragStart(card, key)}
                      className="group bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-indigo-500/40 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <GripVertical className="w-3.5 h-3.5 text-gray-400 dark:text-[#5a5a64] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{card.title}</p>
                          <p className="text-xs text-gray-500 dark:text-[#8b8b96] truncate">{card.company}</p>
                        </div>
                        {typeof card.note_count === "number" && card.note_count > 0 && (
                          <span
                            title={`${card.note_count} ${card.note_count === 1 ? "note" : "notes"}`}
                            className="self-start shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96] opacity-100 group-hover:opacity-0 transition-opacity"
                          >
                            {card.note_count}
                          </span>
                        )}
                        <button
                          onClick={() => setViewJob({ jobId: card.job_id, status: key })}
                          title="View job"
                          className="shrink-0 text-gray-400 dark:text-[#5a5a64] hover:text-indigo-600 dark:hover:text-indigo-400 transition-all p-0.5 opacity-0 group-hover:opacity-100"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <Link
                          href={`/jobs?job_id=${card.job_id}`}
                          title="Open in Jobs"
                          className="shrink-0 text-gray-400 dark:text-[#5a5a64] hover:text-indigo-600 dark:hover:text-indigo-400 transition-all p-0.5 opacity-0 group-hover:opacity-100"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <div className="mt-2">
                        <label className="sr-only" htmlFor={`status-${card.id}`}>
                          Move {card.title} to status
                        </label>
                        <select
                          id={`status-${card.id}`}
                          value={key}
                          onChange={(event) => moveCardStatus(card, key, event.target.value)}
                          onMouseDown={(event) => event.stopPropagation()}
                          className={statusSelectClass + " w-full"}
                        >
                          {allColumns.map((column) => (
                            <option key={column.key} value={column.key}>
                              {column.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )
                )}
                {cards.length === 0 && (
                  <div
                    className={`border-2 border-dashed rounded-xl flex items-center justify-center transition-all duration-200 ${
                      isOver
                        ? "border-indigo-500/60 bg-indigo-500/5 h-32"
                        : "border-gray-200 dark:border-white/[0.06] h-12 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <p className="text-xs text-gray-400 dark:text-[#5a5a64] px-2 text-center">
                      {query.trim() || companyFilter ? "No matches" : isOver ? "Release to move here" : "Empty"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <JobViewModal
        jobId={viewJob?.jobId ?? null}
        status={viewJob?.status}
        onClose={() => setViewJob(null)}
      />
    </PageShell>
  );
}
