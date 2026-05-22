"use client";

import { useState } from "react";
import { Plus, Calendar, Clock, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { LEAVES, RESOURCES, type LeaveEntry } from "@/lib/mock";
import { useRole, ROLE_LABELS } from "@/lib/role";
import { meName } from "@/lib/access";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";

const TYPE_COLOR: Record<LeaveEntry["type"], string> = {
  Vacation: "bg-brand-blueBg text-brand-blue",
  Sick: "bg-brand-redBg text-brand-redText",
  WFH: "bg-brand-greenBg text-brand-greenText",
  Personal: "bg-brand-yellowBg text-brand-yellowText",
};

export default function LeavesPage() {
  const [role] = useRole();
  const [open, setOpen] = useState(false);
  const fullVisibility = role === "Admin" || role === "Coordinator";
  const me = meName(role);

  const myFirstName = me;
  const myFullName = RESOURCES.find((r) => r.name.startsWith(me))?.name ?? "";
  const sorted = [...LEAVES].sort((a, b) => a.start.localeCompare(b.start));

  if (fullVisibility) {
    return <FullLeavesView sorted={sorted} open={open} setOpen={setOpen} />;
  }

  const myLeaves = sorted.filter((l) => l.resourceName === myFullName);
  const teamOff = sorted
    .filter((l) => l.resourceName !== myFullName && l.start >= "2026-05-06")
    .map((l) => ({
      name: l.resourceName,
      start: l.start,
      end: l.end,
    }));

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Leaves</h1>
            <p className="text-sm text-ink-500 mt-1">
              Your leaves · team availability ·{" "}
              <span className="font-medium">{ROLE_LABELS[role]}</span>
            </p>
          </div>
          <button onClick={() => setOpen(true)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> Request leave
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card p-5">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Calendar size={18} className="text-brand-blue" /> My leaves
              <span className="text-xs text-ink-500 font-normal ml-auto">
                {myLeaves.length}
              </span>
            </h2>
            {myLeaves.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                You have no leaves on the calendar. Use "Request leave" above.
              </p>
            ) : (
              <ul className="space-y-2">
                {myLeaves.map((l) => (
                  <LeaveRow key={l.id} l={l} hideName />
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-heading text-lg font-semibold mb-1 flex items-center gap-2">
              <Calendar size={18} className="text-brand-blue" /> Team
              availability
            </h2>
            <p className="text-xs text-ink-500 mb-4 flex items-center gap-1.5">
              <Lock size={11} /> Names & dates only · reasons private
            </p>
            {teamOff.length === 0 ? (
              <p className="text-sm text-ink-500 italic">
                Everyone's at the desk this period.
              </p>
            ) : (
              <ul className="space-y-2">
                {teamOff.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 p-3 rounded border border-ink-200 text-sm"
                  >
                    <div className="w-7 h-7 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700">
                      {t.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-ink-900 font-medium truncate">
                        {t.name}
                      </div>
                      <div className="text-xs text-ink-500">
                        {t.start === t.end ? t.start : `${t.start} → ${t.end}`}
                      </div>
                    </div>
                    <span className="pill-grey text-[10px] py-0">Out</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {open && (
        <RequestLeaveModal
          onClose={() => setOpen(false)}
          requesterFirstName={myFirstName}
        />
      )}
    </AppShell>
  );
}

function FullLeavesView({
  sorted,
  open,
  setOpen,
}: {
  sorted: LeaveEntry[];
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
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
                  <td className="py-2.5 pr-4 text-ink-500">{l.note ?? "—"}</td>
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
  hideName,
}: {
  l: LeaveEntry;
  showActions?: boolean;
  hideName?: boolean;
}) {
  const toast = useToast();
  return (
    <li className="card p-3 flex items-center gap-3">
      {!hideName && (
        <div className="w-8 h-8 rounded-full bg-ink-100 grid place-items-center text-[10px] font-heading font-medium text-ink-700">
          {l.resourceName[0]}
        </div>
      )}
      <div className="flex-1 min-w-0">
        {!hideName && (
          <div className="text-sm text-ink-900 font-medium truncate">
            {l.resourceName}
          </div>
        )}
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
      {l.approved ? (
        <span className="pill-green text-[10px] py-0">Approved</span>
      ) : (
        <span className="pill-yellow text-[10px] py-0">Pending</span>
      )}
      {showActions && (
        <button
          onClick={() =>
            toast.show(`${l.resourceName}'s ${l.type} leave approved.`)
          }
          className="btn-ghost text-xs px-2 py-1 text-brand-greenText hover:bg-brand-greenBg"
        >
          Approve
        </button>
      )}
    </li>
  );
}

function RequestLeaveModal({
  onClose,
  requesterFirstName,
}: {
  onClose: () => void;
  requesterFirstName?: string;
}) {
  const toast = useToast();
  const [type, setType] = useState("Vacation");

  function submit() {
    toast.show(
      `${type} leave requested. Your co-ordinator will see it for approval.`,
    );
    onClose();
  }

  return (
    <Modal title="Request leave" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        {requesterFirstName ? `${requesterFirstName} — ` : ""}mark yourself
        off so the team can plan around it.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Type
      </label>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
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
        Note (optional · visible to your co-ordinator only)
      </label>
      <textarea
        rows={2}
        placeholder="Anything your co-ordinator should know"
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button onClick={submit} className="btn-primary">
          Submit request
        </button>
      </div>
    </Modal>
  );
}
