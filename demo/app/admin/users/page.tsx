"use client";

import { useState } from "react";
import { Plus, Search, Upload, Mail, KeyRound, UserX } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { TEAMS, USERS } from "@/lib/mock";

export default function AdminUsersPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [filter, setFilter] = useState<"All" | "Active" | "Deactivated">("All");

  const visible = USERS.filter((u) =>
    filter === "All" ? true : u.status === filter,
  );

  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Users</h1>
            <p className="text-sm text-ink-500 mt-1">
              {USERS.filter((u) => u.status === "Active").length} active ·{" "}
              {USERS.filter((u) => u.status === "Deactivated").length}{" "}
              deactivated
            </p>
          </div>
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
                <th className="py-3 px-3">Roles per Team</th>
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
                      <span className="pill-yellow text-[10px] py-0 mt-0.5">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-ink-700">{u.email}</td>
                  <td className="py-3 px-3">
                    <div className="flex flex-wrap gap-1">
                      {u.rolesByTeam.length === 0 && !u.isAdmin && (
                        <span className="text-xs text-ink-400 italic">
                          no team assignments
                        </span>
                      )}
                      {u.rolesByTeam.map((r) => (
                        <span
                          key={r.team}
                          className={
                            r.role === "Manager"
                              ? "pill-blue text-[10px] py-0"
                              : "pill-grey text-[10px] py-0"
                          }
                          title={`${r.team} — ${r.role}`}
                        >
                          {r.team.split(" – ")[0].split(" ")[0]} · {r.role}
                        </span>
                      ))}
                    </div>
                  </td>
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
      </main>

      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} />}
    </>
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
          Initial team & role
        </label>
        <div className="flex gap-2 mb-6">
          <select className="flex-1 px-3 py-2 rounded border border-ink-200 text-sm">
            {TEAMS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select className="px-3 py-2 rounded border border-ink-200 text-sm">
            <option>User</option>
            <option>Manager</option>
          </select>
        </div>

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
