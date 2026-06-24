"use client";

import { useEffect, useRef, useState } from "react";
import { Mail, Database, CalendarDays, Plane, Download, Upload, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { useToast } from "@/components/Toast";
import { useRole } from "@/lib/role";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Settings = {
  smtpFrom: string;
  workingHoursPerDay: number;
  workingDays: string[];
  leaveTypes: string[];
  annualLeaveQuota: number;
};

export default function SettingsGeneralPage() {
  const [role] = useRole();
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setS(b.settings))
      .catch(() => null);
  }, []);

  if (role !== "Admin") {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="card p-8 text-center">
            <h1 className="font-heading text-xl font-semibold mb-2">Admins only</h1>
            <p className="text-sm text-ink-500">
              Org settings are restricted to admins.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSaving(false);
    if (res.ok) {
      setS((await res.json()).settings);
      toast.show("Settings saved.");
    } else {
      toast.show("Couldn't save settings.", "error");
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ink-500 mt-1">
            Org-wide configuration · Admin only
          </p>
        </header>

        <SettingsTabs />

        {!s ? (
          <p className="text-sm text-ink-500">Loading…</p>
        ) : (
          <div className="space-y-6">
            {/* Email */}
            <section className="card p-6">
              <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2">
                <Mail size={18} className="text-brand-blue" /> Email
              </h2>
              <p className="text-xs text-ink-500 mb-4">
                Host, port and credentials come from the server&apos;s SMTP_*
                env vars. The From address is set here and used on every
                outbound email.
              </p>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                From address
              </label>
              <input
                value={s.smtpFrom}
                onChange={(e) => setS({ ...s, smtpFrom: e.target.value })}
                placeholder="tracker@inventivebizsol.com"
                className="w-full sm:w-96 px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
            </section>

            {/* Working schedule */}
            <section className="card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
                <CalendarDays size={18} className="text-brand-blue" /> Working
                schedule
              </h2>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-medium text-ink-700 mb-1.5">
                    Working hours per day
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={s.workingHoursPerDay}
                    onChange={(e) =>
                      setS({ ...s, workingHoursPerDay: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
                  />
                </div>
              </div>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Working days
              </label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const on = s.workingDays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setS({
                          ...s,
                          workingDays: on
                            ? s.workingDays.filter((x) => x !== d)
                            : [...s.workingDays, d],
                        })
                      }
                      className={`px-3 py-1.5 rounded text-sm font-medium ${
                        on
                          ? "bg-brand-blue text-white"
                          : "bg-white border border-ink-200 text-ink-700 hover:bg-ink-100"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Leave */}
            <section className="card p-6">
              <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
                <Plane size={18} className="text-brand-blue" /> Leave
              </h2>
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Annual leave quota (days/year)
              </label>
              <input
                type="number"
                min="0"
                value={s.annualLeaveQuota}
                onChange={(e) =>
                  setS({ ...s, annualLeaveQuota: Number(e.target.value) })
                }
                className="w-40 px-3 py-2 mb-4 rounded border border-ink-200 text-sm"
              />
              <label className="block text-xs font-medium text-ink-700 mb-1.5">
                Leave types
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {s.leaveTypes.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-pill bg-brand-blueBg text-brand-blue text-xs font-medium"
                  >
                    {t}
                    <button
                      onClick={() =>
                        setS({
                          ...s,
                          leaveTypes: s.leaveTypes.filter((x) => x !== t),
                        })
                      }
                      className="p-0.5 rounded hover:bg-brand-blue/20"
                      aria-label={`Remove ${t}`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newType.trim()) {
                      if (!s.leaveTypes.includes(newType.trim())) {
                        setS({ ...s, leaveTypes: [...s.leaveTypes, newType.trim()] });
                      }
                      setNewType("");
                    }
                  }}
                  placeholder="Add a leave type…"
                  className="px-3 py-2 rounded border border-ink-200 text-sm"
                />
                <button
                  onClick={() => {
                    if (newType.trim() && !s.leaveTypes.includes(newType.trim())) {
                      setS({ ...s, leaveTypes: [...s.leaveTypes, newType.trim()] });
                      setNewType("");
                    }
                  }}
                  className="btn-ghost border border-ink-200"
                >
                  Add
                </button>
              </div>
            </section>

            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>

            <BackupSection />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function BackupSection() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportBackup() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/backup", { cache: "no-store" });
      if (!res.ok) {
        toast.show("Couldn't generate backup.", "error");
        return;
      }
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tracker-backup-${json.exportedAt?.slice(0, 10) ?? "export"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.show("Backup downloaded.");
    } finally {
      setBusy(false);
    }
  }

  async function importBackup(file: File) {
    setBusy(true);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(body.error ?? "Import failed.", "error");
        return;
      }
      const total = Object.values(body.restored ?? {}).reduce(
        (a: number, b) => a + (b as number),
        0,
      );
      toast.show(`Restored ${total} rows.`);
    } catch {
      toast.show("That file isn't a valid backup.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-6">
      <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2">
        <Database size={18} className="text-brand-blue" /> Backup
      </h2>
      <p className="text-xs text-ink-500 mb-4">
        Download a full JSON snapshot of every record to keep off this server.
        Import restores it into the database (tops up missing rows — run it on
        a fresh deploy to recover).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportBackup}
          disabled={busy}
          className="btn-primary disabled:opacity-50"
        >
          <Download size={16} className="mr-1.5" /> Download backup (JSON)
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="btn-ghost border border-ink-200"
        >
          <Upload size={16} className="mr-1.5" /> Import backup
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBackup(f);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>
    </section>
  );
}