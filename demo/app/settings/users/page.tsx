"use client";

import { useState } from "react";
import { Plus, Search, Upload, Mail, KeyRound, UserX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { RESOURCES, ROLE_LABELS_BY_PRIMARY } from "./labels";

export default function SettingsUsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | "Active" | "Deactivated">(
    "All",
  );

  const visible = RESOURCES.filter((u) =>
    filter === "All" ? true : u.status === filter,
  );

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ink-500 mt-1">
            Manage users, audit log, imports
          </p>
        </header>

        <SettingsTabs />

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-ink-500">
            {RESOURCES.filter((u) => u.status === "Active").length} active ·{" "}
            {RESOURCES.filter((u) => u.status === "Deactivated").length}{" "}
            deactivated
          </p>
          <div className="flex items-center gap-2">
            <button className="btn-ghost border border-ink-200">
              <Upload size={16} className="mr-1.5" /> Bulk Assign (CSV)
            </button>
            <button onClick={() => setInviteOpen(true)} className="btn-primary">
              <Plus size={16} className="mr-1.5" /> Invite User
            </button>
          </div>
        </div>

        <div className="card p-3 mb-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              placeholder="Search by name or email…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {(["All", "Active", "Deactivated"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={
                filter === f
                  ? "pill-blue cursor-pointer"
                  : "pill-grey cursor-pointer hover:bg-ink-200"
              }
            >
              {f}
            </button>
          ))}
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                <th className="py-3 px-5">Name</th>
                <th className="py-3 px-3">Email</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Designation</th>
                <th className="py-3 px-3">Last Login</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                >
                  <td className="py-3 px-5">
                    <div className="font-medium text-ink-900">{u.name}</div>
                    {u.isAdmin && (
                      <span className="pill-red text-[10px] py-0 mt-0.5">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-ink-700">{u.email}</td>
                  <td className="py-3 px-3">
                    <span className="pill-blue text-[11px]">
                      {ROLE_LABELS_BY_PRIMARY[u.primaryRole]}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-ink-700">{u.designation}</td>
                  <td className="py-3 px-3 text-ink-500">{u.lastLogin}</td>
                  <td className="py-3 px-3">
                    <span
                      className={
                        u.status === "Active" ? "pill-green" : "pill-grey"
                      }
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        title="Reset password link"
                        className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                      >
                        <KeyRound size={14} />
                      </button>
                      <button
                        title={
                          u.status === "Active" ? "Deactivate" : "Reactivate"
                        }
                        className="p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
                      >
                        <UserX size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </AppShell>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail size={18} className="text-brand-blue" />
          <h2 className="font-heading text-lg font-semibold">Invite User</h2>
        </div>
        <p className="text-sm text-ink-500 mb-5">
          They'll receive a magic link valid for 24 hours.
        </p>

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Email
        </label>
        <input
          type="email"
          defaultValue="newhire@example.com"
          className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Display name
        </label>
        <input
          type="text"
          placeholder="New Hire"
          className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Role
        </label>
        <select
          defaultValue="Developer"
          className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
        >
          <option value="Admin">Admin</option>
          <option value="Coordinator">Co-ordinator</option>
          <option value="BusinessDeveloper">Business Developer</option>
          <option value="Developer">Developer</option>
        </select>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={onClose} className="btn-primary">
            Send invite
          </button>
        </div>
      </div>
    </div>
  );
}
