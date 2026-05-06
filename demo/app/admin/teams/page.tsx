"use client";

import { Plus, Archive, Search } from "lucide-react";
import { TopNav } from "@/components/TopNav";
import { TEAM_SUMMARIES } from "@/lib/mock";

export default function AdminTeamsPage() {
  return (
    <>
      <TopNav />
      <main className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-2xl font-semibold">Teams</h1>
            <p className="text-sm text-ink-500 mt-1">
              {TEAM_SUMMARIES.length} teams · all active
            </p>
          </div>
          <button className="btn-primary">
            <Plus size={16} className="mr-1.5" /> New Team
          </button>
        </div>

        <div className="card p-3 mb-6 flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              placeholder="Search teams…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <span className="pill-blue cursor-pointer">Active</span>
          <span className="pill-grey cursor-pointer hover:bg-ink-200">
            Archived
          </span>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                <th className="py-3 px-5">Team</th>
                <th className="py-3 px-3">Manager(s)</th>
                <th className="py-3 px-3 text-right">Members</th>
                <th className="py-3 px-3 text-right">Projects</th>
                <th className="py-3 px-3 text-right">Active Tasks</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {TEAM_SUMMARIES.map((t) => (
                <tr
                  key={t.name}
                  className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                >
                  <td className="py-3 px-5">
                    <a
                      href="/team-board"
                      className="font-medium text-ink-900 hover:text-brand-blue"
                    >
                      {t.name}
                    </a>
                  </td>
                  <td className="py-3 px-3 text-ink-700">{t.manager}</td>
                  <td className="py-3 px-3 text-right font-heading font-medium">
                    {t.members}
                  </td>
                  <td className="py-3 px-3 text-right font-heading font-medium">
                    {t.projects}
                  </td>
                  <td className="py-3 px-3 text-right font-heading font-medium">
                    {t.active}
                  </td>
                  <td className="py-3 px-3">
                    <span className="pill-green">{t.status}</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      className="text-ink-400 hover:text-brand-redText p-1.5 rounded hover:bg-brand-redBg"
                      title="Archive"
                    >
                      <Archive size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
