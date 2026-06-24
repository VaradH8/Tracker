"use client";

import { useEffect, useState } from "react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";

type Resource = {
  id: string;
  name: string;
  role: DomainRole;
  capacity: number;
  allocated: number;
  free: number;
  openTasks: number;
  status: "Free" | "Partial" | "Full";
};

function statusCls(s: string): string {
  if (s === "Free") return "bg-brand-greenBg text-brand-greenText";
  if (s === "Full") return "bg-brand-redBg text-brand-redText";
  return "bg-brand-yellowBg text-brand-yellowText";
}

export default function AvailabilityPage() {
  const [rows, setRows] = useState<Resource[] | null>(null);

  useEffect(() => {
    fetch("/api/domain/availability", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { resources: [] }))
      .then((b) => setRows(b.resources ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <div>
      <header className="mb-6">
        <h1 className="font-heading text-2xl font-semibold">
          Resource availability
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Who has capacity to take on work. Based on the hours of work
          currently assigned (open tasks) against each person&apos;s weekly
          capacity — logging hours doesn&apos;t change this.
        </p>
      </header>

      {rows === null ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-400 italic">
          No team members yet (actionees, SMEs, or team leads).
        </p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Person</th>
                <th className="text-left font-semibold px-4 py-2">Allocated</th>
                <th className="text-left font-semibold px-4 py-2">Free / week</th>
                <th className="text-left font-semibold px-4 py-2">Open tasks</th>
                <th className="text-left font-semibold px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-ink-900">{r.name}</div>
                    <div className="text-xs text-ink-500">
                      {DOMAIN_ROLE_LABELS[r.role]}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-ink-700">
                    {r.allocated}h / {r.capacity}h
                  </td>
                  <td className="px-4 py-2 font-medium text-ink-900">
                    {r.free}h
                  </td>
                  <td className="px-4 py-2 text-ink-700">{r.openTasks}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-pill text-xs font-medium ${statusCls(r.status)}`}
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}