"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { DOMAIN_ROLE_LABELS } from "@/lib/domain";

export default function DomainAccountPage() {
  const { current } = useDomain();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setSaved(false);
    if (newPassword !== confirm) {
      setError("New password and confirmation don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/domain/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't change password.");
      return;
    }
    setSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirm("");
  }

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">Account</h1>
        <p className="text-sm text-ink-500 mt-1">Manage your sign-in details.</p>
      </div>

      {current && (
        <div className="card p-4 mb-6 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-ink-500">Name</span>
            <span className="font-medium text-ink-900">{current.name}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-500">Email</span>
            <span className="font-medium text-ink-900">{current.email}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-500">Role</span>
            <span className="font-medium text-ink-900">
              {DOMAIN_ROLE_LABELS[current.role]}
            </span>
          </div>
        </div>
      )}

      <div className="card p-4">
        <h2 className="font-heading font-semibold mb-1 flex items-center gap-2">
          <KeyRound size={16} /> Change password
        </h2>
        <p className="text-xs text-ink-500 mb-3">
          At least 10 characters, with a letter and a digit or symbol.
        </p>
        <div className="grid gap-2">
          <input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Current password"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="New password"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
          {error && <p className="text-xs text-brand-redText">{error}</p>}
          {saved && <p className="text-xs text-brand-greenText">Password updated.</p>}
          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={busy || !currentPassword || !newPassword || !confirm}
              className="btn-primary"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
