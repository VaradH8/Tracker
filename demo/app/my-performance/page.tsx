"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/Toast";
import { useTaskDrawer } from "@/components/TaskDrawerProvider";
import { canAccess } from "@/lib/access";
import { useRole } from "@/lib/role";
import { fmtDay, localToday } from "@/lib/engagement";
import { AREA_HINTS, COMMENT_RECIPIENTS, SCALE, type ReviewKind } from "@/lib/performance/forms";
import type { SelfView, TextField } from "@/lib/performance/report";
import {
  Detail,
  MetricTiles,
  Prompts,
  Section,
  StatusPill,
  Table,
  Td,
  TaskStatusCell,
  Text,
  countSummary,
  inputCls,
  previousMonth,
  type Draft,
} from "@/components/performance/ReviewParts";

type Data = { view: SelfView; savedAt: string | null; notified?: string[] };

/** The employee's own fields, as currently saved. */
function draftFrom(v: SelfView): Draft {
  const d: Draft = {};
  const put = (t: TextField) => (d[t.key] = t.value);
  for (const a of v.areas) d[`rating.${a.key}.employee`] = a.employee ? String(a.employee) : "";
  v.self.forEach(put);
  v.achievements.forEach((a) => put(a.employee));
  put(v.employeeComments);
  d["summary.commentTo"] = v.commentTo || "manager";
  return d;
}

/**
 * My Performance — a Developer's own Monthly / Yearly review. They see
 * what the tracker recorded for them (tasks, hours, leave, evidence per
 * area) and fill in the employee's half of the IBS form: a 1–5 rating
 * per area, the self-assessment and their comments. Their Reporting
 * Manager sees these on /performance next to their own assessment.
 */
export default function MyPerformancePage() {
  const [role, , hydrated] = useRole();
  const enabled = hydrated && canAccess(role, "/my-performance");
  const toast = useToast();

  const [kind, setKind] = useState<ReviewKind>("Monthly");
  const [month, setMonth] = useState(previousMonth);
  const [year, setYear] = useState(() => localToday().slice(0, 4));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<Draft>({});
  const [saving, setSaving] = useState(false);

  const period = kind === "Monthly" ? month : year;

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    const qs = new URLSearchParams({ kind, period });
    const res = await fetch(`/api/performance/me?${qs}`, { cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Couldn't load your review.");
      return;
    }
    setData(body as Data);
    const d = draftFrom((body as Data).view);
    setDraft(d);
    setSaved(d);
  }, [kind, period]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const dirty = useMemo(
    () => Object.keys(draft).some((k) => (draft[k] ?? "").trim() !== (saved[k] ?? "").trim()),
    [draft, saved],
  );

  /** Switching period drops unsaved answers — ask first. */
  function guard(fn: () => void) {
    if (!dirty || window.confirm("You have unsaved answers. Discard them?")) fn();
  }

  async function save() {
    const changes: Draft = {};
    for (const k of Object.keys(draft)) {
      const v = (draft[k] ?? "").trim();
      if (v !== (saved[k] ?? "").trim()) changes[k] = v;
    }
    // A comment always goes with the recipient shown in "Send to" — even
    // when that's the default the employee never touched.
    if (changes["summary.employeeComments"]) {
      changes["summary.commentTo"] = draft["summary.commentTo"] ?? "";
    }
    setSaving(true);
    try {
      const res = await fetch("/api/performance/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, period, changes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(body.error ?? "Couldn't save.", "error");
        return;
      }
      setData(body as Data);
      const d = draftFrom((body as Data).view);
      setDraft(d);
      setSaved(d);
      const notified = (body as Data).notified ?? [];
      toast.show(
        notified.length
          ? `Saved — your comment was sent to ${notified.join(", ")}.`
          : "Your self-assessment is saved.",
        "success",
      );
    } finally {
      setSaving(false);
    }
  }

  const set = (key: string) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));
  const v = data?.view;
  const years = Array.from({ length: 6 }, (_, i) => String(Number(localToday().slice(0, 4)) - i));
  const rated = v ? v.areas.filter((a) => draft[`rating.${a.key}.employee`]).length : 0;
  const answered = v ? v.self.filter((s) => (draft[s.key] ?? "").trim()).length : 0;
  const fieldProps = { draft, set, editable: true };
  const commentTo = draft["summary.commentTo"] ?? "";

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold">My Performance</h1>
          <div className="flex rounded border border-ink-200 bg-white p-0.5">
            {(["Monthly", "Yearly"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => guard(() => setKind(k))}
                className={`rounded px-4 py-1.5 text-sm font-medium ${
                  kind === k ? "bg-brand-blue text-white" : "text-ink-700 hover:bg-ink-100"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          {kind === "Monthly" ? (
            <input
              type="month"
              aria-label="Review month"
              className={inputCls}
              value={month}
              max={localToday().slice(0, 7)}
              onChange={(e) => {
                const next = e.target.value;
                if (next) guard(() => setMonth(next));
              }}
            />
          ) : (
            <select
              aria-label="Review year"
              className={inputCls}
              value={year}
              onChange={(e) => {
                const next = e.target.value;
                guard(() => setYear(next));
              }}
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          <button type="button" className="btn-primary gap-1.5 ml-auto" disabled={!dirty || saving || !v} onClick={save}>
            <Save size={15} /> {saving ? "Saving…" : "Save my assessment"}
          </button>
        </header>
        <p className="text-sm text-ink-500 -mt-2">
          See what the tracker recorded for you, rate yourself on each area and answer the self-assessment. Your
          Reporting Manager reviews it alongside their own assessment.
        </p>

        {error ? (
          <div className="card p-6 text-center text-sm text-brand-redText">{error}</div>
        ) : !v ? (
          <div className="card p-6 text-center text-sm text-ink-400">Loading…</div>
        ) : (
          <>
            <div className="card p-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span>
                <strong>{v.periodLabel}</strong>{" "}
                <span className="text-ink-500">· {fmtDay(v.from)} – {fmtDay(v.to)}</span>
              </span>
              <Progress done={rated} total={v.areas.length} label="areas rated" />
              <Progress done={answered} total={v.self.length} label="questions answered" />
              <span className="text-xs text-ink-500 ml-auto">
                {data?.savedAt ? `Last saved ${new Date(data.savedAt).toLocaleString("en-GB")}` : "Not started"}
                {dirty && <span className="text-brand-yellowText"> · unsaved changes</span>}
              </span>
            </div>

            <Section n={1} title="Employee Details">
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                <Detail label="Employee Name" value={v.employee.name} />
                <Detail label="Employee ID" value={v.employee.employeeCode} missing />
                <Detail label="Department" value={v.employee.department} missing />
                <Detail label="Designation" value={v.employee.designation} missing />
                <Detail label="Reporting Manager" value={v.employee.assignedManager || "Admins & Leads"} />
                <Detail label={v.kind === "Monthly" ? "Review Month" : "Review Year"} value={v.periodLabel} />
              </dl>
            </Section>

            <MetricTiles m={v.metrics} />

            {v.kind === "Monthly" ? (
              <Section n={2} title="Monthly Goals / Assigned Tasks" collapsible
                summary={countSummary(v.goals.map((g) => g.status))}
                note="Your tasks for this month, as they stand on My Tasks. Click a task to open it.">
                <Table head={["Goal / Task", "Expected Outcome", "Priority", "Target Date", "Status"]} empty="No tasks assigned to you in this month.">
                  {v.goals.map((g) => (
                    <tr key={g.taskId}>
                      <Td><TaskTitle id={g.taskId} title={g.title} project={g.project} /></Td>
                      <Td className="text-ink-700">{g.expected || "—"}</Td>
                      <Td>{g.priority}</Td>
                      <Td className="whitespace-nowrap">{g.targetDate ? fmtDay(g.targetDate) : <span className="text-ink-400">not set</span>}</Td>
                      <Td><TaskStatusCell status={g.taskStatus} overdueDays={g.overdueDays} /></Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            ) : (
              <Section n={2} title="Annual Goals / KPIs">
                <Table head={["Goal / KPI", "Expected Result", "Actual Result", "Achievement %"]}>
                  {v.kpis.map((k) => (
                    <tr key={k.key}>
                      <Td className="font-medium">{k.goal}</Td>
                      <Td>{k.expected || "—"}</Td>
                      <Td>{k.actual || "—"}</Td>
                      <Td>{k.achievement == null ? "—" : `${k.achievement}%`}</Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {v.kind === "Monthly" ? (
              <Section n={3} title="Critical / Long-Term Task Progress" collapsible
                summary={countSummary(v.longTerm.map((l) => l.status))}
                note="Critical tasks, and work that runs beyond this month — started earlier, due later, or carried over overdue — judged against the monthly milestone. Click a task to open it.">
                <Table
                  head={["Task / Project", "Monthly Milestone", "Planned %", "Actual %", "Progress", "Status"]}
                  empty="No critical or multi-month tasks this month."
                >
                  {v.longTerm.map((l) => (
                    <tr key={l.taskId}>
                      <Td><TaskTitle id={l.taskId} title={l.title} project={l.project} /></Td>
                      <Td>{l.milestone || "—"}</Td>
                      <Td>{l.planned == null ? "—" : `${l.planned}%`}</Td>
                      <Td>{l.actual == null ? "—" : `${l.actual}%`}</Td>
                      <Td><StatusPill s={l.status} /></Td>
                      <Td><TaskStatusCell status={l.taskStatus} overdueDays={l.overdueDays} /></Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            ) : (
              <Section n={3} title="My Major Achievements & Contributions" note="Summarise each in your own words.">
                <Prompts fields={v.achievements.map((a) => ({ ...a.employee, label: a.label }))} {...fieldProps} />
              </Section>
            )}

            <Section n={4} title="Rate Yourself"
              note="Rate each area 1–5 for this period. What it covers and what the tracker recorded for you are shown alongside.">
              <div className="flex flex-wrap gap-1.5 mb-3">
                {SCALE.map((s) => (
                  <span key={s.value} className="pill-grey">{s.value} · {s.label}</span>
                ))}
              </div>
              <Table head={["Performance Area", "What it covers", "From the tracker", "My rating (1–5)"]}>
                {v.areas.map((a) => {
                  const key = `rating.${a.key}.employee`;
                  return (
                    <tr key={a.key}>
                      <Td className="font-medium whitespace-nowrap">{a.label}</Td>
                      <Td className="text-xs text-ink-700 min-w-[200px]">{AREA_HINTS[v.kind][a.key] ?? ""}</Td>
                      <Td className="text-xs text-ink-600 min-w-[200px]">{a.evidence}</Td>
                      <Td>
                        <select
                          aria-label={`${a.label} — my rating`}
                          className={`${inputCls} w-52 ${draft[key] ? "" : "text-ink-400"}`}
                          value={draft[key] ?? ""}
                          onChange={(e) => set(key)(e.target.value)}
                        >
                          <option value="">Select…</option>
                          {SCALE.map((s) => (
                            <option key={s.value} value={String(s.value)}>{s.value} — {s.label}</option>
                          ))}
                        </select>
                      </Td>
                    </tr>
                  );
                })}
              </Table>
            </Section>

            <Section n={5} title="Self-Assessment">
              <Prompts fields={v.self} {...fieldProps} />
            </Section>

            <Section n={6} title="My Comments"
              note="Anything you'd like your Reporting Manager or HR to know about this review. Whoever you choose is notified when you save.">
              <label className="flex flex-wrap items-center gap-2 mb-2 text-sm">
                <span className="font-medium text-ink-700">Send to</span>
                <select
                  aria-label="Send comment to"
                  className={`${inputCls} w-auto min-w-[18rem] pr-8`}
                  value={commentTo}
                  onChange={(e) => set("summary.commentTo")(e.target.value)}
                >
                  {COMMENT_RECIPIENTS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.value === "manager"
                        ? `Reporting Manager (${v.employee.assignedManager || "Admins & Leads"})`
                        : r.label}
                    </option>
                  ))}
                </select>
              </label>
              <Text field={v.employeeComments} {...fieldProps} rows={3} />
            </Section>

            <div className="flex justify-end">
              <button type="button" className="btn-primary gap-1.5" disabled={!dirty || saving} onClick={save}>
                <Save size={15} /> {saving ? "Saving…" : "Save my assessment"}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

/** A task's title that opens it in the task drawer, as on My Tasks. */
function TaskTitle({ id, title, project }: { id: number; title: string; project: string }) {
  const drawer = useTaskDrawer();
  return (
    <button
      type="button"
      onClick={() => drawer.open(id, { backLabel: "My Performance" })}
      className="text-left group"
      title="Open task"
    >
      <span className="font-medium group-hover:text-brand-blue group-hover:underline">{title}</span>
      <div className="text-xs text-ink-500">{project}</div>
    </button>
  );
}

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const complete = total > 0 && done === total;
  return (
    <span className={`inline-flex items-center gap-1 ${complete ? "text-brand-greenText" : "text-ink-700"}`}>
      {complete && <CheckCircle2 size={14} />}
      <strong>{done}</strong>/{total} {label}
    </span>
  );
}
