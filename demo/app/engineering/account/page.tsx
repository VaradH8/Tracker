"use client";

import { useEffect, useState } from "react";
import { KeyRound, UserCog } from "lucide-react";
import { useDomain } from "@/lib/domain-store";
import { DOMAIN_ROLE_LABELS, SUPERVISOR_ROLES } from "@/lib/domain";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { inputClass } from "@/lib/domain-ui";

export default function DomainAccountPage() {
  const { current } = useDomain();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * Editing your own name and email is a supervisor's privilege — see
   * PATCH /api/domain/me for why. Everyone keeps their own password.
   */
  const canEditDetails = current ? SUPERVISOR_ROLES.includes(current.role) : false;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailSaved, setDetailSaved] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);

  // Seed the fields once the signed-in user has hydrated.
  useEffect(() => {
    if (!current) return;
    setName(current.name);
    setEmail(current.email);
  }, [current]);

  async function saveDetails() {
    setDetailError(null);
    setDetailSaved(false);
    setDetailBusy(true);
    const res = await fetch("/api/domain/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email }),
    });
    setDetailBusy(false);
    if (!res.ok) {
      setDetailError(
        (await res.json().catch(() => ({}))).error ?? "Couldn't save that.",
      );
      return;
    }
    setDetailSaved(true);
    // The name in the nav comes from the session store, so re-read it
    // rather than leaving the old one on screen until the next reload.
    window.location.reload();
  }

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
    <DomainPage width="narrow">
      <PageHeader title="Account" description="Manage your sign-in details." />

      {current && (
        <div className="card p-4 mb-6">
          <h2 className="font-heading font-semibold mb-1 flex items-center gap-2">
            <UserCog size={16} /> Your details
          </h2>
          {canEditDetails ? (
            <>
              <p className="text-xs text-ink-500 mb-3">
                Your name is how you appear on every picker, approval and
                delivery record.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-xs">
                  <span className="block text-ink-700 font-medium mb-1">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass("md", "w-full")}
                  />
                </label>
                <label className="text-xs">
                  <span className="block text-ink-700 font-medium mb-1">
                    Sign-in email
                  </span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass("md", "w-full")}
                  />
                </label>
              </div>
              {detailError && (
                <p className="text-xs text-brand-redText mt-2">{detailError}</p>
              )}
              {detailSaved && (
                <p className="text-xs text-brand-greenText mt-2">Details updated.</p>
              )}
              <div className="flex justify-end mt-3">
                <button
                  onClick={saveDetails}
                  disabled={
                    detailBusy ||
                    !name.trim() ||
                    !email.trim() ||
                    (name === current.name && email === current.email)
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {detailBusy ? "Saving…" : "Save details"}
                </button>
              </div>
            </>
          ) : (
            /* SMEs and Actionees read their details but don't edit them —
               a supervisor changes those, so the record everyone else
               works from stays stable. */
            <div className="text-sm mt-2">
              <div className="flex justify-between py-1">
                <span className="text-ink-500">Name</span>
                <span className="font-medium text-ink-900">{current.name}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-ink-500">Email</span>
                <span className="font-medium text-ink-900">{current.email}</span>
              </div>
              <p className="text-xs text-ink-400 mt-2">
                Ask an Admin, Lead or Team Lead to change your name or email.
                You can change your own password below.
              </p>
            </div>
          )}
          <div className="flex justify-between py-1 text-sm border-t border-ink-100 mt-3 pt-3">
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
    </DomainPage>
  );
}
