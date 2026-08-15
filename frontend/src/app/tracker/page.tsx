"use client";


import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Loader2, GripVertical, Trash2, Search, Pencil } from "lucide-react";

const COLUMNS = [
  { key: "saved", label: "Saved", color: "#94a3b8" },
  { key: "applied", label: "Applied", color: "#60a5fa" },
  { key: "interview", label: "Interview", color: "#fbbf24" },
  { key: "offer", label: "Offer", color: "#4ade80" },
  { key: "rejected", label: "Rejected", color: "#f87171" },
  { key: "ghosted", label: "Ghosted", color: "#9ca3af" },
  { key: "not_pursued", label: "Not Pursued", color: "#6b7280" },
];

interface AppCard {
  id: string;
  job_id: string;
  title: string;
  company: string;
  location?: string;
  match_score?: number;
  applied_date?: string;
  notes?: string;
}

type Board = Record<string, AppCard[]>;

export default function TrackerPage() {
  const [board, setBoard] = useState<Board>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<{ card: AppCard; from: string } | null>(null);

  useEffect(() => {
    api.getKanban().then(setBoard).catch(console.error).finally(() => setLoading(false));
  }, []);

  const matchesQuery = (card: AppCard) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [card.title, card.company, card.location, card.notes]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(q));
  };

  const handleDragStart = (card: AppCard, from: string) => setDragging({ card, from });

  const handleDrop = async (to: string) => {
    if (!dragging || dragging.from === to) return;
    const { card, from } = dragging;
    setBoard((prev) => {
      const updated = { ...prev };
      updated[from] = updated[from].filter((c) => c.id !== card.id);
      updated[to] = [card, ...(updated[to] || [])];
      return updated;
    });
    setDragging(null);
    try {
      await api.updateApplication(card.id, { status: to });
    } catch (e) {
      console.error("Failed to update status", e);
    }
  };

  const handleDelete = async (id: string, status: string) => {
    if (!confirm("Remove this application?")) return;
    setBoard((prev) => ({
      ...prev,
      [status]: prev[status].filter((c) => c.id !== id),
    }));
    try {
      await api.deleteApplication(id);
    } catch (e) {
      console.error("Failed to delete", e);
    }
  };

  const scoreColor = (score?: number) => {
    if (!score) return "#8b8b96";
    if (score >= 75) return "#4ade80";
    if (score >= 50) return "#fbbf24";
    return "#f87171";
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500 dark:text-[#8b8b96] min-h-screen">
        <Loader2 className="animate-spin w-5 h-5" />
        Loading tracker…
      </div>
    );
  }

  return (
    <div className="p-8 min-h-screen">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Application Tracker</h1>
      <p className="text-gray-500 dark:text-[#8b8b96] mb-6">Drag cards between columns to update status</p>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-[#5a5a64] pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, company, location, or notes…"
          className="w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] pl-10 pr-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-colors"
        />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map(({ key, label, color }) => {
          const cards = (board[key] || []).filter(matchesQuery);
          return (
          <div
            key={key}
            className="w-60 shrink-0"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(key)}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="font-semibold text-sm text-gray-900 dark:text-white">{label}</span>
              <span className="ml-auto text-xs text-gray-500 dark:text-[#8b8b96] bg-gray-100 dark:bg-white/[0.05] px-2 py-0.5 rounded-full">
                {cards.length}
              </span>
            </div>

            <div className="space-y-2 min-h-[100px]">
              {cards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={() => handleDragStart(card, key)}
                  className="group bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-3.5 cursor-grab active:cursor-grabbing hover:border-white/[0.15] transition-colors"
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical className="w-3.5 h-3.5 text-gray-400 dark:text-[#5a5a64] mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{card.title}</p>
                      <p className="text-xs text-gray-500 dark:text-[#8b8b96] truncate">{card.company}</p>
                      {card.location && <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">{card.location}</p>}
                      {card.match_score && (
                        <p className="text-xs font-semibold mt-1.5" style={{ color: scoreColor(card.match_score) }}>
                          {card.match_score}% match
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/jobs?job_id=${card.job_id}`}
                        title="Edit in Jobs"
                        className="text-gray-400 dark:text-[#5a5a64] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-0.5"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(card.id, key)}
                        className="text-gray-400 dark:text-[#5a5a64] hover:text-red-600 dark:text-red-400 transition-colors p-0.5"
                        title="Remove"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {cards.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 dark:border-white/[0.06] rounded-xl h-16 flex items-center justify-center">
                  <p className="text-xs text-gray-400 dark:text-[#5a5a64]">{query.trim() ? "No matches" : "Drop here"}</p>
                </div>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}


