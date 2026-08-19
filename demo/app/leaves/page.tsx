"use client";

import { useEffect, useState } from "react";
import { Plus, Calendar, Clock, Lock } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { todayISO, type LeaveEntry } from "@/lib/mock";
import { useRole, ROLE_LABELS } from "@/lib/role";
import { useMyFirstName, useAccounts } from "@/lib/account-store";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { DateInput } from "@/components/DateInput";

/** Pick a pill colour for any leave type (types are configurable now). */
function leaveTypeColor(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("sick")) return "bg-brand-redBg text-brand-redText";
  if (t.includes("casual") || t.includes("personal"))
    return "bg-brand-yellowBg text-brand-yellowText";
  if (t.includes("wfh") || t.includes("work from"))
    return "bg-brand-greenBg text-brand-greenText";
  if (t.includes("paid") || t.includes("vacation") || t.includes("annual"))
    return "bg-brand-blueBg text-brand-blue";
  return "bg-ink-100 text-ink-600";
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Count working days (per the configured working days) in [start, end]
 *  inclusive. Used to turn a leave range into a number of leave days. */
function workingDayCount(
  startISO: string,
  endISO: string,
  workingDays: string[],
): number {
  const d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return 0;
  let count = 0;
  let guard = 0;
  while (d <= end && guard < 1000) {
    if (workingDays.includes(DAY_NAMES[d.getDay()])) count++;
    d.setDate(d.getDate() + 1);
    guard++;
  }
  return count;
}

type Balance = { quota: number; taken: number; remaining: number };

/** Approved leave-days taken this calendar year for one person. */
function leaveBalance(
  leaves: LeaveEntry[],
  resourceName: string,
  quota: number,
  workingDays: string[],
): Balance {
  const year = new Date().getFullYear();
  const taken = leaves
    .filter(
      (l) =>
        l.resourceName === resourceName &&
        l.approved &&
        new Date(l.start + "T00:00:00").getFullYear() === year,
    )
    .reduce((sum, l) => sum + workingDayCount(l.start, l.end, workingDays), 0);
  return { quota, taken, remaining: Math.max(0, quota - taken) };
}

type LeaveSettings = {
  leaveTypes: string[];
  annualLeaveQuota: number;
  workingDays: string[];
};

export default function LeavesPage() {
  const [role] = useRole();
  const [open, setOpen] = useState(false);
  const [leaves, setLeaves] = useState<LeaveEntry[]>([]);
  const [settings, setSettings] = useState<LeaveSettings | null>(null);
  const fullVisibility = role === "Admin" || role === "Coordinator";
  const me = useMyFirstName();
  const { accounts } = useAccounts();

  async function refresh() {
    const res = await fetch("/api/leaves", { cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { leaves: LeaveEntry[] };
      setLeaves(body.leaves ?? []);
    }
  }
  useEffect(() => {
    void refresh();
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => b && setSettings(b.settings))
      .catch(() => null);
  }, []);

  const leaveTypes = settings?.leaveTypes ?? [];
  const quota = settings?.annualLeaveQuota ?? 0;
  const workingDays = settings?.workingDays ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];

  const myFirstName = me;
  const myFullName =
    accounts.find((a) => a.name.startsWith(me))?.name ?? "";
  const sorted = [...leaves].sort((a, b) =>
    a.start.localeCompare(b.start),
  );

  if (fullVisibility) {
    return (
      <FullLeavesView
        sorted={sorted}
        open={open}
        setOpen={setOpen}
        onChanged={refresh}
        quota={quota}
        workingDays={workingDays}
        leaveTypes={leaveTypes}
      />
    );
  }

  const myBalance = leaveBalance(leaves, myFullName, quota, workingDays);

  const myLeaves = sorted.filter((l) => l.resourceName === myFullName);
  const teamOff = sorted
    .filter((l) => l.resourceName !== myFullName && l.start >= todayISO())
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

        <div className="card p-5 mb-6">
          <h2 className="font-heading text-sm font-semibold text-ink-700 mb-3">
            Leave balance · {new Date().getFullYear()}
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <BalanceStat label="Annual quota" value={myBalance.quota} />
            <BalanceStat label="Taken" value={myBalance.taken} tone="blue" />
            <BalanceStat
              label="Remaining"
              value={myBalance.remaining}
              tone={myBalance.remaining <= 0 ? "red" : "green"}
            />
          </div>
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
                  <LeaveRow
                    key={l.id}
                    l={l}
                    hideName
                    canDelete
                    onDelete={refresh}
                  />
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
          onSubmitted={refresh}
          leaveTypes={leaveTypes}
        />
      )}
    </AppShell>
  );
}

function BalanceStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "blue" | "green" | "red";
}) {
  const cls =
    tone === "blue"
      ? "text-brand-blue"
      : tone === "green"
        ? "text-brand-greenText"
        : tone === "red"
          ? "text-brand-redText"
          : "text-ink-900";
  return (
    <div className="bg-ink-50 rounded p-3">
      <div className={`font-heading text-2xl font-semibold ${cls}`}>{value}</div>
      <div className="text-[11px] text-ink-500 uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function FullLeavesView({
  sorted,
  open,
  setOpen,
  onChanged,
  quota,
  workingDays,
  leaveTypes,
}: {
  sorted: LeaveEntry[];
  open: boolean;
  setOpen: (v: boolean) => void;
  onChanged: () => Promise<void>;
  quota: number;
  workingDays: string[];
  leaveTypes: string[];
}) {
  const upcoming = sorted.filter((l) => l.start >= todayISO());
  const pending = sorted.filter((l) => !l.approved);
  // Per-person balances across everyone who has any leave on record.
  const names = Array.from(new Set(sorted.map((l) => l.resourceName))).sort();
  const balances = names.map((n) => ({
    name: n,
    ...leaveBalance(sorted, n, quota, workingDays),
  }));

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
                  <LeaveRow
                    key={l.id}
                    l={l}
                    canDelete
                    onDelete={onChanged}
                  />
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
                  <LeaveRow
                    key={l.id}
                    l={l}
                    showActions
                    onApprove={onChanged}
                    onDeny={onChanged}
                  />
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
                      className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium ${leaveTypeColor(l.type)}`}
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

        <section className="card p-5 mt-6">
          <h2 className="font-heading text-lg font-semibold mb-1">
            Leave balances · {new Date().getFullYear()}
          </h2>
          <p className="text-xs text-ink-500 mb-4">
            {quota} days allowed per year · approved leave counts against it.
          </p>
          {balances.length === 0 ? (
            <p className="text-sm text-ink-500 italic">No leave on record yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200">
                  <th className="py-2 pr-4">Person</th>
                  <th className="py-2 pr-4">Quota</th>
                  <th className="py-2 pr-4">Taken</th>
                  <th className="py-2 pr-4">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => (
                  <tr key={b.name} className="border-b border-ink-100">
                    <td className="py-2.5 pr-4 text-ink-900 font-medium">
                      {b.name}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-700">{b.quota}</td>
                    <td className="py-2.5 pr-4 text-ink-700">{b.taken}</td>
                    <td
                      className={`py-2.5 pr-4 font-medium ${
                        b.remaining <= 0 ? "text-brand-redText" : "text-ink-900"
                      }`}
                    >
                      {b.remaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {open && (
        <RequestLeaveModal
          onClose={() => setOpen(false)}
          onSubmitted={onChanged}
          leaveTypes={leaveTypes}
        />
      )}
    </AppShell>
  );
}

function LeaveRow({
  l,
  showActions,
  hideName,
  canDelete,
  onApprove,
  onDeny,
  onDelete,
}: {
  l: LeaveEntry;
  showActions?: boolean;
  hideName?: boolean;
  canDelete?: boolean;
  onApprove?: () => Promise<void> | void;
  onDeny?: () => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}) {
  const toast = useToast();
  const confirm = useConfirm();

  async function approve() {
    const res = await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: l.id, approved: true }),
    });
    if (!res.ok) {
      toast.show("Couldn't approve.", "error");
      return;
    }
    toast.show(`${l.resourceName}'s ${l.type} leave approved.`);
    if (onApprove) await onApprove();
  }

  async function deny() {
    const ok = await confirm({
      title: `Deny ${l.resourceName}'s ${l.type} leave request?`,
      body: "The requester will get a notification with your decision.",
      confirmLabel: "Deny",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/leaves/${l.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.show("Couldn't deny.", "error");
      return;
    }
    toast.show(`${l.resourceName}'s ${l.type} leave denied.`, "info");
    if (onDeny) await onDeny();
  }

  async function remove() {
    const ok = await confirm({
      title: l.approved
        ? `Delete this ${l.type} leave entry?`
        : `Cancel this ${l.type} leave request?`,
      confirmLabel: l.approved ? "Delete entry" : "Cancel request",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/leaves/${l.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.show("Couldn't delete.", "error");
      return;
    }
    toast.show("Leave entry removed.", "info");
    if (onDelete) await onDelete();
  }

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
        className={`inline-flex items-center px-2 py-0.5 rounded-pill text-[11px] font-medium ${leaveTypeColor(l.type)}`}
      >
        {l.type}
      </span>
      {l.approved ? (
        <span className="pill-green text-[10px] py-0">Approved</span>
      ) : (
        <span className="pill-yellow text-[10px] py-0">Pending</span>
      )}
      {canDelete && (
        <button
          onClick={remove}
          className="p-1 -m-1 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
          title="Delete leave"
          aria-label="Delete leave"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="m19 6-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
        </button>
      )}
      {showActions && (
        <>
          <button
            onClick={approve}
            className="btn-ghost text-xs px-2 py-1 text-brand-greenText hover:bg-brand-greenBg"
          >
            Approve
          </button>
          <button
            onClick={deny}
            className="btn-ghost text-xs px-2 py-1 text-brand-redText hover:bg-brand-redBg"
          >
            Deny
          </button>
        </>
      )}
    </li>
  );
}

function RequestLeaveModal({
  onClose,
  requesterFirstName,
  onSubmitted,
  leaveTypes,
}: {
  onClose: () => void;
  requesterFirstName?: string;
  onSubmitted?: () => void;
  leaveTypes: string[];
}) {
  const toast = useToast();
  const types = leaveTypes.length > 0 ? leaveTypes : ["Sick Leave", "Casual Leave"];
  const [type, setType] = useState(types[0]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  async function submit() {
    const res = await fetch("/api/leaves", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        start: start || new Date().toISOString().slice(0, 10),
        end: end || start || new Date().toISOString().slice(0, 10),
        note: note || null,
      }),
    });
    if (!res.ok) {
      toast.show("Couldn't submit leave.", "error");
      return;
    }
    toast.show(
      `${type} leave requested. Your co-ordinator will see it for approval.`,
    );
    onSubmitted?.();
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
        {types.map((t) => (
          <option key={t}>{t}</option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            From
          </label>
          <DateInput value={start} onChange={(iso: string) => setStart(iso)} className="w-full px-3 py-2 rounded border border-ink-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-700 mb-1.5">
            To
          </label>
          <DateInput value={end} onChange={(iso: string) => setEnd(iso)} className="w-full px-3 py-2 rounded border border-ink-200 text-sm" />
        </div>
      </div>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Note (optional · visible to your co-ordinator only)
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
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
