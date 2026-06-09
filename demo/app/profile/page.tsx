"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { useAccounts } from "@/lib/account-store";
import { ROLE_LABELS, type Role } from "@/lib/role";

const NOTIF_PREFS: Record<Role, string[]> = {
  Admin: [
    "Backup status changes",
    "User invites accepted",
    "Project health switches to At risk",
    "Weekly org summary",
  ],
  Coordinator: [
    "Tasks assigned to me",
    "Status changes on tasks I own",
    "Tasks marked Blocked by my team",
    "@mentions in remarks",
    "Daily 9 AM overdue digest",
    "Weekly Monday team summary",
  ],
  BusinessDeveloper: [
    "New project intake requests",
    "Project status changes I follow",
    "Client-facing comms scheduled",
    "@mentions in remarks",
  ],
  Developer: [
    "Tasks assigned to me",
    "Co-ordinator edits to my tasks",
    "@mentions in remarks",
    "Daily 9 AM overdue digest",
    "Tasks I'm on marked Important",
  ],
};

export default function ProfilePage() {
  const { current, updateAccount, changePassword } = useAccounts();
  const toast = useToast();
  const [editName, setEditName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  if (!current) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <p className="text-sm text-ink-500">Loading…</p>
        </div>
      </AppShell>
    );
  }

  const prefs = NOTIF_PREFS[current.role];

  function saveName() {
    const name = editName.trim();
    if (!name || !current || name === current.name) {
      setEditingName(false);
      return;
    }
    updateAccount(current.id, { name });
    toast.show("Display name updated.");
    setEditingName(false);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    if (nextPw !== confirmPw) {
      setPwError("New passwords don't match.");
      return;
    }
    const result = await changePassword(currentPw, nextPw);
    if (!result.ok) {
      setPwError(result.error ?? "Couldn't change password.");
      return;
    }
    toast.show("Password updated.");
    setPwOpen(false);
    setCurrentPw("");
    setNextPw("");
    setConfirmPw("");
    setPwError(null);
  }

  return (
    <AppShell>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-semibold">Profile</h1>
          <p className="text-sm text-ink-500 mt-1">
            Signed in as{" "}
            <span className="font-medium">{ROLE_LABELS[current.role]}</span>
          </p>
        </header>

        <section className="card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Account</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Display name
              </label>
              {editingName ? (
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    className="flex-1 px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                  />
                  <button
                    onClick={saveName}
                    className="btn-primary text-xs px-3"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={current.name}
                    className="flex-1 px-3 py-2 rounded border border-ink-200 text-sm bg-ink-50"
                  />
                  <button
                    onClick={() => {
                      setEditName(current.name);
                      setEditingName(true);
                    }}
                    className="btn-ghost text-xs px-3 border border-ink-200"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
            <Field label="Email" value={current.email} />
          </div>
          <div className="mt-4 pt-4 border-t border-ink-100 flex gap-2 flex-wrap">
            <button
              onClick={() => setPwOpen(!pwOpen)}
              className="btn-ghost border border-ink-200"
            >
              {pwOpen ? "Cancel password change" : "Change password"}
            </button>
          </div>

          {pwOpen && (
            <form
              onSubmit={submitPassword}
              className="mt-4 pt-4 border-t border-ink-100 grid sm:grid-cols-3 gap-3"
            >
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  Current password
                </label>
                <input
                  type="password"
                  value={currentPw}
                  onChange={(e) => {
                    setCurrentPw(e.target.value);
                    setPwError(null);
                  }}
                  className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  New password
                </label>
                <input
                  type="password"
                  value={nextPw}
                  onChange={(e) => {
                    setNextPw(e.target.value);
                    setPwError(null);
                  }}
                  placeholder="at least 6 chars"
                  className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1.5">
                  Confirm new password
                </label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => {
                    setConfirmPw(e.target.value);
                    setPwError(null);
                  }}
                  className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              {pwError && (
                <p className="sm:col-span-3 text-xs text-brand-redText">
                  {pwError}
                </p>
              )}
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  disabled={!currentPw || !nextPw || !confirmPw}
                  className="btn-primary"
                >
                  Save new password
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="card p-6">
          <h2 className="font-heading text-lg font-semibold mb-1">
            Notification preferences
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            Per-category in-app and email toggles · tailored to your role.
          </p>
          <div className="space-y-2">
            {prefs.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between p-3 rounded border border-ink-200"
              >
                <span className="text-sm text-ink-900">{label}</span>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 text-ink-700">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-brand-blue"
                    />
                    In-app
                  </label>
                  <label className="flex items-center gap-1.5 text-ink-700">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-brand-blue"
                    />
                    Email
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}
      </label>
      <input
        readOnly
        value={value}
        className="w-full px-3 py-2 rounded border border-ink-200 text-sm bg-ink-50"
      />
    </div>
  );
}
