"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { PageLoading, PageShell } from "@/components/PageShell";
import { NoteCard } from "@/components/NoteCard";
import {
  Contact as ContactIcon,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Mail,
  Phone,
  Building2,
  Briefcase,
  StickyNote,
  Send,
  Users,
  Tag,
  Link2,
  ExternalLink,
} from "lucide-react";

interface ContactRecord {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  note_count?: number;
  companies: { id: string; name: string }[];
  jobs: { id: string; name: string }[];
  contacts: { id: string; name: string; email?: string | null }[];
}

interface ContactNoteTag {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_name?: string | null;
}

interface ContactNote {
  id: string;
  contact_id: string;
  note: string;
  created_at?: string;
  tags: ContactNoteTag[];
}

interface Relationships {
  companies: { id: string; name: string }[];
  jobs: { id: string; name: string; company?: string }[];
  contacts: { id: string; name: string; email?: string | null }[];
}

type Tab = "notes" | "relationships";
type EntityType = "company" | "job" | "contact";

const emptyForm = { name: "", email: "", phone: "" };

function ContactsContent() {
  const searchParams = useSearchParams();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string; company: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ContactRecord | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("notes");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [pendingTags, setPendingTags] = useState<{ entity_type: EntityType; entity_id: string }[]>([]);
  const [tagType, setTagType] = useState<EntityType>("company");
  const [tagEntityId, setTagEntityId] = useState("");
  const [editingNote, setEditingNote] = useState<ContactNote | null>(null);
  const [editNoteText, setEditNoteText] = useState("");
  const [editNoteTags, setEditNoteTags] = useState<{ entity_type: EntityType; entity_id: string }[]>([]);
  const [editTagType, setEditTagType] = useState<EntityType>("company");
  const [editTagEntityId, setEditTagEntityId] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteModal, setNoteModal] = useState<{ title: string; text: string } | null>(null);

  const [relationships, setRelationships] = useState<Relationships>({ companies: [], jobs: [], contacts: [] });
  const [relType, setRelType] = useState<EntityType>("company");
  const [relEntityId, setRelEntityId] = useState("");
  const [relBusy, setRelBusy] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api
      .listContacts()
      .then(setContacts)
      .catch(() => setError("Could not load contacts"))
      .finally(() => setLoading(false));
    api.listCompanies().then(setCompanies).catch(console.error);
    api.listJobs().then((j) => setJobs(j || [])).catch(console.error);
  };

  const loadNotes = (contactId: string) => {
    api.listContactNotes(contactId).then((data) => setNotes(data || [])).catch(console.error);
  };

  const loadRelationships = (contactId: string) => {
    api.getContactRelationships(contactId).then(setRelationships).catch(console.error);
  };

  useEffect(() => {
    load();
  }, []);

  // Deep-link: focus a contact from ?contact_id=
  useEffect(() => {
    const contactId = searchParams.get("contact_id");
    if (!contactId || contacts.length === 0) return;
    const target = contacts.find((c) => c.id === contactId);
    if (target) setSelected(target);
  }, [searchParams, contacts]);

  useEffect(() => {
    if (selected) {
      loadNotes(selected.id);
      loadRelationships(selected.id);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    const fresh = contacts.find((c) => c.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [contacts, selected]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }, [contacts, search]);

  const allRelationships = useMemo(() => {
    const items: { type: EntityType; id: string; name: string; sub?: string }[] = [];
    relationships.companies.forEach((c) => items.push({ type: "company", id: c.id, name: c.name }));
    relationships.jobs.forEach((j) => items.push({ type: "job", id: j.id, name: j.name, sub: j.company }));
    relationships.contacts.forEach((c) => items.push({ type: "contact", id: c.id, name: c.name, sub: c.email || undefined }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return items;
  }, [relationships]);

  const entityName = (type: EntityType, id: string) => {
    if (type === "company") return companies.find((c) => c.id === id)?.name || id;
    if (type === "job") {
      const j = jobs.find((x) => x.id === id);
      return j ? j.title : id;
    }
    return contacts.find((c) => c.id === id)?.name || id;
  };

  const availableRelOptions = useMemo(() => {
    if (relType === "company") return companies;
    if (relType === "job") return jobs.map((j) => ({ id: j.id, name: `${j.title} — ${j.company}` }));
    return contacts.filter((c) => c.id !== selected?.id).map((c) => ({ id: c.id, name: c.name }));
  }, [relType, companies, jobs, contacts, selected]);

  const availableTagOptions = useMemo(() => {
    if (tagType === "company") return companies;
    if (tagType === "job") return jobs.map((j) => ({ id: j.id, name: `${j.title} — ${j.company}` }));
    return contacts.filter((c) => c.id !== selected?.id).map((c) => ({ id: c.id, name: c.name }));
  }, [tagType, companies, jobs, contacts, selected]);

  const availableEditTagOptions = useMemo(() => {
    if (editTagType === "company") return companies;
    if (editTagType === "job") return jobs.map((j) => ({ id: j.id, name: `${j.title} — ${j.company}` }));
    return contacts.filter((c) => c.id !== selected?.id).map((c) => ({ id: c.id, name: c.name }));
  }, [editTagType, companies, jobs, contacts, selected]);

  const handleAdd = async () => {
    if (!addForm.name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await api.createContact({
        name: addForm.name.trim(),
        email: addForm.email.trim() || undefined,
        phone: addForm.phone.trim() || undefined,
      });
      setMessage(`Contact "${created.name}" added.`);
      setShowAdd(false);
      setAddForm({ ...emptyForm });
      load();
      setSelected(created);
      setActiveTab("notes");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add contact");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (contact: ContactRecord) => {
    setEditing(contact);
    setEditForm({ name: contact.name, email: contact.email || "", phone: contact.phone || "" });
    setError("");
    setMessage("");
  };

  const handleSaveEdit = async () => {
    if (!editing || !editForm.name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.updateContact(editing.id, {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.trim() || null,
      });
      setMessage("Contact updated.");
      setEditing(null);
      load();
      setSelected(updated);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update contact");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (contact: ContactRecord) => {
    if (!confirm(`Delete contact "${contact.name}"?`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteContact(contact.id);
      setMessage("Contact deleted.");
      if (selected?.id === contact.id) setSelected(null);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete contact");
    } finally {
      setBusy(false);
    }
  };

  const handleAddRelationship = async () => {
    if (!selected || !relEntityId) return;
    setRelBusy(true);
    setError("");
    setMessage("");
    try {
      await api.addContactRelationship(selected.id, relType, relEntityId);
      setRelEntityId("");
      loadRelationships(selected.id);
      load();
      setMessage("Relationship added.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add relationship");
    } finally {
      setRelBusy(false);
    }
  };

  const handleRemoveRelationship = async (type: EntityType, id: string) => {
    if (!selected) return;
    setRelBusy(true);
    try {
      await api.removeContactRelationship(selected.id, type, id);
      loadRelationships(selected.id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to remove relationship");
    } finally {
      setRelBusy(false);
    }
  };

  const addPendingTag = (entityId: string) => {
    if (!entityId) return;
    if (pendingTags.some((t) => t.entity_type === tagType && t.entity_id === entityId)) return;
    setPendingTags([...pendingTags, { entity_type: tagType, entity_id: entityId }]);
    setTagEntityId("");
  };

  const addEditTag = (entityId: string) => {
    if (!entityId) return;
    if (editNoteTags.some((t) => t.entity_type === editTagType && t.entity_id === entityId)) return;
    setEditNoteTags([...editNoteTags, { entity_type: editTagType, entity_id: entityId }]);
    setEditTagEntityId("");
  };

  const handleAddNote = async () => {
    if (!selected || !noteInput.trim()) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.createContactNote(selected.id, noteInput.trim(), pendingTags.length ? pendingTags : undefined);
      setNoteInput("");
      setPendingTags([]);
      loadNotes(selected.id);
      setContacts((prev) =>
        prev.map((c) => (c.id === selected?.id ? { ...c, note_count: (c.note_count || 0) + 1 } : c))
      );
      setMessage("Note added.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to add note");
    } finally {
      setNoteBusy(false);
    }
  };

  const startEditNote = (note: ContactNote) => {
    setEditingNote(note);
    setEditNoteText(note.note);
    setEditNoteTags(note.tags.map((t) => ({ entity_type: t.entity_type as EntityType, entity_id: t.entity_id })));
    setError("");
    setMessage("");
  };

  const handleSaveNote = async () => {
    if (!selected || !editingNote || !editNoteText.trim()) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.updateContactNote(selected.id, editingNote.id, editNoteText.trim(), { tags: editNoteTags });
      setEditingNote(null);
      loadNotes(selected.id);
      setMessage("Note updated.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to update note");
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (note: ContactNote) => {
    if (!selected) return;
    if (!confirm("Delete this note?")) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteContactNote(selected.id, note.id);
      loadNotes(selected.id);
      setContacts((prev) =>
        prev.map((c) => (c.id === selected?.id ? { ...c, note_count: Math.max(0, (c.note_count || 0) - 1) } : c))
      );
      setMessage("Note deleted.");
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete note");
    } finally {
      setNoteBusy(false);
    }
  };

  const inputClass =
    "w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";
  const smallBtn =
    "inline-flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] text-gray-700 dark:text-[#c0c0c8] bg-gray-100 dark:bg-white/[0.06] hover:bg-gray-200 dark:hover:bg-white/[0.1] disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  const TagPill = ({ tag }: { tag: ContactNoteTag }) => {
    const icon =
      tag.entity_type === "company" ? <Building2 className="w-3 h-3" /> : tag.entity_type === "job" ? <Briefcase className="w-3 h-3" /> : <ContactIcon className="w-3 h-3" />;
    const href =
      tag.entity_type === "company"
        ? `/companies?company_id=${tag.entity_id}`
        : tag.entity_type === "job"
        ? `/jobs?job_id=${tag.entity_id}`
        : undefined;
    const content = (
      <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
        {icon}
        {tag.entity_name || tag.entity_id}
      </span>
    );
    if (href) {
      return (
        <Link href={href} className="hover:opacity-80">
          {content}
        </Link>
      );
    }
    if (tag.entity_type === "contact") {
      const target = contacts.find((c) => c.id === tag.entity_id);
      if (target) {
        return (
          <button onClick={() => setSelected(target)} className="hover:opacity-80">
            {content}
          </button>
        );
      }
    }
    return content;
  };

  if (loading) return <PageLoading message="Loading contacts..." />;

  return (
    <PageShell maxWidth="max-w-[1920px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Contacts</h1>
          <p className="text-gray-500 dark:text-[#8b8b96]">{contacts.length} contacts</p>
        </div>
        <button
          onClick={() => {
            setShowAdd(true);
            setError("");
          }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600 dark:text-green-400">{message}</p>}

      <div className="flex flex-col md:flex-row items-start gap-6">
        <div className="w-full md:w-[380px] md:shrink-0 space-y-2">
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-[#5a5a64]" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts..." className={inputClass + " pl-9"} />
          </div>
          {filtered.map((contact) => (
            <div
              key={contact.id}
              className={`w-full bg-white dark:bg-[#16161f] border rounded-xl p-4 transition-colors ${
                selected?.id === contact.id ? "border-indigo-500/50 ring-1 ring-indigo-500/20" : "border-gray-200 dark:border-white/[0.08]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setSelected(contact)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <ContactIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{contact.name}</p>
                    <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">{contact.email || contact.phone || "No details"}</p>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  {typeof contact.note_count === "number" && contact.note_count > 0 && (
                    <span
                      title={`${contact.note_count} ${contact.note_count === 1 ? "note" : "notes"}`}
                      className="self-start mt-0.5 shrink-0 text-[10px] leading-none px-1.5 py-1 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]"
                    >
                      {contact.note_count}
                    </span>
                  )}
                  <button
                    onClick={() => startEdit(contact)}
                    title="Edit"
                    className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(contact)}
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
              {contacts.length === 0 ? "No contacts yet - click Add Contact to create one" : "No contacts match your search"}
            </p>
          )}
        </div>

        <div className="w-full flex-1 min-w-0">
          {selected ? (
            <div className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl">
              <div className="flex items-center justify-between gap-4 p-6 pb-4 border-b border-gray-200 dark:border-white/[0.08]">
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 dark:text-white text-lg flex items-center gap-2">
                    <ContactIcon className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span className="truncate">{selected.name}</span>
                  </h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500 dark:text-[#8b8b96]">
                    {selected.email && (
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        <a href={`mailto:${selected.email}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">
                          {selected.email}
                        </a>
                      </span>
                    )}
                    {selected.phone && (
                      <span className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" />
                        <a href={`tel:${selected.phone}`} className="hover:underline">
                          {selected.phone}
                        </a>
                      </span>
                    )}
                  </div>
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
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]">{notes.length}</span>
                </button>
                <button
                  onClick={() => setActiveTab("relationships")}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    activeTab === "relationships"
                      ? "border-indigo-500 text-indigo-700 dark:text-indigo-300"
                      : "border-transparent text-gray-500 dark:text-[#8b8b96] hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Link2 className="w-4 h-4" />
                  Relationships
                  <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-white/[0.06] text-gray-500 dark:text-[#8b8b96]">{allRelationships.length}</span>
                </button>
              </div>

              <div className="p-6">
                {activeTab === "notes" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={noteInput}
                        onChange={(e) => setNoteInput(e.target.value)}
                        placeholder="Add a note or reference..."
                        className={inputClass + " resize-none"}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-gray-500 dark:text-[#8b8b96] flex items-center gap-1">
                          <Tag className="w-3 h-3" /> Tags:
                        </span>
                        <select value={tagType} onChange={(e) => { setTagType(e.target.value as EntityType); setTagEntityId(""); }} className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white outline-none">
                          <option value="company">Company</option>
                          <option value="job">Job</option>
                          <option value="contact">Contact</option>
                        </select>
                        <select value={tagEntityId} onChange={(e) => addPendingTag(e.target.value)} className="flex-1 min-w-[140px] bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white outline-none">
                          <option value="">Select...</option>
                          {availableTagOptions
                            .filter((o) => !pendingTags.some((t) => t.entity_type === tagType && t.entity_id === o.id))
                            .map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                      </div>
                      {pendingTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {pendingTags.map((t, i) => (
                            <span key={`${t.entity_type}-${t.entity_id}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                              {t.entity_type === "company" ? <Building2 className="w-3 h-3" /> : t.entity_type === "job" ? <Briefcase className="w-3 h-3" /> : <ContactIcon className="w-3 h-3" />}
                              {entityName(t.entity_type, t.entity_id)}
                              <button onClick={() => setPendingTags(pendingTags.filter((_, j) => j !== i))} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleAddNote}
                          disabled={noteBusy || !noteInput.trim()}
                          className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Add
                        </button>
                      </div>
                    </div>

                    {notes.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">No notes yet.</p>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {notes.map((note) =>
                          editingNote?.id === note.id ? (
                            <div key={note.id} className="rounded-xl border border-indigo-500/40 bg-gray-50 dark:bg-[#0d0d14] p-3 space-y-2">
                              <textarea rows={3} value={editNoteText} onChange={(e) => setEditNoteText(e.target.value)} className={inputClass + " resize-none"} />
                              <div className="flex flex-wrap items-center gap-2">
                                <select value={editTagType} onChange={(e) => { setEditTagType(e.target.value as EntityType); setEditTagEntityId(""); }} className="bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white outline-none">
                                  <option value="company">Company</option>
                                  <option value="job">Job</option>
                                  <option value="contact">Contact</option>
                                </select>
                                <select value={editTagEntityId} onChange={(e) => addEditTag(e.target.value)} className="flex-1 min-w-[140px] bg-white dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white outline-none">
                                  <option value="">Select...</option>
                                  {availableEditTagOptions
                                    .filter((o) => !editNoteTags.some((t) => t.entity_type === editTagType && t.entity_id === o.id))
                                    .map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                  ))}
                                </select>
                              </div>
                              {editNoteTags.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {editNoteTags.map((t, i) => (
                                    <span key={`${t.entity_type}-${t.entity_id}`} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                                      {t.entity_type === "company" ? <Building2 className="w-3 h-3" /> : t.entity_type === "job" ? <Briefcase className="w-3 h-3" /> : <ContactIcon className="w-3 h-3" />}
                                      {entityName(t.entity_type, t.entity_id)}
                                      <button onClick={() => setEditNoteTags(editNoteTags.filter((_, j) => j !== i))} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <button onClick={handleSaveNote} disabled={noteBusy || !editNoteText.trim()} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-50">Save</button>
                                <button onClick={() => setEditingNote(null)} className="text-xs text-gray-600 dark:text-[#8b8b96] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.05]">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <NoteCard
                              key={note.id}
                              text={note.note}
                              createdAt={note.created_at}
                              tags={note.tags}
                              renderTag={(tag) => <TagPill tag={tag} />}
                              onEdit={() => startEditNote(note)}
                              onDelete={() => handleDeleteNote(note)}
                              onMore={(t) => setNoteModal({ title: "Note", text: t })}
                            />
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={relType} onChange={(e) => { setRelType(e.target.value as EntityType); setRelEntityId(""); }} className="bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none">
                        <option value="company">Company</option>
                        <option value="job">Job</option>
                        <option value="contact">Contact</option>
                      </select>
                      <select value={relEntityId} onChange={(e) => setRelEntityId(e.target.value)} className="flex-1 min-w-[160px] bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white outline-none">
                        <option value="">Select...</option>
                        {availableRelOptions.map((o) => (
                          <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                      </select>
                      <button onClick={handleAddRelationship} disabled={relBusy || !relEntityId} className="flex items-center gap-1.5 bg-indigo-600 text-white px-3.5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>

                    {allRelationships.length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-[#5a5a64] py-6 text-center">No relationships yet. Link this contact to companies, jobs, or other contacts.</p>
                    ) : (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {allRelationships.map((item) => (
                          <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-[#0d0d14] px-3 py-2.5">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.type === "company" ? "bg-amber-500/15 text-amber-600 dark:text-amber-300" : item.type === "job" ? "bg-blue-500/15 text-blue-600 dark:text-blue-300" : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"}`}>
                                {item.type === "company" ? <Building2 className="w-3.5 h-3.5" /> : item.type === "job" ? <Briefcase className="w-3.5 h-3.5" /> : <ContactIcon className="w-3.5 h-3.5" />}
                              </div>
                              <div className="min-w-0">
                                {item.type === "job" ? (
                                  <Link href={`/jobs?job_id=${item.id}`} className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate flex items-center gap-1">
                                    {item.name} <ExternalLink className="w-3 h-3 shrink-0" />
                                  </Link>
                                ) : item.type === "company" ? (
                                  <Link href={`/companies?company_id=${item.id}`} className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate flex items-center gap-1">
                                    {item.name} <ExternalLink className="w-3 h-3 shrink-0" />
                                  </Link>
                                ) : (
                                  <button onClick={() => { const t = contacts.find((c) => c.id === item.id); if (t) setSelected(t); }} className="text-sm font-medium text-gray-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate text-left">
                                    {item.name}
                                  </button>
                                )}
                                <p className="text-xs text-gray-400 dark:text-[#5a5a64] truncate">{item.type} {item.sub ? `· ${item.sub}` : ""}</p>
                              </div>
                            </div>
                            <button onClick={() => handleRemoveRelationship(item.type, item.id)} title="Remove" className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 shrink-0">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#16161f]/50 border border-dashed border-gray-200 dark:border-white/[0.1] rounded-xl p-10 text-center">
              <Users className="w-8 h-8 mx-auto text-gray-300 dark:text-[#3a3a42] mb-2" />
              <p className="text-gray-400 dark:text-[#5a5a64] text-sm">Select a contact to view details.</p>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h3 className="font-semibold text-gray-900 dark:text-white">Add Contact</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" placeholder="Name *" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className={inputClass} />
              <input type="email" placeholder="Email" value={addForm.email} onChange={(e) => setAddForm({ ...addForm, email: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Phone" value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} className={inputClass} />
              <div className="flex gap-3 pt-2">
                <button onClick={handleAdd} disabled={busy || !addForm.name.trim()} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">Add Contact</button>
                <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-white/[0.08]">
              <h3 className="font-semibold text-gray-900 dark:text-white">Edit Contact</h3>
              <button onClick={() => setEditing(null)} className="p-1 rounded-lg text-gray-500 dark:text-[#8b8b96] hover:bg-gray-100 dark:hover:bg-white/[0.06]"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <input type="text" placeholder="Name *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className={inputClass} />
              <input type="email" placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className={inputClass} />
              <div className="flex gap-3 pt-2">
                <button onClick={handleSaveEdit} disabled={busy || !editForm.name.trim()} className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">Save</button>
                <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-[#c0c0c8] border border-gray-200 dark:border-white/[0.08] hover:bg-gray-100 dark:hover:bg-white/[0.06]">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

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

export default function ContactsPage() {
  return (
    <Suspense fallback={<PageLoading message="Loading contacts..." />}>
      <ContactsContent />
    </Suspense>
  );
}
