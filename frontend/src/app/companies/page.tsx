"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PageLoading, PageShell } from "@/components/PageShell";
import { JobModal } from "@/components/JobModal";
import { NoteCard, type NoteTag } from "@/components/NoteCard";
import { Building2, Plus, Pencil, Trash2, Search, X, Briefcase, StickyNote, Send, Contact as ContactIcon } from "lucide-react";

interface Company {
  id: string;
  name: string;
  notes?: string | null;
  job_count?: number;
  note_count?: number;
}

interface JobRow {
  id: string;
  title: string;
  company: string;
  company_id?: string | null;
  location?: string;
  url?: string;
  status?: string;
}

interface CompanyNote {
  id: string;
  company_id: string;
  note: string;
  created_at?: string;
}

type Tab = "notes" | "jobs" | "relationships";

const STATUS_LABEL: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
  not_pursued: "Not Pursued",
};

const STATUS_BADGE: Record<string, string> = {
  saved: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  applied: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  interview: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  offer: "bg-green-500/15 text-green-700 dark:text-green-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  ghosted: "bg-gray-100 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
  not_pursued: "bg-gray-200 dark:bg-white/[0.05] text-gray-600 dark:text-[#8b8b96]",
};

const emptyForm = { name: "", notes: "" };

function CompaniesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allJobs, setAllJobs] = useState<JobRow[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("notes");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<Company | null>(null);
  const [editForm, setEditForm] = useState({ name: "", notes: "" });
  const [busy, setBusy] = useState(false);

  // Notes
  const [notes, setNotes] = useState<CompanyNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [editingNote, setEditingNote] = useState<CompanyNote | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  // Contacts linked to this company
  const [companyRelationships, setCompanyRelationships] = useState<{
    contacts: { id: string; name: string; email?: string | null; phone?: string | null }[];
    jobs: { id: string; title: string; company: string }[];
    notes: { id: string; note: string; created_at?: string | null; source: string; contact_id?: string | null; contact_name?: string | null; tags?: NoteTag[] }[];
  }>({ contacts: [], jobs: [], notes: [] });
  const [contacts, setContacts] = useState<{ id: string; name: string; email?: string | null; phone?: string | null }[]>([]);
  const [relType, setRelType] = useState<"contact" | "job">("contact");
  const [relEntityId, setRelEntityId] = useState("");
  const [relBusy, setRelBusy] = useState(false);
  const [noteModal, setNoteModal] = useState<{ title: string; text: string } | null>(null);

  // Job modal
  const [jobModalOpen, setJobModalOpen] = useState(false);
  const [jobModalJob, setJobModalJob] = useState<JobRow | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .listCompanies()
      .then(setCompanies)
      .catch(() => setError("Could not load companies"))
      .finally(() => setLoading(false));
    api
      .listJobs()
      .then((jobs) => setAllJobs(jobs || []))
      .catch(console.error);
    api
      .getKanban()
      .then((board: Record<string, { job_id: string }[]>) => {
        const map: Record<string, string> = {};
        Object.entries(board).forEach(([status, cards]) =>
          cards.forEach((c) => (map[c.job_id] = status))
        );
        setStatusMap(map);
      })
      .catch(console.error);
    api
      .listContacts()
      .then(setContacts)
      .catch(console.error);
  };

  const loadNotes = (companyId: string) => {
    api
      .listCompanyNotes(companyId)
      .then((data) => setNotes(data || []))
      .catch(console.error);
    api
      .getCompanyRelationships(companyId)
      .then((data) => setCompanyRelationships(data || { contacts: [], jobs: [], notes: [] }))
      .catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  // Deep-link: focus a company from ?company_id=
  useEffect(() => {
    const companyId = searchParams.get("company_id");
    if (!companyId || companies.length === 0) return;
    const target = companies.find((c) => c.id === companyId);
    if (target) setSelected(target);
  }, [searchParams, companies]);

  // Load notes when a company is selected
  useEffect(() => {
    if (selected) loadNotes(selected.id);
  }, [selected?.id]);

  // Keep the selected company fresh after reloads/edits
  useEffect(() => {
    if (!selected) return;
    const fresh = companies.find((c) => c.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [companies, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const companyJobs = useMemo(
    () => (selected ? allJobs.filter((j) => j.company_id === selected.id) : []),
    [selected, allJobs]
  );

  const availableRelOptions = useMemo(() => {
    if (!selected) return [];
    if (relType === "contact") {
      return contacts
        .filter((c) => !companyRelationships.contacts.some((lc) => lc.id === c.id))
        .map((c) => ({ id: c.id, name: c.name }));
    }
    return allJobs
      .filter((j) => j.company_id !== selected.id)
      .map((j) => ({ id: j.id, name: `${j.title} · ${j.company}` }));
  }, [relType, selected, contacts, companyRelationships.contacts, allJobs]);

  const companyRelItems = useMemo(() => {
    const items: {
      key: string;
      type: "contact" | "job" | "note";
      href?: string;
      name: string;
      sub: string;
      status?: string;
      job_id?: string;
      note?: string;
      created_at?: string | null;
      source?: string;
      contact_id?: string | null;
      contact_name?: string | null;
      tags?: NoteTag[];
    }[] = [];
    companyRelationships.contacts.forEach((c) =>
      items.push({
        key: `contact-${c.id}`,
        type: "contact",
        href: `/contacts?contact_id=${c.id}`,
        name: c.name,
        sub: [c.email, c.phone].filter(Boolean).join(" · ") || "Contact",
        contact_id: c.id,
      })
    );
    companyRelationships.jobs.forEach((j) =>
      items.push({
        key: `job-${j.id}`,
        type: "job",
        href: `/jobs?job_id=${j.id}`,
        name: j.title,
        sub: j.company,
        status: statusMap[j.id] || "saved",
        job_id: j.id,
      })
    );
    companyRelationships.notes.forEach((n) =>
      items.push({
        key: `note-${n.source}-${n.id}`,
        type: "note",
        name: n.note.split("\n")[0].trim().slice(0, 80) || "Note",
        sub: n.source === "contact" ? `via ${n.contact_name || "contact"}` : "Company note",
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
  }, [companyRelationships, statusMap]);

  // Company CRUD
  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createCompany({
        name: addForm.name.trim(),
        notes: addForm.notes.trim() || undefined,
      });
      setMessage(`Company "${created.name}" added.`);
      setShowAdd(false);
      setAddForm({ ...emptyForm });
      load();
      setSelected(created);
      setActiveTab("notes");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add company");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (company: Company) => {
    setEditing(company);
    setEditForm({ name: company.name, notes: company.notes || "" });
    setError("");
    setMessage("");
  };

  const handleSaveEdit = async () => {
    if (!editing || !editForm.name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.updateCompany(editing.id, {
        name: editForm.name.trim(),
        notes: editForm.notes.trim() || null,
      });
      setMessage("Company updated.");
      setEditing(null);
      load();
      setSelected(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update company");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (company: Company) => {
    if (!confirm(`Delete "${company.name}"? Jobs keep their company name but lose the link.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteCompany(company.id);
      setMessage("Company deleted.");
      if (selected?.id === company.id) setSelected(null);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete company");
    } finally {
      setBusy(false);
    }
  };

  // Note CRUD
  const handleAddNote = async () => {
    if (!selected || !noteInput.trim()) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.createCompanyNote(selected.id, noteInput.trim());
      setNoteInput("");
      loadNotes(selected.id);
      setCompanies((prev) =>
        prev.map((c) => (c.id === selected?.id ? { ...c, note_count: (c.note_count || 0) + 1 } : c))
      );
      setMessage("Note added.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add note");
    } finally {
      setNoteBusy(false);
    }
  };

  const startEditNote = (note: CompanyNote) => {
    setEditingNote(note);
    setEditNoteText(note.note);
    setError("");
    setMessage("");
  };

  const handleSaveNote = async () => {
    if (!selected || !editingNote || !editNoteText.trim()) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.updateCompanyNote(selected.id, editingNote.id, editNoteText.trim());
      setEditingNote(null);
      loadNotes(selected.id);
      setMessage("Note updated.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update note");
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (note: CompanyNote) => {
    if (!selected) return;
    if (!confirm("Delete this note?")) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteCompanyNote(selected.id, note.id);
      loadNotes(selected.id);
      setCompanies((prev) =>
        prev.map((c) => (c.id === selected?.id ? { ...c, note_count: Math.max(0, (c.note_count || 0) - 1) } : c))
      );
      setMessage("Note deleted.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete note");
    } finally {
      setNoteBusy(false);
    }
  };

  const handleAddRelationship = async () => {
    if (!selected || !relEntityId) return;
    setRelBusy(true);
    setError("");
    try {
      if (relType === "contact") {
        await api.addContactRelationship(relEntityId, "company", selected.id);
      } else {
        // Job-to-company link is the job's company_id field.
        await api.updateJob(relEntityId, { company_id: selected.id });
      }
      setRelEntityId("");
      loadNotes(selected.id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add relationship");
    } finally {
      setRelBusy(false);
    }
  };

  const handleRemoveRelationship = async (type: "contact" | "job", id: string) => {
    if (!selected) return;
    if (!confirm(`Remove this ${type} from the company?`)) return;
    setRelBusy(true);
    setError("");
    try {
      if (type === "contact") {
        await api.removeContactRelationship(id, "company", selected.id);
      } else {
        await api.updateJob(id, { company_id: null });
      }
      loadNotes(selected.id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to remove relationship");
    } finally {
      setRelBusy(false);
    }
  };

  // Job CRUD from the detail panel
  const handleAddJob = () => {
    setJobModalJob(null);
    setJobModalOpen(true);
  };

  const handleEditJob = (job: JobRow) => {
    setJobModalJob({ ...job, status: statusMap[job.id] });
    setJobModalOpen(true);
  };

  const handleDeleteJob = async (job: JobRow) => {
    if (!confirm(`Delete job "${job.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteJob(job.id);
      load();
      setMessage("Job deleted.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete job");
    } finally {
      setBusy(false);
    }
  };

  const handleJobSaved = () => {
    setJobModalOpen(false);
    load();
  };

  const inputClass =
    "w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";

  const smallBtn =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-700 dark:text-[#c0c0c8] bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  if (loading) {
    return <PageLoading message="Loading companies..." />;
  }

  return (
    <PageShell maxWidth="max-w-[1920px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Companies</h1>
          <p className="text-gray-500 dark:text-[#8b8b96]">{companies.length} companies</p>
        </div>
        <button
          onClick={() => {
            setShowAdd(true);
            setError("");
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Company
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600 dark:text-green-400">{message}</p>}

      <div className="flex flex-col md:flex-row items-start gap-6">
        {/* Companies list */}
        <div className="w-full md:w-[380px] md:shrink-0 space-y-2">
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5a5a64]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies..."
              className={inputClass + " pl-9"}
            />
          </div>
          {filtered.map((company) => (
            <div
              key={company.id}
              className={`w-full bg-white dark:bg-[#16161f] border rounded-xl p-4 transition-colors ${
                selected?.id === company.id
                  ? "border-indigo-500/50 ring-1 ring-indigo-500/20"
                  : "border-gray-200 dark:border-white/[0.08]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setSelected(company)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{company.name}</p>
                    <p className="text-xs text-gray-400 dark:text-[#5a5a64]">
                      {company.job_count ?? 0} job{(company.job_count ?? 0) === 1 ? "" : "s"}
                    </p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {typeof company.note_count === "number" && company.note_count > 0 && (
                    <span
                      title={`${company.note_count} ${company.note_count === 1 ? "note" : "notes"}`}
                      className="self-start mt-0.5 shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]"
                    >
                      {company.note_count}
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(company)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(company)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-gray-400 dark:text-[#5a5a64] text-sm text-center py-8">
              {companies.length === 0 ? "No companies yet - click Add Company to create one" : "No companies match your search"}
            </p>
          )}
        </div>

        {/* Detail panel */}
        <div className="w-full flex-1 min-w-0">
          {selected ? (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl">
              {/* Panel header */}
              <div className="flex items-center justify-between gap-4 p-6 pb-4 border-b border-gray-200 dark:border-white/[0.08]">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 dark:text-white text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="truncate">{selected.name}</span>
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-[#8b8b96]">
                    {selected.job_count ?? 0} job{(selected.job_count ?? 0) === 1 ? "" : "s"} tracked
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => startEdit(selected)} className={smallBtn}>
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button onClick={() => handleDelete(selected)} className={smallBtn}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center border-b border-gray-200 dark:border-white/[0.08]">
                <button
                  onClick={() => setActiveTab("notes")}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === "notes"
                      ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "border-transparent text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <StickyNote className="w-4 h-4" />
                  Notes
                </button>
                <button
                  onClick={() => setActiveTab("jobs")}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === "jobs"
                      ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "border-transparent text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Briefcase className="w-4 h-4" />
                  Jobs
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]">
                    {companyJobs.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab("relationships")}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === "relationships"
                      ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "border-transparent text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <ContactIcon className="w-4 h-4" />
                  Relationships
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]">
                    {companyRelationships.contacts.length + companyRelationships.jobs.length + companyRelationships.notes.length}
                  </span>
                </button>
              </div>

              <div className="p-6">
                {activeTab === "notes" ? (
                  <div className="space-y-4">
                    {/* Add note */}
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add a note about this company (contacts, portal details, interview notes...)"
                        className={inputClass + " resize-none"}
                      />
                      <button
                        onClick={handleAddNote}
                        disabled={noteBusy || !noteInput.trim()}
                        title="Add note"
                        className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-end shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>

                    {/* Notes list */}
                    {notes.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">
                        No notes yet - add your first note above.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {notes.map((note) =>
                          editingNote?.id === note.id ? (
                            <div key={note.id} className="rounded-xl border border-indigo-500/40 bg-gray-50 dark:bg-[#0d0d14] p-3 space-y-2">
                              <textarea
                                rows={3}
                                value={editNoteText}
                                onChange={(e) => setEditNoteText(e.target.value)}
                                className={inputClass + " resize-none"}
                              />
                              <div className="flex gap-2">
                                <button onClick={handleSaveNote} disabled={noteBusy || !editNoteText.trim()} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
                                  {noteBusy ? "Saving..." : "Save"}
                                </button>
                                <button onClick={() => setEditingNote(null)} className="text-xs text-gray-600 dark:text-[#8b8b96] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.05]">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <NoteCard
                              key={note.id}
                              text={note.note}
                              createdAt={note.created_at}
                              onEdit={() => startEditNote(note)}
                              onDelete={() => handleDeleteNote(note)}
                              onMore={(t) => setNoteModal({ title: "Note", text: t })}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : activeTab === "relationships" ? (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={relType}
                        onChange={(e) => { setRelType(e.target.value as "contact" | "job"); setRelEntityId(""); }}
                        className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none"
                      >
                        <option value="contact">Contact</option>
                        <option value="job">Job</option>
                      </select>
                      <select
                        value={relEntityId}
                        onChange={(e) => setRelEntityId(e.target.value)}
                        className="flex-1 min-w-[180px] bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none"
                      >
                        <option value="">Select {relType}...</option>
                        {availableRelOptions.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
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
                    {availableRelOptions.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-[#5a5a64]">
                        {relType === "contact"
                          ? "No more contacts to link."
                          : "No jobs to link to this company."}
                      </p>
                    )}

                    <div className="space-y-2 max-h-[380px] overflow-y-auto">
                      {companyRelItems.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">
                          No relationships yet. Link a contact or job above, or add notes.
                        </p>
                      ) : (
                        companyRelItems.map((item) => {
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
                                    <span className="text-[11px] text-gray-400 dark:text-[#5a5a64]">Company note</span>
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
                                    item.type === "contact"
                                      ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                                      : "bg-blue-500/15 text-blue-600 dark:text-blue-300"
                                  }`}
                                >
                                  {item.type === "contact" ? <ContactIcon className="w-3.5 h-3.5" /> : <Briefcase className="w-3.5 h-3.5" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
                                  <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">{item.sub}</p>
                                </div>
                              </Link>
                              {item.type === "job" && item.status && (
                                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[item.status] || STATUS_BADGE.saved}`}>
                                  {STATUS_LABEL[item.status] || "Saved"}
                                </span>
                              )}
                              {(item.type === "contact" ? item.contact_id : item.job_id) && (
                                <button
                                  onClick={() => handleRemoveRelationship(item.type as "contact" | "job", (item.type === "contact" ? item.contact_id : item.job_id)!)}
                                  title="Remove"
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
                ) : (
                  <div className="space-y-4">
                    {/* Add job */}
                    <div className="flex justify-end">
                      <button onClick={handleAddJob} className={smallBtn + " !text-indigo-700 dark:!text-indigo-300 !border-indigo-500/40 hover:!bg-indigo-500/10"}>
                        <Plus className="w-3.5 h-3.5" />
                        Add Job at {selected.name}
                      </button>
                    </div>

                    {/* Jobs list */}
                    {companyJobs.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">
                        No jobs linked to this company yet.
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {companyJobs.map((job) => {
                          const status = statusMap[job.id] || "saved";
                          return (
                            <div
                              key={job.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-2.5"
                            >
                              <Link href={`/jobs?job_id=${job.id}`} className="min-w-0 flex-1 hover:opacity-80 transition-opacity">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{job.title}</p>
                                <p className="text-xs text-gray-400 dark:text-[#5a5a64]">
                                  {job.location || "No location"}
                                  {job.url ? " \u00b7 " + job.url.replace(/^https?:\/\/(www\.)?/, "") : ""}
                                </p>
                              </Link>
                              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[status] || STATUS_BADGE.saved}`}>
                                {STATUS_LABEL[status] || "Saved"}
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => handleEditJob(job)} title="Edit job" className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeleteJob(job)} title="Delete job" className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#16161f]/50 border border-dashed border-gray-200 dark:border-white/[0.1] rounded-xl p-10 text-center">
              <Building2 className="w-8 h-8 mx-auto text-gray-300 dark:text-[#3a3a42] mb-2" />
              <p className="text-gray-400 dark:text-[#5a5a64] text-sm">
                Select a company to view its notes and jobs.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Add company modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h3 className="font-semibold text-gray-900 dark:text-white">Add Company</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" placeholder="Company name *" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className={inputClass} />
              <textarea rows={4} placeholder="Notes (contacts, portal details, interview notes...)" value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} className={inputClass + " resize-none"} />
              <div className="flex gap-3 pt-2">
                <button onClick={handleAdd} disabled={busy || !addForm.name.trim()} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {busy ? "Adding..." : "Add Company"}
                </button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit company modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h3 className="font-semibold text-gray-900 dark:text-white">Edit Company</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" placeholder="Company name *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
              <textarea rows={5} placeholder="Notes (contacts, portal details, interview notes...)" value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className={inputClass + " resize-none"} />
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveEdit} disabled={busy || !editForm.name.trim()} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  {busy ? "Saving..." : "Save"}
                </button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06] transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job modal (add/edit) */}
      <JobModal
        isOpen={jobModalOpen}
        onClose={() => setJobModalOpen(false)}
        job={jobModalJob ?? undefined}
        onSave={handleJobSaved}
        initialCompany={selected?.name}
        initialStatus={jobModalJob?.status}
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
              <p className="text-sm text-gray-700 dark:text-[#c0c0c8] whitespace-pre-wrap">{noteModal.text}</p>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default function CompaniesPage() {
  return (
    <Suspense fallback={<p className="p-8 text-gray-500 dark:text-[#8b8b96]">Loading companies…</p>}>
      <CompaniesContent />
    </Suspense>
  );
}
