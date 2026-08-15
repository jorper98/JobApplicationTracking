"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Loader2, Plus, Trash2, Pencil, Search, X, FileText } from "lucide-react";
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

interface Resume {
  id: string;
  filename: string;
  is_active: boolean;
  version: number;
  created_at: string;
}

interface Analysis {
  id: string;
  job_id: string;
  resume_id: string;
  match_score: number | null;
  matching_skills: string[];
  missing_skills: string[];
  resume_suggestions: string[];
  cover_letter: string | null;
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

function SkillPills({ skills, tone }: { skills: string[]; tone: "green" | "red" }) {
  const list = skills || [];
  if (list.length === 0) return <span className="text-xs text-gray-400 dark:text-[#5a5a64]">—</span>;
  const shown = list.slice(0, 3);
  const extra = list.length - shown.length;
  const cls =
    tone === "green"
      ? "bg-green-500/15 text-green-700 dark:text-green-300"
      : "bg-red-500/15 text-red-700 dark:text-red-300";
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className={`text-[11px] px-2 py-0.5 rounded-full ${cls}`}>
          {s}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="text-[11px] bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-[#8b8b96] px-2 py-0.5 rounded-full"
          title={list.slice(3).join(", ")}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<"notes" | "resumes">("notes");
  const [jobNotes, setJobNotes] = useState<JobNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [analysesMap, setAnalysesMap] = useState<Record<string, Analysis>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingCLId, setGeneratingCLId] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);
  const [coverLetterResumeId, setCoverLetterResumeId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<JobNote | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

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
    api
      .listResumes()
      .then((list: Resume[]) => {
        setResumes(list);
      })
      .catch(console.error);
    if (searchParams.get("new") === "true") {
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Close the drawer on Esc
  useEffect(() => {
    if (!drawerResumeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerResumeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerResumeId]);

  // Close the cover letter modal on Esc
  useEffect(() => {
    if (!coverLetterResumeId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCoverLetterResumeId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coverLetterResumeId]);

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

  // Keep the search index in sync when notes change on the selected job
  useEffect(() => {
    if (!selectedJob) return;
    setNotesMap((prev) => ({
      ...prev,
      [selectedJob.id]: jobNotes.map((n) => n.note).join(" "),
    }));
  }, [jobNotes, selectedJob]);

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

  const handleSelectJob = async (job: Job) => {
    setSelectedJob(job);
    setJobNotes([]);
    setNotesLoading(true);
    setDrawerResumeId(null);
    setCoverLetterResumeId(null);
    try {
      const [notes, analyses] = await Promise.all([
        api.listJobNotes(job.id),
        api.getAnalysisForJob(job.id),
      ]);
      setJobNotes(notes || []);
      const map: Record<string, Analysis> = {};
      (analyses || []).forEach((a: Analysis) => {
        map[a.resume_id] = a;
      });
      setAnalysesMap(map);
      setActiveTab(Object.keys(map).length > 0 ? "resumes" : "notes");
    } catch (e) {
      console.error("Failed to load job detail", e);
    } finally {
      setNotesLoading(false);
    }
  };

  const handleAnalyze = async (resumeId: string) => {
    if (!selectedJob) return;
    setAnalyzingId(resumeId);
    try {
      const result = await api.analyzeMatch(selectedJob.id, resumeId);
      setAnalysesMap((prev) => ({ ...prev, [resumeId]: result }));
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Analysis failed - make sure you have a resume uploaded");
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleGenerateCoverLetter = async (analysisId: string, openModalAfter = false) => {
    setGeneratingCLId(analysisId);
    try {
      const result = await api.generateCoverLetter(analysisId);
      let resumeId: string | null = null;
      setAnalysesMap((prev) => {
        const next = { ...prev };
        const key = Object.keys(next).find((k) => next[k].id === analysisId);
        if (key && next[key]) {
          resumeId = next[key].resume_id;
          next[key] = { ...next[key], cover_letter: result.cover_letter };
        }
        return next;
      });
      if (openModalAfter && resumeId) setCoverLetterResumeId(resumeId);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to generate cover letter");
    } finally {
      setGeneratingCLId(null);
    }
  };

  const handleCoverLetterClick = async (analysis: Analysis) => {
    if (analysis.cover_letter) {
      setCoverLetterResumeId(analysis.resume_id);
      return;
    }
    await handleGenerateCoverLetter(analysis.id, true);
  };

  const handleAddNote = async () => {
    if (!selectedJob || !noteText.trim()) return;
    try {
      const note = await api.createJobNote(selectedJob.id, noteText.trim());
      setJobNotes((prev) => [note, ...prev]);
      setNoteText("");
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to add note");
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedJob) return;
    if (!confirm("Delete this note?")) return;
    try {
      await api.deleteJobNote(selectedJob.id, noteId);
      setJobNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete note");
    }
  };

  const handleEditNote = async () => {
    if (!selectedJob || !editingNote || !editText.trim()) return;
    setEditSaving(true);
    try {
      const updated = await api.updateJobNote(selectedJob.id, editingNote.id, editText.trim());
      setJobNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      setEditingNote(null);
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to update note");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Delete this job and all its notes?")) return;
    try {
      await api.deleteJob(jobId);
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
        setAnalysesMap({});
        setDrawerResumeId(null);
      }
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to delete job");
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

  const sortedResumes = [...resumes].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    const sa = analysesMap[a.id]?.match_score ?? -1;
    const sb = analysesMap[b.id]?.match_score ?? -1;
    if (sa !== sb) return sb - sa;
    return a.filename.localeCompare(b.filename);
  });

  const drawerResume = drawerResumeId ? resumes.find((r) => r.id === drawerResumeId) : null;
  const drawerAnalysis = drawerResumeId ? analysesMap[drawerResumeId] : null;

  const clResume = coverLetterResumeId ? resumes.find((r) => r.id === coverLetterResumeId) : null;
  const clAnalysis = coverLetterResumeId ? analysesMap[coverLetterResumeId] : null;

  const smallBtn =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-700 dark:text-[#c0c0c8] bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="p-8 max-w-[1920px]">
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

      <div className="flex items-start gap-6">
        {/* Jobs list */}
        <div className="w-[420px] shrink-0 space-y-2">
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
        <div className="flex-1 min-w-[1400px]">
          {selectedJob ? (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="min-w-0">
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
                {!statusMap[selectedJob.id] && (
                  <button
                    onClick={handleTrack}
                    disabled={tracking}
                    className="text-xs text-gray-900 dark:text-white bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.08] disabled:opacity-50 shrink-0"
                  >
                    {tracking ? "Adding..." : "Add to Tracker"}
                  </button>
                )}
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/[0.05] rounded-lg p-1 mb-4 w-fit">
                <button
                  onClick={() => setActiveTab("notes")}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "notes"
                      ? "bg-white dark:bg-[#2a2a35] text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Notes <span className="text-xs text-gray-400 dark:text-[#6b6b72]">{jobNotes.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab("resumes")}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "resumes"
                      ? "bg-white dark:bg-[#2a2a35] text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Resumes <span className="text-xs text-gray-400 dark:text-[#6b6b72]">{resumes.length}</span>
                </button>
              </div>

              {activeTab === "notes" ? (
                <div className="space-y-4">
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
                      className="bg-indigo-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 self-start"
                    >
                      Add
                    </button>
                  </div>
                  {notesLoading ? (
                    <p className="text-sm text-gray-500 dark:text-[#8b8b96]">Loading notes...</p>
                  ) : jobNotes.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-[#8b8b96]">No notes yet for this job.</p>
                  ) : (
                    <div className="space-y-3 max-h-[420px] overflow-y-auto">
                      {jobNotes.map((note) => (
                        <div
                          key={note.id}
                          className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap flex-1">
                              {note.note}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => {
                                  setEditingNote(note);
                                  setEditText(note.note);
                                }}
                                title="Edit note"
                                className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                title="Delete note"
                                className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-gray-400 dark:text-[#6b6b72] mt-2">
                            {new Date(note.created_at).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : resumes.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 dark:border-white/[0.1] bg-gray-50 dark:bg-[#0d0d14] p-10 text-center">
                  <FileText className="w-8 h-8 mx-auto text-gray-300 dark:text-[#3a3a42] mb-2" />
                  <p className="text-sm text-gray-500 dark:text-[#8b8b96]">
                    No resumes — upload one to run match analysis.
                  </p>
                  <Link
                    href="/resume"
                    className="inline-block mt-3 text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                  >
                    Upload a resume
                  </Link>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 dark:text-[#5a5a64]">
                        <th className="pb-2 pr-3 font-semibold">Resume</th>
                        <th className="pb-2 pr-3 font-semibold w-14">%</th>
                        <th className="pb-2 pr-3 font-semibold">Matching Skills</th>
                        <th className="pb-2 pr-3 font-semibold">Missing Skills</th>
                        <th className="pb-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
                      {sortedResumes.map((resume) => {
                        const analysis = analysesMap[resume.id];
                        const isAnalyzing = analyzingId === resume.id;
                        const isGeneratingCL = !!analysis && generatingCLId === analysis.id;
                        return (
                          <tr key={resume.id} className="align-top">
                            <td className="py-3 pr-3">
                              <p
                                className="text-gray-900 dark:text-white text-sm font-medium truncate max-w-[180px]"
                                title={resume.filename}
                              >
                                {resume.filename}
                              </p>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[11px] text-gray-400 dark:text-[#5a5a64]">V{resume.version}</span>
                                {resume.is_active && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                                    Active
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 pr-3">
                              {analysis && analysis.match_score != null ? (
                                <span
                                  className={`inline-block text-sm font-bold px-2 py-0.5 rounded-lg ${scoreColor(analysis.match_score)}`}
                                >
                                  {Math.round(analysis.match_score)}%
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-[#5a5a64]">—</span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <SkillPills skills={analysis?.matching_skills || []} tone="green" />
                            </td>
                            <td className="py-3 pr-3">
                              <SkillPills skills={analysis?.missing_skills || []} tone="red" />
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {analysis ? (
                                  <>
                                    <button
                                      onClick={() => handleAnalyze(resume.id)}
                                      disabled={isAnalyzing}
                                      className={smallBtn}
                                    >
                                      {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
                                      {isAnalyzing ? "Analyzing..." : "Re-analyze"}
                                    </button>
                                    <button
                                      onClick={() => handleCoverLetterClick(analysis)}
                                      disabled={isGeneratingCL}
                                      className={smallBtn}
                                    >
                                      {isGeneratingCL && <Loader2 className="w-3 h-3 animate-spin" />}
                                      {isGeneratingCL ? "Generating..." : "Cover Letter"}
                                    </button>
                                    <button onClick={() => setDrawerResumeId(resume.id)} className={smallBtn}>
                                      Details
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => handleAnalyze(resume.id)}
                                    disabled={isAnalyzing}
                                    className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                  >
                                    {isAnalyzing && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {isAnalyzing ? "Analyzing..." : "Analyze"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white dark:bg-[#16161f]/50 border border-dashed border-gray-200 dark:border-white/[0.1] rounded-xl p-10 text-center">
              <p className="text-gray-400 dark:text-[#5a5a64] text-sm">
                Select a job to view notes or run match analysis.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Note edit modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              if (!editSaving) setEditingNote(null);
            }}
          />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h3 className="font-semibold text-gray-900 dark:text-white">Edit Note</h3>
              <button
                onClick={() => {
                  if (!editSaving) setEditingNote(null);
                }}
                className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              <textarea
                rows={4}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                autoFocus
                className={inputClass + " resize-none w-full"}
                placeholder="Edit note..."
              />
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleEditNote}
                  disabled={!editText.trim() || editSaving}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={() => setEditingNote(null)}
                  disabled={editSaving}
                  className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cover letter modal */}
      {coverLetterResumeId && clResume && clAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCoverLetterResumeId(null)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white">Cover Letter</h3>
                <p className="text-xs text-gray-500 dark:text-[#8b8b96] truncate" title={clResume.filename}>
                  {clResume.filename} — {selectedJob?.title} @ {selectedJob?.company}
                </p>
              </div>
              <button
                onClick={() => setCoverLetterResumeId(null)}
                className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {clAnalysis.matching_skills && clAnalysis.matching_skills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2">Matching Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {clAnalysis.matching_skills.map((s) => (
                      <span key={s} className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {clAnalysis.missing_skills && clAnalysis.missing_skills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Missing Skills</p>
                  <div className="flex flex-wrap gap-1">
                    {clAnalysis.missing_skills.map((s) => (
                      <span key={s} className="text-xs bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap leading-relaxed">
                  {clAnalysis.cover_letter || "No cover letter yet."}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-white/[0.08] shrink-0">
              <button
                onClick={() => handleGenerateCoverLetter(clAnalysis.id)}
                disabled={generatingCLId === clAnalysis.id}
                className={smallBtn}
              >
                {generatingCLId === clAnalysis.id && <Loader2 className="w-3 h-3 animate-spin" />}
                {generatingCLId === clAnalysis.id ? "Generating..." : "Regenerate"}
              </button>
              <button
                onClick={() => setCoverLetterResumeId(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resume analysis drawer */}
      {drawerResumeId && drawerResume && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerResumeId(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-[#0b0b11] border-l border-gray-200 dark:border-white/[0.08] shadow-2xl overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-[#0b0b11] border-b border-gray-200 dark:border-white/[0.08] px-5 py-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate" title={drawerResume.filename}>
                  {drawerResume.filename}
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-gray-400 dark:text-[#5a5a64]">V{drawerResume.version}</span>
                  {drawerResume.is_active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                      Active
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDrawerResumeId(null)}
                className="p-1.5 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {drawerAnalysis ? (
                <>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-3xl font-bold px-3 py-1 rounded-lg ${
                        drawerAnalysis.match_score != null
                          ? scoreColor(drawerAnalysis.match_score)
                          : "text-gray-400 dark:text-[#5a5a64] bg-gray-100 dark:bg-white/[0.05]"
                      }`}
                    >
                      {drawerAnalysis.match_score != null ? `${Math.round(drawerAnalysis.match_score)}%` : "—"}
                    </span>
                    <button
                      onClick={() => handleAnalyze(drawerResumeId)}
                      disabled={analyzingId === drawerResumeId}
                      className={smallBtn}
                    >
                      {analyzingId === drawerResumeId && <Loader2 className="w-3 h-3 animate-spin" />}
                      {analyzingId === drawerResumeId ? "Analyzing..." : "Re-analyze"}
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-2">Matching Skills</p>
                    {drawerAnalysis.matching_skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {drawerAnalysis.matching_skills.map((s) => (
                          <span key={s} className="text-xs bg-green-500/15 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">None</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-2">Missing Skills</p>
                    {drawerAnalysis.missing_skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {drawerAnalysis.missing_skills.map((s) => (
                          <span key={s} className="text-xs bg-red-500/15 text-red-700 dark:text-red-300 px-2 py-0.5 rounded-full">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">None</p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-[#c0c0c8] mb-2">Resume Suggestions</p>
                    {drawerAnalysis.resume_suggestions.length > 0 ? (
                      <ul className="space-y-2">
                        {drawerAnalysis.resume_suggestions.map((s, i) => (
                          <li key={i} className="text-sm text-gray-700 dark:text-[#c0c0c8] flex gap-2">
                            <span className="text-indigo-500 shrink-0">{i + 1}.</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">No suggestions</p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Cover Letter</p>
                      <button
                        onClick={() => handleGenerateCoverLetter(drawerAnalysis.id)}
                        disabled={generatingCLId === drawerAnalysis.id}
                        className={smallBtn}
                      >
                        {generatingCLId === drawerAnalysis.id && <Loader2 className="w-3 h-3 animate-spin" />}
                        {generatingCLId === drawerAnalysis.id
                          ? "Generating..."
                          : drawerAnalysis.cover_letter
                          ? "Regenerate"
                          : "Generate"}
                      </button>
                    </div>
                    {drawerAnalysis.cover_letter ? (
                      <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {drawerAnalysis.cover_letter}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96]">No cover letter yet.</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-10">
                  <FileText className="w-8 h-8 mx-auto text-gray-300 dark:text-[#3a3a42] mb-2" />
                  <p className="text-sm text-gray-500 dark:text-[#8b8b96]">Not analyzed yet.</p>
                  <button
                    onClick={() => handleAnalyze(drawerResumeId)}
                    disabled={analyzingId === drawerResumeId}
                    className="mt-3 inline-flex items-center gap-1 text-xs bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                  >
                    {analyzingId === drawerResumeId && <Loader2 className="w-3 h-3 animate-spin" />}
                    {analyzingId === drawerResumeId ? "Analyzing..." : "Analyze"}
                  </button>
                </div>
              )}

              <button
                onClick={() => setDrawerResumeId(null)}
                className="w-full text-sm px-4 py-2 rounded-lg text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <JobModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        job={editingJob || undefined}
        onSave={handleModalSave}
      />
    </div>
  );
}
