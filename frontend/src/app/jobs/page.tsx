"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { type Job } from "@/lib/types";
import { Loader2, Plus, Trash2, Pencil, Search, X, FileText, Eye, Contact as ContactIcon, StickyNote, Building2, Briefcase } from "lucide-react";
import { JobModal } from "@/components/JobModal";
import { JobDescriptionModal } from "@/components/JobDescriptionModal";
import { PageShell } from "@/components/PageShell";
import { NoteCard, type NoteTag } from "@/components/NoteCard";

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
  matching_skills: string[] | null;
  missing_skills: string[] | null;
  resume_suggestions: string[] | null;
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

function normalizeAnalysis(analysis: Analysis): Analysis {
  return {
    ...analysis,
    matching_skills: analysis.matching_skills || [],
    missing_skills: analysis.missing_skills || [],
    resume_suggestions: analysis.resume_suggestions || [],
  };
}

function JobsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [notesMap, setNotesMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [pinnedJobId, setPinnedJobId] = useState<string | null>(null);
  const [descJob, setDescJob] = useState<Job | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [activeTab, setActiveTab] = useState<"notes" | "resumes" | "relationships">("notes");
  const [jobNotes, setJobNotes] = useState<JobNote[]>([]);
  const [jobRelationships, setJobRelationships] = useState<{
    company: { id: string; name: string } | null;
    contacts: { id: string; name: string; email?: string | null; phone?: string | null }[];
    related_jobs: { id: string; title: string; company: string }[];
    notes: { id: string; note: string; created_at?: string | null; source: string; contact_id?: string | null; contact_name?: string | null; tags?: NoteTag[] }[];
  }>({ company: null, contacts: [], related_jobs: [], notes: [] });
  const [contacts, setContacts] = useState<{ id: string; name: string; email?: string | null; phone?: string | null }[]>([]);
  const [relType, setRelType] = useState<"contact" | "company" | "job">("contact");
  const [relEntityId, setRelEntityId] = useState("");
  const [relBusy, setRelBusy] = useState(false);
  const [noteModal, setNoteModal] = useState<{ title: string; text: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [analysesMap, setAnalysesMap] = useState<Record<string, Analysis>>({});
  const selectedJobRequestRef = useRef<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [generatingCLId, setGeneratingCLId] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);
  const [coverLetterResumeId, setCoverLetterResumeId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<JobNote | null>(null);
  const [editText, setEditText] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editDateOriginal, setEditDateOriginal] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const detailRef = useRef<HTMLDivElement | null>(null);

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
    api
      .listCompanies()
      .then(setCompanies)
      .catch(console.error);
    api
      .listContacts()
      .then(setContacts)
      .catch(console.error);
    if (searchParams.get("new") === "true") {
      setModalOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Open a specific job when arriving via deep link (e.g. from the tracker)
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    const jobId = searchParams.get("job_id");
    if (!jobId || deepLinkedRef.current || jobs.length === 0) return;
    const job = jobs.find((j) => j.id === jobId);
    if (job) {
      deepLinkedRef.current = true;
      setPinnedJobId(jobId);
      handleSelectJob(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, searchParams]);

  // Apply a ?status= filter (e.g. from the dashboard status breakdown)
  useEffect(() => {
    const sp = searchParams.get("status");
    if (sp) setStatusFilter(sp);
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

  // When a job is selected from a long list, scroll the detail pane into view
  useEffect(() => {
    if (selectedJob) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedJob]);

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
    if (companyFilter) {
      const selected = companies.find((c) => c.id === companyFilter);
      const matchesCompany =
        job.company_id === companyFilter ||
        (!!selected && (job.company || "").toLowerCase() === selected.name.toLowerCase());
      if (!matchesCompany) return false;
    }
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

  const orderedJobs = pinnedJobId
    ? [...filteredJobs].sort((a, b) => (a.id === pinnedJobId ? -1 : b.id === pinnedJobId ? 1 : 0))
    : filteredJobs;

  const openAddModal = () => {
    setEditingJob(null);
    setModalOpen(true);
  };

  const openEditModal = (job: Job) => {
    setEditingJob(job);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    if (searchParams.get("new") === "true") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      const qs = params.toString();
      router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
    }
  };

  const handleModalSave = (savedJob: Job) => {
    if (editingJob) {
      setJobs((prev) => prev.map((j) => (j.id === savedJob.id ? savedJob : j)));
    } else {
      setJobs((prev) => [savedJob, ...prev]);
      setPinnedJobId(savedJob.id);
      handleSelectJob(savedJob);
    }
    api
      .listCompanies()
      .then(setCompanies)
      .catch(console.error);
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
    selectedJobRequestRef.current = job.id;
    setSelectedJob(job);
    setJobNotes([]);
    setNotesLoading(true);
    setDrawerResumeId(null);
    setCoverLetterResumeId(null);
    try {
      const [notes, analyses, relationships] = await Promise.all([
        api.listJobNotes(job.id),
        api.getAnalysisForJob(job.id),
        api.getJobRelationships(job.id),
      ]);
      if (selectedJobRequestRef.current !== job.id) return;
      setJobNotes(notes || []);
      setJobRelationships(relationships || { company: null, contacts: [], related_jobs: [], notes: [] });
      const map: Record<string, Analysis> = {};
      (analyses || []).forEach((a: Analysis) => {
        map[a.resume_id] = normalizeAnalysis(a);
      });
      setAnalysesMap(map);
      setActiveTab("notes");
    } catch (e) {
      if (selectedJobRequestRef.current !== job.id) return;
      console.error("Failed to load job detail", e);
    } finally {
      if (selectedJobRequestRef.current !== job.id) return;
      setNotesLoading(false);
    }
  };

  const handleAnalyze = async (resumeId: string) => {
    if (!selectedJob) return;
    setAnalyzingId(resumeId);
    try {
      const result = await api.analyzeMatch(selectedJob.id, resumeId);
      setAnalysesMap((prev) => ({ ...prev, [resumeId]: normalizeAnalysis(result) }));
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
      // Only rewrite created_at when the user actually changed the date;
      // text-only edits must keep the original timestamp.
      const dateChanged = editDate !== editDateOriginal;
      const updated = await api.updateJobNote(
        selectedJob.id,
        editingNote.id,
        editText.trim(),
        dateChanged && editDate ? new Date(editDate + "T00:00:00").toISOString() : undefined
      );
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

  const reloadJobRelationships = async () => {
    if (!selectedJob) return;
    try {
      const rels = await api.getJobRelationships(selectedJob.id);
      setJobRelationships(rels || { company: null, contacts: [], related_jobs: [], notes: [] });
    } catch (e) {
      console.error("Failed to reload job relationships", e);
    }
  };

  const handleAddRelationship = async () => {
    if (!selectedJob || !relEntityId) return;
    setRelBusy(true);
    try {
      await api.addJobRelationship(selectedJob.id, relType, relEntityId);
      setRelEntityId("");
      await reloadJobRelationships();
      loadAll();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to add relationship");
    } finally {
      setRelBusy(false);
    }
  };

  const handleRemoveRelationship = async (type: "contact" | "company" | "job", id: string) => {
    if (!selectedJob) return;
    if (!confirm(`Remove this ${type} from the job?`)) return;
    setRelBusy(true);
    try {
      await api.removeJobRelationship(selectedJob.id, type, id);
      await reloadJobRelationships();
      loadAll();
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Failed to remove relationship");
    } finally {
      setRelBusy(false);
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
  const drawerMatchingSkills = drawerAnalysis?.matching_skills || [];
  const drawerMissingSkills = drawerAnalysis?.missing_skills || [];
  const drawerResumeSuggestions = drawerAnalysis?.resume_suggestions || [];

  const clResume = coverLetterResumeId ? resumes.find((r) => r.id === coverLetterResumeId) : null;
  const clAnalysis = coverLetterResumeId ? analysesMap[coverLetterResumeId] : null;

  const jobRelItems = useMemo(() => {
    const items: {
      key: string;
      type: "company" | "contact" | "job" | "note";
      href?: string;
      name: string;
      sub: string;
      note?: string;
      created_at?: string | null;
      source?: string;
      company_id?: string | null;
      contact_id?: string | null;
      contact_name?: string | null;
      job_id?: string | null;
      tags?: NoteTag[];
    }[] = [];
    if (jobRelationships.company) {
      items.push({
        key: `company-${jobRelationships.company.id}`,
        type: "company",
        href: `/companies?company_id=${jobRelationships.company.id}`,
        name: jobRelationships.company.name,
        sub: "Company",
        company_id: jobRelationships.company.id,
      });
    }
    jobRelationships.contacts.forEach((c) =>
      items.push({
        key: `contact-${c.id}`,
        type: "contact",
        href: `/contacts?contact_id=${c.id}`,
        name: c.name,
        sub: [c.email, c.phone].filter(Boolean).join(" · ") || "Contact",
        contact_id: c.id,
      })
    );
    jobRelationships.related_jobs.forEach((j) =>
      items.push({
        key: `job-${j.id}`,
        type: "job",
        href: `/jobs?job_id=${j.id}`,
        name: j.title,
        sub: j.company,
        job_id: j.id,
      })
    );
    jobRelationships.notes.forEach((n) =>
      items.push({
        key: `note-${n.source}-${n.id}`,
        type: "note",
        name: n.note.split("\n")[0].trim().slice(0, 80) || "Note",
        sub: n.source === "contact" ? `via ${n.contact_name || "contact"}` : "Job note",
        note: n.note,
        created_at: n.created_at,
        source: n.source,
        contact_id: n.contact_id,
        contact_name: n.contact_name,
        tags: n.tags,
      })
    );
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [jobRelationships]);

  const smallBtn =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-700 dark:text-[#c0c0c8] bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  return (
    <PageShell maxWidth="max-w-[1920px]">
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
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className={inputClass + " cursor-pointer max-w-[200px]"}
        >
          <option value="">All Companies</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
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
        {(search || statusFilter || tagFilter || companyFilter) && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
              setTagFilter("");
              setCompanyFilter("");
            }}
            className="text-sm text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="flex flex-col xl:flex-row items-start gap-6">
        {/* Jobs list */}
        <div className="w-full xl:w-[420px] xl:shrink-0 space-y-2">
          {orderedJobs.map((job) => (
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
                  {typeof job.note_count === "number" && job.note_count > 0 && (
                    <span
                      title={`${job.note_count} ${job.note_count === 1 ? "note" : "notes"}`}
                      className="self-start mt-0.5 shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]"
                    >
                      {job.note_count}
                    </span>
                  )}
                  {job.description && (
                    <button
                      onClick={() => setDescJob(job)}
                      title="View job description"
                      className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  )}
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
        <div ref={detailRef} className="w-full flex-1 min-w-0 scroll-mt-28">
          {selectedJob ? (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6">
              {/* Header */}
              <div className="flex items-center justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-gray-900 dark:text-white truncate">
                      {selectedJob.title} @ {selectedJob.company}
                    </h2>
                    {selectedJob.description && (
                      <button
                        onClick={() => setDescJob(selectedJob)}
                        title="View job description"
                        className="p-1 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </div>
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
                  {selectedJob.created_at && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-xs text-gray-400 dark:text-[#5a5a64]">
                        Added: {new Date(selectedJob.created_at).toLocaleDateString()}
                      </p>
                      <button
                        onClick={() => openEditModal(selectedJob)}
                        title="Edit job (including date added)"
                        className="p-0.5 rounded text-gray-400 dark:text-[#6b6b72] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
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
                <button
                  onClick={() => setActiveTab("relationships")}
                  className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === "relationships"
                      ? "bg-white dark:bg-[#2a2a35] text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  Relationships <span className="text-xs text-gray-400 dark:text-[#6b6b72]">{jobRelationships.contacts.length + jobRelationships.related_jobs.length + (jobRelationships.company ? 1 : 0) + jobRelationships.notes.length}</span>
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
                        <NoteCard
                          key={note.id}
                          text={note.note}
                          createdAt={note.created_at}
                          onEdit={() => {
                            setEditingNote(note);
                            setEditText(note.note);
                            const d = note.created_at ? new Date(note.created_at).toLocaleDateString("en-CA") : "";
                            setEditDate(d);
                            setEditDateOriginal(d);
                          }}
                          onDelete={() => handleDeleteNote(note.id)}
                          onMore={(t) => setNoteModal({ title: "Note", text: t })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ) : activeTab === "relationships" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={relType}
                      onChange={(e) => { setRelType(e.target.value as "contact" | "company" | "job"); setRelEntityId(""); }}
                      className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none"
                    >
                      <option value="contact">Contact</option>
                      <option value="company">Company</option>
                      <option value="job">Job</option>
                    </select>
                    <select
                      value={relEntityId}
                      onChange={(e) => setRelEntityId(e.target.value)}
                      className="flex-1 min-w-[180px] bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none"
                    >
                      <option value="">Select {relType}...</option>
                      {relType === "contact" && contacts
                        .filter((c) => !jobRelationships.contacts.some((lc) => lc.id === c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                            {c.email ? ` — ${c.email}` : ""}
                          </option>
                        ))}
                      {relType === "company" && companies
                        .filter((c) => !jobRelationships.company || jobRelationships.company.id !== c.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      {relType === "job" && jobs
                        .filter((j) => j.id !== selectedJob?.id && !jobRelationships.related_jobs.some((lj) => lj.id === j.id))
                        .map((j) => (
                          <option key={j.id} value={j.id}>{j.title} · {j.company}</option>
                        ))}
                    </select>
                    <button
                      onClick={handleAddRelationship}
                      disabled={relBusy || !relEntityId}
                      className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto">
                    {jobRelItems.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-[#8b8b96] py-6 text-center">
                        No relationships yet. Link a contact, company, or job above, or add notes.
                      </p>
                    ) : (
                      jobRelItems.map((item) => {
                        if (item.type === "note") {
                          return (
                            <NoteCard
                              key={item.key}
                              text={item.note || ""}
                              createdAt={item.created_at || undefined}
                              tags={item.tags || []}
                              icon={<StickyNote className="w-4 h-4" />}
                              footerExtra={
                                item.source === "contact" ? (
                                  <span className="text-[11px] text-gray-400 dark:text-[#5a5a64]">
                                    via {item.contact_name || "contact"}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-gray-400 dark:text-[#5a5a64]">Job note</span>
                                )
                              }
                              onOpen={() =>
                                item.source === "contact" && item.contact_id
                                  ? router.push(`/contacts?contact_id=${item.contact_id}`)
                                  : setActiveTab("notes")
                              }
                              onMore={(t) => setNoteModal({ title: "Note", text: t })}
                            />
                          );
                        }
                        const removableId = item.type === "contact"
                          ? item.contact_id
                          : item.type === "company"
                          ? item.company_id
                          : item.job_id;
                        return (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-2.5"
                          >
                            <Link
                              href={item.href || "#"}
                              className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
                            >
                              <div
                                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                  item.type === "company"
                                    ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                                    : item.type === "job"
                                    ? "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                                    : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                                }`}
                              >
                                {item.type === "company" ? (
                                  <Building2 className="w-3.5 h-3.5" />
                                ) : item.type === "job" ? (
                                  <Briefcase className="w-3.5 h-3.5" />
                                ) : (
                                  <ContactIcon className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                                <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">{item.sub}</p>
                              </div>
                            </Link>
                            {removableId && (
                              <button
                                onClick={() => handleRemoveRelationship(item.type as "contact" | "company" | "job", removableId!)}
                                title="Remove from job"
                                disabled={relBusy}
                                className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 shrink-0 disabled:opacity-50 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
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
              <div className="mt-3">
                <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className={inputClass + " w-full"}
                />
              </div>
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
                    {drawerMatchingSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {drawerMatchingSkills.map((s) => (
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
                    {drawerMissingSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {drawerMissingSkills.map((s) => (
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
                    {drawerResumeSuggestions.length > 0 ? (
                      <ul className="space-y-2">
                        {drawerResumeSuggestions.map((s, i) => (
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
        onClose={closeModal}
        job={editingJob || undefined}
        onSave={handleModalSave}
        initialStatus={editingJob ? statusMap[editingJob.id] || "saved" : undefined}
      />

      <JobDescriptionModal
        open={!!descJob}
        onClose={() => setDescJob(null)}
        onEdit={() => {
          if (descJob) {
            const job = descJob;
            setDescJob(null);
            openEditModal(job);
          }
        }}
        jobId={descJob?.id}
        title={descJob?.title || ""}
        company={descJob?.company}
        description={descJob?.description}
        url={descJob?.url}
      />

      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNoteModal(null)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-[80%] max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08] shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-white">{noteModal.title}</h3>
              <button
                onClick={() => setNoteModal(null)}
                className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <p className="text-sm text-gray-800 dark:text-[#d4d4dd] whitespace-pre-wrap">{noteModal.text}</p>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="text-gray-500 dark:text-[#8b8b96]">Loading jobs…</p>
        </PageShell>
      }
    >
      <JobsContent />
    </Suspense>
  );
}
