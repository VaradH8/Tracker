"use client";

import { useState } from "react";
import { Plus, Calendar, Clock, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LEAVES, type LeaveEntry } from "@/lib/mock";

const TYPE_COLOR: Record<LeaveEntry["type"], string> = {
  Vacation: "bg-brand-blueBg text-brand-blue",
  Sick: "bg-brand-redBg text-brand-redText",
  WFH: "bg-brand-greenBg text-brand-greenText",
  Personal: "bg-brand-yellowBg text-brand-yellowText",
};

export default function LeavesPage() {
  const [open, setOpen] = useState(false);
  const sorted = [...LEAVES].sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = sorted.filter((l) => l.start >= "2026-05-06");
  const pending = sorted.filter((l) => !l.approved);

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Leaves</h1>
            <p className="text-sm text-ink-500 mt-1">
              Self-service · who's off, who's working from home, when
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> Request leave
          </button>
        </div>

        <section className="grid md:grid-cols-2 gap-6">
          <div className="card p-5">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-brand-blue" /> Upcoming
              <span className="text-xs text-ink-500 font-normal ml-auto">
                {upcoming.length}
              </span>
            </h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                Nothing scheduled. Everyone's at the desk.
              </p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map((l) => (
                  <LeaveRow key={l.id} l={l} />
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Clock size={18} className="text-brand-yellow" />
              Pending approval
              <span className="text-xs text-ink-500 font-normal ml-auto">
                {pending.length}
              </span>
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                All caught up. No requests waiting.
              </p>
            ) : (
              <ul className="space-y-2">
                {pending.map((l) => (
                  <LeaveRow key={l.id} l={l} showActions />
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="card p-5 mt-6">
          <h2 className="font-heading text-lg font-semibold mb-4">
            All leave entries
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                <th className="py-2 pr-4">Resource</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">From</th>
                <th className="py-2 pr-4">To</th>
                <th className="py-2 pr-4">Note</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((l) => (
                <tr key={l.id} className="border-b border-ink-100">
                  <td className="py-2.5 pr-4 text-ink-900 font-medium">
                    {l.resourceName}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium ${TYPE_COLOR[l.type]}`}
                    >
                      {l.type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-ink-700">{l.start}</td>
                  <td className="py-2.5 pr-4 text-ink-700">{l.end}</td>
                  <td className="py-2.5 pr-4 text-ink-500">
                    {l.note ?? "—"}
                  </td>
                  <td className="py-2.5 pr-4">
                    {l.approved ? (
                      <span className="pill-green">Approved</span>
                    ) : (
                      <span className="pill-yellow">Pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {open && <RequestLeaveModal onClose={() => setOpen(false)} />}
    </AppShell>
  );
}

function LeaveRow({
  l,
  showActions,
}: {
  l: LeaveEntry;
  showActions?: boolean;
}) {
  return (
    <li className="card p-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700">
        {l.resourceName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-900 font-medium truncate">
          {l.resourceName}
        </div>
        <div className="text-xs text-ink-500">
          {l.start === l.end ? l.start : `${l.start} → ${l.end}`}
          {l.note && ` · ${l.note}`}
        </div>
      </div>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium ${TYPE_COLOR[l.type]}`}
      >
        {l.type}
      </span>
      {showActions && (
        <div className="flex items-center gap-1">
          <button className="btn-ghost text-xs px-2 py-1 text-brand-greenText hover:bg-brand-greenBg">
            Approve
          </button>
        </div>
      )}
    </li>
  );
}

function RequestLeaveModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-1">
          <h2 className="font-heading text-lg font-semibold">Request leave</h2>
          <button onClick={onClose} className="p-1 -m-1 rounded hover:bg-ink-100">
            <X size={16} />
          </button>
        </div>
        <p className="text-sm text-ink-500 mb-5">
          Mark yourself off so the team can plan around it.
        </p>

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Type
        </label>
        <select
          defaultValue="Vacation"
          className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm"
        >
          <option>Vacation</option>
          <option>Sick</option>
          <option>WFH</option>
          <option>Personal</option>
        </select>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              From
            </label>
            <input
              type="date"
              defaultValue="2026-05-10"
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              To
            </label>
            <input
              type="date"
              defaultValue="2026-05-10"
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
            />
          </div>
        </div>

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Note (optional)
        </label>
        <textarea
          rows={2}
          placeholder="Anything your team should know"
          className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
        />

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={onClose} className="btn-primary">
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
