"use client";

import { useState } from "react";
import { PageHeader, PageShell } from "@/components/PageShell";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword && newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const result = await updateProfile({
        full_name: fullName,
        email,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      if (result.requires_verification) {
        setMessage("Profile updated. Please verify your new email address before logging in again.");
      } else {
        setMessage("Profile updated");
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not update profile");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#5a5a64] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20";

  return (
    <PageShell>
      <PageHeader title="Profile" subtitle="Update your name, email address, and password" />

      <form onSubmit={handleSubmit} className="max-w-xl rounded-2xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-[#16161f] p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Name</label>
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} className={inputClass} />
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Email</label>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
          <p className="mt-1 text-xs text-gray-400 dark:text-[#6b6b72]">
            Changing your email requires your current password. If SMTP is configured, you must verify the new email before logging in again.
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Required for email or password changes"
            className={inputClass}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">New password</label>
            <input type="password" minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm text-gray-500 dark:text-[#8b8b96] mb-1">Confirm new password</label>
            <input type="password" minLength={6} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} />
          </div>
        </div>

        {message && <p className="text-sm text-green-600 dark:text-green-400">{message}</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving || !email}
          className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </PageShell>
  );
}
