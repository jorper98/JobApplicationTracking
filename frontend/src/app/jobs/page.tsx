"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Plus, Trash2, Pencil, Search } from "lucide-react";
import { JobModal } from "@/components/JobModal";

interface Job {
  id: string;
  title: string;
  company: string;
  description?: string;
  url?: string;
  location?: string;
  extracted_skills?: string[];
}

interface JobNote {
  id: string;
  job_id: string;
  note: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { key: "", label: "All Statuses" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
  { key: "ghosted", label: "Ghosted" },
  { key: "not_pursued", label: "Not Pursued" },
];

const STATUS_BADGE: Record<string, string> = {
  saved: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  applied: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  interview: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  offer: "bg-green-500/15 text-green-700 dark:text-green-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  ghosted: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  not_pursued: "bg-gray-200 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
};

export default function JobsPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [jobNotes, setJobNotes] = useState<JobNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [tracking, setTracking] = useState(false);

  const inputClass =
    "bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";

  const loadAll = () => {
    api.listJobs().then(setJobs).catch(console.error);
    api
      .getKanban()
      .then((board: Record<string, { job_id: string }[]>) => {
        const map: Record<string, string> = {};
        Object.entries(board).forEach(([status, cards]) =>
          cards.forEach((c) => {
            map[c.job_id] = status;
          })
        );
        setStatusMap(map);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadAll();
    if (searchParams.get("new") === "true") {
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Fetch notes for all jobs so search covers notes too
  useEffect(() => {
    if (jobs.length === 0) return;
    let cancelled = false;
    Promise.all(
      jobs.map((j) =>
        api
          .listJobNotes(j.id)
          .then((notes) => ({ id: j.id, notes }))
          .catch(() => ({ id: j.id, notes: [] as JobNote[] }))
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, string> = {};
      results.forEach((r: { id: string; notes: JobNote[] }) => {
        map[r.id] = r.notes.map((n) => n.note).join(" ");
      });
      setNotesMap(map);
    });
    return () => {
      cancelled = true;
    };
  }, [jobs]);

  const allTags = Array.from(new Set(jobs.flatMap((j) => j.extracted_skills || []))).sort();

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter && (statusMap[job.id] || "saved") !== statusFilter) return false;
    if (tagFilter && !(job.extracted_skills || []).includes(tagFilter)) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
      job.title,
      job.company,
      job.location,
      job.url,
      job.description,
      (job.extracted_skills || []).join(" "),
      notesMap[job.id] || "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });

  const openAddModal = () => {
    setEditingJob(null);
    setModalOpen(true);
  };

  const openEditModal = (job: Job) => {
    setEditingJob(job);
    setModalOpen(true);
  };

  const handleModalSave = (savedJob: any) => {
    if (editingJob) {
      setJobs((prev) => prev.map((j) => (j.id === savedJob.id ? savedJob : j)));
    } else {
      setJobs((prev) => [savedJob, ...prev]);
    }
    api
      .getKanban()
      .then((board: Record<string, { job_id: string }[]>) => {
        const map: Record<string, string> = {};
        Object.entries(board).forEach(([status, cards]) =>
          cards.forEach((c) => {
            map[c.job_id] = status;
          })
        );
        setStatusMap(map);
      })
      .catch(console.error);
  };

  const fetchNotes = async (jobId: string) => {
    setNotesLoading(true);
    try {
      const notes = await api.listJobNotes(jobId);
      setJobNotes(notes);
    } catch (e) {
      console.error("Failed to load notes", e);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleSelectJob = async (job: Job) => {
    setSelectedJob(job);
    setAnalysis(null);
    await fetchNotes(job.id);
    // Load the saved analysis if one exists - no auto-analysis.
    try {
      const analyses = await api.getAnalysisForJob(job.id);
      if (analyses && analyses.length > 0) {
        setAnalysis(analyses[analyses.length - 1]);
      }
    } catch (e) {
      console.error("Failed to load analysis", e);
    }
  };

  const handleAnalyze = async (job: Job) => {
    setAnalyzing(true);
    try {
      const resume = await api.getActiveResume();
      const result = await api.analyzeMatch(job.id, resume.id);
      setAnalysis(result);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Analysis failed - make sure you have an active resume");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedJob || !noteText.trim()) return;
    try {
      await api.createJobNote(selectedJob.id, noteText.trim());
      setNoteText("");
      await fetchNotes(selectedJob.id);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to add note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedJob) return;
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteJobNote(selectedJob.id, noteId);
      await fetchNotes(selectedJob.id);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete note");
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Delete this job and all its notes?")) return;
    try {
      await api.deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setAnalysis(null);
      }
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete job");
    }
  };

  const handleCoverLetter = async () => {
    if (!analysis) return;
    setGeneratingCL(true);
    try {
      const result = await api.generateCoverLetter(analysis.id);
      setAnalysis((prev: any) => (prev ? { ...prev, cover_letter: result.cover_letter } : prev));
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to generate cover letter");
    } finally {
      setGeneratingCL(false);
    }
  };

  const handleTrack = async () => {
    if (!selectedJob) return;
    setTracking(true);
    try {
      await api.createApplication(selectedJob.id, "applied");
      loadAll();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to add to tracker");
    } finally {
      setTracking(false);
    }
  };

  const scoreColor = (score: number) =>
    score >= 75
      ? "text-green-600 dark:text-green-400 bg-green-500/15"
      : score >= 50
      ? "text-yellow-600 dark:text-yellow-400 bg-yellow-500/15"
      : "text-red-600 dark:text-red-400 bg-red-500/15";

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Jobs</h1>
          <p className="text-gray-500 dark:text-[#8b8b96]">
            {filteredJobs.length} of {jobs.length} jobs
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Job
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5a5a64]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, company, location, skills, notes..."
            className={inputClass + " w-full pl-9"}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass + " cursor-pointer"}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className={inputClass + " cursor-pointer max-w-[200px]"}
        >
          <option value="">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        {(search || statusFilter || tagFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTagFilter("");
            }}
            className="text-sm text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Jobs list */}
        <div className="col-span-2 space-y-2">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className={`w-full bg-white dark:bg-[#16161f] border rounded-xl p-4 transition-colors ${
                selectedJob?.id === job.id
                  ? "border-indigo-500/50 ring-1 ring-indigo-500/20"
                  : "border-gray-200 dark:border-white/[0.08]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => handleSelectJob(job)} className="text-left flex-1">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500 dark:text-[#8b8b96]">{job.company}</p>
                    {job.location && <p className="text-xs text-gray-400 dark:text-[#5a5a64]">{job.location}</p>}
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(job)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                    STATUS_BADGE[statusMap[job.id] || "saved"] || STATUS_BADGE.saved
                  }`}
                >
                  {STATUS_OPTIONS.find((o) => o.key === (statusMap[job.id] || "saved"))?.label || "Saved"}
                </span>
                {job.extracted_skills && job.extracted_skills.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {job.extracted_skills.slice(0, 3).map((s) => (
                      <span key={s} className="text-[11px] bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {filteredJobs.length === 0 && (
            <p className="text-gray-400 dark:text-[#5a5a64] text-sm text-center py-8">
              {jobs.length === 0 ? "No jobs yet - click Add Job to create one" : "No jobs match your filters"}
            </p>
          )}
        </div>

        {/* Detail panel */}
        <div className="col-span-3">
          {analyzing && (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-8 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400 animate-spin" />
              <p className="text-gray-500 dark:text-[#8b8b96] font-medium">Analyzing match...</p>
            </div>
          )}

          {selectedJob && !analyzing && (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    {selectedJob.title} @ {selectedJob.company}
                  </h2>
                  {selectedJob.location && (
                    <p className="text-gray-500 dark:text-[#8b8b96] text-sm">{selectedJob.location}</p>
                  )}
                  {selectedJob.url && (
                    <a
                      href={selectedJob.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      View original posting
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAnalyze(selectedJob)}
                    className="text-xs text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-2 rounded-lg"
                  >
                    Analyze Job
                  </button>
                  {!statusMap[selectedJob.id] && (
                    <button
                      onClick={handleTrack}
                      disabled={tracking}
                      className="text-xs text-gray-900 dark:text-white bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] disabled:opacity-50"
                    >
                      {tracking ? "Adding..." : "Add to Tracker"}
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-[#c0c0c8] mb-2">Job Notes</p>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <textarea
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className={inputClass + " resize-none flex-1"}
                        placeholder="Add a note for this job..."
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={!noteText.trim()}
                        className="bg-indigo-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                    {notesLoading ? (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">Loading notes...</p>
                    ) : jobNotes.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">No notes yet for this job.</p>
                    ) : (
                      <div className="space-y-3 max-h-56 overflow-y-auto">
                        {jobNotes.map((note) => (
                          <div
                            key={note.id}
                            className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap">{note.note}</p>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                className="text-red-600 dark:text-red-400 text-xs hover:text-red-700 dark:hover:text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                            <p className="text-[11px] text-gray-400 dark:text-[#6b6b72] mt-2">
                              {new Date(note.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {analysis ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Analysis</h3>
                      <button
                        onClick={handleCoverLetter}
                        disabled={generatingCL}
                        className="text-xs text-white bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        {generatingCL ? "Generating..." : "Cover Letter"}
                      </button>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-4">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-green-600 dark:text-green-400">Matching Skills</p>
                          <span className={`text-2xl font-bold px-3 py-1 rounded-lg ${scoreColor(analysis.match_score)}`}>
                            {analysis.match_score}%
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {analysis.matching_skills.map((s: string) => (
                            <span key={s} className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-4">
                        <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Missing Skills</p>
                        <div className="flex flex-wrap gap-1">
                          {analysis.missing_skills.map((s: string) => (
                            <span key={s} className="text-xs bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                      {analysis.cover_letter && (
                        <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-4">
                          <p className="text-xs font-semibold text-gray-900 dark:text-white mb-2">Cover Letter</p>
                          <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap max-h-64 overflow-y-auto">
                            {analysis.cover_letter}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-6">
                    <p className="text-sm text-gray-500 dark:text-[#8b8b96]">
                      Run analysis with the button above to see job match details.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {!selectedJob && !analyzing && (
            <div className="bg-white dark:bg-[#16161f]/50 border border-dashed border-gray-200 dark:border-white/[0.1] rounded-xl p-10 text-center">
              <p className="text-gray-400 dark:text-[#5a5a64] text-sm">
                Select a job to view notes or run match analysis.
              </p>
            </div>
          )}
        </div>
      </div>

      <JobModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        job={editingJob || undefined}
        onSave={handleModalSave}
      />
    </div>
  );
}



