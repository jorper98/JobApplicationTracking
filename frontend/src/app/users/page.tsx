"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, Plus, Pencil, Trash2, Shield, User as UserIcon } from "lucide-react";

interface ManagedUser {
  id: string;
  email: string;
  full_name?: string | null;
  is_admin: boolean;
  created_at?: string | null;
}

const emptyForm = { email: "", password: "", full_name: "", is_admin: false };

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", is_admin: false, password: "" });
  const [busy, setBusy] = useState(false);

  const load = () => {
    api
      .listUsers()
      .then(setUsers)
      .catch((e: any) => {
        if (e?.response?.status === 403) {
          setError("Admin access required.");
        } else {
          setError("Could not load users.");
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.createUser(form);
      setMessage("User created.");
      setForm({ ...emptyForm });
      setShowAdd(false);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail[0]?.msg || "Invalid input" : detail || "Failed to create user.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (u: ManagedUser) => {
    setEditing(u);
    setEditForm({ full_name: u.full_name || "", is_admin: u.is_admin, password: "" });
    setError("");
    setMessage("");
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.updateUser(editing.id, {
        full_name: editForm.full_name,
        is_admin: editForm.is_admin,
        ...(editForm.password ? { password: editForm.password } : {}),
      });
      setMessage("User updated.");
      setEditing(null);
      load();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(Array.isArray(detail) ? detail[0]?.msg || "Invalid input" : detail || "Failed to update user.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (u: ManagedUser) => {
    if (!confirm(`Delete ${u.email} and ALL of their data? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteUser(u.id);
      setMessage("User deleted.");
      load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete user.");
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "w-full bg-gray-50 dark:bg-[#0d0d14] border border-gray-200 dark:border-white/[0.1] rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500";

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-gray-500 dark:text-[#8b8b96] min-h-screen">
        <Loader2 className="animate-spin w-5 h-5" />
        Loading users...
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">User Management</h1>
          <p className="text-gray-500 dark:text-[#8b8b96]">Create, edit, and remove accounts (admin only)</p>
        </div>
        <button
          onClick={() => { setShowAdd(!showAdd); setError(""); }}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p className="mb-4 text-sm text-green-600 dark:text-green-400">{message}</p>}

      {showAdd && (
        <div className="mb-6 bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">New User</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input type="email" required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
            <input type="password" required minLength={6} placeholder="Password (min 6 chars)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
            <input type="text" placeholder="Name (optional)" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className={inputClass} />
            <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96]">
              <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
              Admin
            </label>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAdd} disabled={busy || !form.email || form.password.length < 6} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {busy ? "Creating..." : "Create User"}
            </button>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 dark:text-[#8b8b96] px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-white/[0.08]">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {users.map((u) => (
          <div key={u.id} className="bg-white dark:bg-[#16161f] border border-gray-200 dark:border-white/[0.08] rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 shrink-0">
              {u.is_admin ? <Shield className="w-4 h-4" /> : <UserIcon className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-gray-900 dark:text-white text-sm font-medium truncate">
                {u.full_name || u.email}
                {u.id === currentUser?.id && <span className="text-gray-400 dark:text-[#6b6b72] font-normal"> (you)</span>}
              </p>
              <p className="text-gray-500 dark:text-[#8b8b96] text-xs truncate">{u.email}</p>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${u.is_admin ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300" : "bg-gray-100 dark:bg-white/[0.05] text-gray-500 dark:text-[#8b8b96]"}`}>
              {u.is_admin ? "Admin" : "User"}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => startEdit(u)} title="Edit" className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/[0.05] transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(u)}
                disabled={u.id === currentUser?.id}
                title={u.id === currentUser?.id ? "You cannot delete your own account" : "Delete"}
                className="p-1.5 rounded-lg text-gray-400 dark:text-[#6b6b72] hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div className="relative bg-white dark:bg-[#0b0b11] border border-gray-200 dark:border-white/[0.08] rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Edit {editing.email}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="Name" value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className={inputClass} />
              <input type="password" placeholder="New password (leave empty to keep)" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} className={inputClass} />
              <label className="flex items-center gap-2 text-sm text-gray-500 dark:text-[#8b8b96]">
                <input type="checkbox" checked={editForm.is_admin} onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.checked })} className="w-4 h-4 accent-indigo-600" />
                Admin
              </label>
            </div>
            <div className="flex gap-3 mt-5 justify-end">
              <button onClick={() => setEditing(null)} className="text-gray-500 dark:text-[#8b8b96] px-4 py-2 rounded-lg text-sm border border-gray-200 dark:border-white/[0.08]">
                Cancel
              </button>
              <button onClick={handleSaveEdit} disabled={busy} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-500 disabled:opacity-50">
                {busy ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


