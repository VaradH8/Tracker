"use client";

import { useState } from "react";
import { Mail, Trash2, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { useNotifications } from "@/lib/notifications-store";

export default function SettingsEmailsPage() {
  const { emails, clearEmails } = useNotifications();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  const visible = emails.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      e.to.toLowerCase().includes(q) ||
      e.toEmail.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      e.body.toLowerCase().includes(q)
    );
  });

  function doClear() {
    clearEmails();
    toast.show("Email log cleared.", "info");
  }

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ink-500 mt-1">
            Org-wide configuration · Admin only
          </p>
        </header>

        <SettingsTabs />

        <div className="mb-4">
          <h2 className="font-heading text-xl font-semibold mb-1">
            Email log
          </h2>
          <p className="text-sm text-ink-500">
            Every in-app notification fires an email through the configured
            SMTP. This log captures what was sent so you can verify delivery.
          </p>
        </div>

        <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by recipient or subject…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {emails.length > 0 && (
            <button
              onClick={doClear}
              className="btn-ghost border border-ink-200 text-xs py-1"
            >
              <Trash2 size={14} className="mr-1.5" /> Clear log
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            Icon={Mail}
            title={
              emails.length === 0
                ? "No emails sent yet"
                : "No emails match"
            }
            message={
              emails.length === 0
                ? "Notifications start firing emails as soon as someone assigns a task, marks one blocked, or @-mentions a teammate."
                : "Try a different search term, or clear filters."
            }
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                  <th className="py-3 px-5 w-28">When</th>
                  <th className="py-3 px-3">To</th>
                  <th className="py-3 px-3">Subject</th>
                  <th className="py-3 px-3">Body</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50 cursor-pointer"
                  >
                    <td className="py-3 px-5 text-ink-500 font-mono text-xs align-top">
                      {e.when}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="font-medium text-ink-900">{e.to}</div>
                      <div className="text-xs text-ink-500">{e.toEmail}</div>
                    </td>
                    <td className="py-3 px-3 text-ink-900 font-medium align-top">
                      {e.subject}
                    </td>
                    <td
                      className={`py-3 px-3 text-ink-700 ${open === e.id ? "" : "max-w-[360px] truncate"}`}
                    >
                      {e.body}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
