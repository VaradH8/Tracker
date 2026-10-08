"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Info, Pencil, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { canAccess } from "@/lib/access";
import { useRole, ROLE_LABELS, type Role } from "@/lib/role";
import { useAccounts } from "@/lib/account-store";
import { fmtDay, localToday } from "@/lib/engagement";
import {
  LEVELS,
  MAX_MANUAL_GOALS,
  PRIORITIES,
  type ReviewKind,
} from "@/lib/performance/forms";
import type { HrRow, RatingRow, Report, TextField } from "@/lib/performance/report";
import {
  Detail,
  MetricTiles,
  Prompts,
  RatingSelect,
  Section,
  StatusPill,
  Table,
  Td,
  Text,
  areaCls,
  countSummary,
  inputCls,
  previousMonth,
  type Draft,
  type FieldProps,
} from "@/components/performance/ReviewParts";

/* ------------------------------------------------------------------ types */

type Person = {
  id: string;
  name: string;
  role: Role;
  designation: string;
  department: string;
  employeeCode: string;
  joined: string;
  reportingManagerId: string | null;
  reportingManager: string;
};

type PeopleData = {
  people: Person[];
  managers: { id: string; name: string; role: Role }[];
  viewer: { id: string; canEditRecords: boolean; canDownload: boolean };
};

type ReportData = {
  report: Report;
  meta: { savedAt: string | null; savedBy: string | null };
  canEdit: boolean;
  /** HR accounts only: the HR Evaluation section. */
  canEditHr: boolean;
  canDownload: boolean;
  /** Who signs for HR: the viewing HR account, else every active HR account. */
  hrName: string;
};

/* ---------------------------------------------------------- draft model */

/** Every editable field's starting value: what was saved ("" if
 *  nothing yet — the tracker never pre-fills a rating or remark). */
function draftFrom(r: Report): Draft {
  const d: Draft = {};
  const put = (t: TextField) => (d[t.key] = t.value);
  r.longTerm.forEach((l) => put(l.milestone));
  r.kpis.forEach((k) => put(k.comments));
  r.achievements.forEach((a) => (put(a.employee), put(a.manager)));
  r.self.forEach(put);
  r.manager.forEach(put);
  put(r.summary.plan);
  put(r.summary.feedback);
  put(r.summary.employeeComments);
  for (const a of r.areas) {
    d[`rating.${a.key}.employee`] = a.employee ? String(a.employee) : "";
    d[`rating.${a.key}.manager`] = a.manager ? String(a.manager) : "";
    d[`rating.${a.key}.comments`] = a.comments;
  }
  for (const h of r.hr) {
    d[`hr.${h.key}.rating`] = h.rating ? String(h.rating) : "";
    d[`hr.${h.key}.comments`] = h.comments;
  }
  for (const k of r.kpis.filter((k) => k.manual)) {
    d[`${k.key}.goal`] = k.goal;
    d[`${k.key}.expected`] = k.expected;
    d[`${k.key}.actual`] = k.actual;
    d[`${k.key}.achievement`] = k.achievement == null ? "" : String(k.achievement);
  }
  d["summary.overall"] = r.summary.overallEntered && r.summary.overall != null ? String(r.summary.overall) : "";
  d["summary.level"] = r.summary.levelEntered ? (r.summary.level ?? "") : "";
  d["summary.priority"] = r.summary.priorityEntered ? (r.summary.priority ?? "") : "";
  d.reviewDate = r.reviewDate;
  return d;
}

/* ----------------------------------------------------------------- page */

/**
 * Performance reviews — the IBS Monthly / Yearly review, generated from
 * the tracker (tasks, hours, leave) and completed by the Reporting
 * Manager (an Admin or Lead), HR or Admin. HR and Admin can read every
 * review, a Lead their own team's; only HR downloads the Word document.
 * Co-ordinators have My Performance instead.
 */
export default function PerformancePage() {
  const [role, , hydrated] = useRole();
  // Checked by the account's real role: HR has this page, a Co-ordinator
  // (whose access HR otherwise shares) doesn't.
  const { current } = useAccounts();
  const enabled = hydrated && canAccess(current?.role ?? role, "/performance");
  const toast = useToast();

  const [people, setPeople] = useState<PeopleData | null>(null);
  const [userId, setUserId] = useState("");
  const [kind, setKind] = useState<ReviewKind>("Monthly");
  const [month, setMonth] = useState(previousMonth);
  const [year, setYear] = useState(() => localToday().slice(0, 4));
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState<Draft>({});
  const [saving, setSaving] = useState(false);
  const [editingPerson, setEditingPerson] = useState(false);
  const [help, setHelp] = useState(false);

  const period = kind === "Monthly" ? month : year;

  const loadPeople = useCallback(async () => {
    const res = await fetch("/api/performance/people", { cache: "no-store" });
    if (!res.ok) {
      setError("Couldn't load employees.");
      return;
    }
    const body = (await res.json()) as PeopleData;
    setPeople(body);
    setUserId((cur) => {
      if (cur) return cur;
      const fromUrl = new URLSearchParams(window.location.search).get("user");
      return body.people.find((p) => p.id === fromUrl)?.id ?? body.people[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    if (enabled) void loadPeople();
  }, [enabled, loadPeople]);

  const loadReport = useCallback(async () => {
    if (!userId || !period) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ userId, kind, period });
      const res = await fetch(`/api/performance/report?${qs}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load the review.");
        setData(null);
        return;
      }
      setData(body as ReportData);
      const d = draftFrom((body as ReportData).report);
      setDraft(d);
      setSaved(d);
    } finally {
      setLoading(false);
    }
  }, [userId, kind, period]);

  useEffect(() => {
    void loadReport();
    if (userId) {
      const url = new URL(window.location.href);
      url.searchParams.set("user", userId);
      window.history.replaceState(null, "", url);
    }
  }, [loadReport, userId]);

  const dirty = useMemo(
    () => Object.keys({ ...draft, ...saved }).some((k) => (draft[k] ?? "") !== (saved[k] ?? "")),
    [draft, saved],
  );

  async function save() {
    if (!data) return;
    // Only what changed since load ("" clears a field).
    const changes: Draft = {};
    for (const k of new Set([...Object.keys(draft), ...Object.keys(saved)])) {
      const value = (draft[k] ?? "").trim();
      if (value === (saved[k] ?? "").trim()) continue;
      changes[k] = value;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/performance/report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, kind, period, changes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.show(body.error ?? "Couldn't save the review.", "error");
        return;
      }
      setData(body as ReportData);
      const d = draftFrom((body as ReportData).report);
      setDraft(d);
      setSaved(d);
      toast.show("Review saved.", "success");
    } finally {
      setSaving(false);
    }
  }

  const person = people?.people.find((p) => p.id === userId) ?? null;
  const set = (key: string) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));
  const editable = !!data?.canEdit;
  const hrEditable = !!data?.canEditHr;
  const r = data?.report;
  const downloadHref = `/api/performance/report/download?${new URLSearchParams({ userId, kind, period })}`;
  const years = Array.from({ length: 6 }, (_, i) => String(Number(localToday().slice(0, 4)) - i));

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8 space-y-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-3xl font-semibold">Performance reviews</h1>
          <div className="flex rounded border border-ink-200 bg-white p-0.5">
            {(["Monthly", "Yearly"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded px-4 py-1.5 text-sm font-medium ${
                  kind === k ? "bg-brand-blue text-white" : "text-ink-700 hover:bg-ink-100"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setHelp((v) => !v)}
            aria-label="How this review is built"
            className="p-1 rounded-full text-ink-400 hover:text-brand-blue hover:bg-ink-100"
          >
            <Info size={18} />
          </button>
        </header>
        <p className="text-sm text-ink-500 -mt-2">
          The standard IBS {kind.toLowerCase()} review, filled from the tracker and completed by the Reporting Manager.
        </p>

        {help && (
          <div className="card p-4 text-sm text-ink-700 space-y-1">
            <p>
              <strong>From the tracker (facts only):</strong> employee details, the task tables, hours, leave, KPIs,
              and the tracker data beside each rating area for reference. These refresh whenever the tracker
              changes. The tracker never suggests a rating or writes a remark.
            </p>
            <p>
              <strong>Entered by people:</strong> every rating and remark. The employee&apos;s Reporting Manager
              (every Admin and Lead while none is assigned), Admins and HR mark the manager side; the employee
              marks their own ratings and self-assessment on My Performance.
            </p>
            <p>
              <strong>HR Evaluation:</strong> rated by HR only — Admins and Reporting Managers see it read-only, and
              the employee doesn&apos;t see it.
            </p>
            <p>
              Lead, Co-ordinator, HR and Admin can read every review. Only HR can download it as the Word document.
            </p>
          </div>
        )}

        <div className="card p-3 flex flex-wrap items-center gap-2">
          <select
            aria-label="Employee"
            className={`${inputCls} min-w-[220px]`}
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {!people && <option>Loading…</option>}
            {people?.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {ROLE_LABELS[p.role] ?? p.role}
              </option>
            ))}
          </select>
          {kind === "Monthly" ? (
            <input
              type="month"
              aria-label="Review month"
              className={inputCls}
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
          ) : (
            <select aria-label="Review year" className={inputCls} value={year} onChange={(e) => setYear(e.target.value)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          <div className="ml-auto flex items-center gap-2">
            {editable && (
              <button type="button" className="btn-primary gap-1.5" disabled={!dirty || saving} onClick={save}>
                <Save size={15} /> {saving ? "Saving…" : "Save review"}
              </button>
            )}
            {data?.canDownload &&
              (dirty ? (
                <span className="btn-ghost gap-1.5 opacity-50 cursor-not-allowed" title="Save your changes first">
                  <Download size={15} /> Download Word
                </span>
              ) : (
                <a className="btn-ghost gap-1.5 border border-ink-200" href={downloadHref}>
                  <Download size={15} /> Download Word
                </a>
              ))}
          </div>
        </div>

        {error ? (
          <div className="card p-6 text-center text-sm text-brand-redText">{error}</div>
        ) : people && people.people.length === 0 ? (
          <div className="card p-6 text-center text-sm text-ink-400">No employees to review yet.</div>
        ) : !r || loading ? (
          <div className="card p-6 text-center text-sm text-ink-400">Loading…</div>
        ) : (
          <>
            <p className="text-xs text-ink-500">
              {r.periodLabel} · {fmtDay(r.from)} – {fmtDay(r.to)} · tracker data as of {fmtDay(r.asOf)}
              {data?.meta.savedAt
                ? ` · last saved ${new Date(data.meta.savedAt).toLocaleString("en-GB")}${data.meta.savedBy ? ` by ${data.meta.savedBy}` : ""}`
                : " · not reviewed yet"}
              {!editable && " · read-only (only this person's Reporting Manager, an Admin or HR can edit)"}
            </p>

            {/* 1. Employee details */}
            <Section n={1} title="Employee Details" action={
              people?.viewer.canEditRecords && person ? (
                <button type="button" className="btn-ghost !px-2 !py-1 gap-1 text-xs" onClick={() => setEditingPerson(true)}>
                  <Pencil size={13} /> Edit details
                </button>
              ) : null
            }>
              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                <Detail label="Employee Name" value={r.employee.name} />
                <Detail label="Employee ID" value={r.employee.employeeCode} missing />
                <Detail label="Department" value={r.employee.department} missing />
                <Detail label="Designation" value={r.employee.designation} missing />
                <Detail
                  label="Reporting Manager"
                  value={r.employee.assignedManager || "Not assigned — every Admin & Lead"}
                />
                {r.kind === "Monthly" ? (
                  <>
                    <Detail label="Review Month" value={r.periodLabel} />
                    <Detail label="Review Period" value={`${fmtDay(r.from)} – ${fmtDay(r.to)}`} />
                    <div>
                      <dt className="text-[11px] uppercase tracking-wide text-ink-500">Date of Review</dt>
                      <dd>
                        {editable ? (
                          <input
                            type="date"
                            className={`${inputCls} mt-0.5`}
                            value={draft.reviewDate ?? ""}
                            onChange={(e) => set("reviewDate")(e.target.value)}
                          />
                        ) : (
                          fmtDay(r.reviewDate)
                        )}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <Detail label="Review Year" value={r.periodLabel} />
                    <Detail label="Date of Joining" value={r.employee.joined ? fmtDay(r.employee.joined) : ""} missing />
                    <Detail label="Review Period" value={`${fmtDay(r.from)} – ${fmtDay(r.to)}`} />
                  </>
                )}
              </dl>
            </Section>

            <MetricTiles m={r.metrics} />

            {/* 2. Goals */}
            {r.kind === "Monthly" ? (
              <Section n={2} title="Monthly Goals / Assigned Tasks" collapsible summary={countSummary(r.goals.map((g) => g.status))}>
                <Table head={["Goal / Task", "Expected Outcome", "Priority", "Target Date", "Status"]} empty="No tasks assigned in this month.">
                  {r.goals.map((g) => (
                    <tr key={g.taskId}>
                      <Td><span className="font-medium">{g.title}</span><div className="text-xs text-ink-500">{g.project}</div></Td>
                      <Td className="text-ink-700">{g.expected || "—"}</Td>
                      <Td>{g.priority}</Td>
                      <Td className="whitespace-nowrap">{g.targetDate ? fmtDay(g.targetDate) : <span className="text-ink-400">not set</span>}</Td>
                      <Td><StatusPill s={g.status} /></Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            ) : (
              <Section n={2} title="Annual Goals / KPIs">
                <Table head={["Goal / KPI", "Expected Result", "Actual Result", "Achievement %", "Manager Comments"]}>
                  {r.kpis.filter((k) => !k.manual).map((k) => (
                    <tr key={k.key}>
                      <Td className="font-medium">{k.goal}</Td>
                      <Td>{k.expected}</Td>
                      <Td>{k.actual}</Td>
                      <Td>{k.achievement == null ? "—" : `${k.achievement}%`}</Td>
                      <Td><Text field={k.comments} draft={draft} set={set} editable={editable} rows={1} /></Td>
                    </tr>
                  ))}
                  {Array.from({ length: MAX_MANUAL_GOALS }, (_, i) => i + 1)
                    .filter((n) => editable || draft[`goal.${n}.goal`])
                    .map((n) => (
                      <tr key={`goal.${n}`}>
                        {(["goal", "expected", "actual", "achievement", "comments"] as const).map((f) => {
                          const key = `goal.${n}.${f}`;
                          return (
                            <Td key={f}>
                              {editable ? (
                                <input
                                  className={`${inputCls} w-full`}
                                  inputMode={f === "achievement" ? "numeric" : undefined}
                                  placeholder={f === "goal" ? `Additional goal ${n}` : f === "achievement" ? "0–100" : ""}
                                  value={draft[key] ?? ""}
                                  onChange={(e) => set(key)(e.target.value)}
                                />
                              ) : (
                                draft[key] || "—"
                              )}
                            </Td>
                          );
                        })}
                      </tr>
                    ))}
                </Table>
              </Section>
            )}

            {/* 3. Long-term progress / Achievements */}
            {r.kind === "Monthly" ? (
              <Section n={3} title="Critical / Long-Term Task Progress" collapsible
                summary={countSummary(r.longTerm.map((l) => l.status))}
                note="For tasks extending beyond one month, progress is judged against the monthly milestone rather than final completion. Planned % = share of the task's start→target span elapsed; Actual % = hours logged ÷ estimate (100% once done).">
                <Table head={["Task / Project", "Monthly Milestone", "Planned %", "Actual %", "Status"]} empty="No critical or multi-month tasks in this month.">
                  {r.longTerm.map((l) => (
                    <tr key={l.taskId}>
                      <Td><span className="font-medium">{l.title}</span><div className="text-xs text-ink-500">{l.project}</div></Td>
                      <Td><Text field={l.milestone} draft={draft} set={set} editable={editable} rows={1} /></Td>
                      <Td>{l.planned == null ? "—" : `${l.planned}%`}</Td>
                      <Td>{l.actual == null ? "—" : `${l.actual}%`}</Td>
                      <Td><StatusPill s={l.status} /></Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            ) : (
              <Section n={3} title="Major Achievements & Contributions">
                <Table head={["Area", "Employee Summary", "Manager Assessment / Evidence"]}>
                  {r.achievements.map((a) => (
                    <tr key={a.key}>
                      <Td className="font-medium w-[22%]">{a.label}</Td>
                      <Td><Text field={a.employee} draft={draft} set={set} editable={editable} /></Td>
                      <Td><Text field={a.manager} draft={draft} set={set} editable={editable} /></Td>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}

            {/* 4. Ratings */}
            <Section n={4} title={r.kind === "Monthly" ? "Performance Assessment" : "Annual Performance Assessment"}
              note="Ratings are marked by people only — the employee rates themselves on My Performance, the Reporting Manager / Admin / HR give the manager rating. Tracker data is shown for reference and isn't printed. Scale: 5 Exceptional · 4 Exceeds · 3 Meets · 2 Needs Improvement · 1 Unsatisfactory.">
              <Table head={["Performance Area", "Tracker data (reference)", "Employee (1–5)", "Manager (1–5)", "Manager Comments"]}>
                {r.areas.map((a) => (
                  <RatingLine key={a.key} a={a} draft={draft} set={set} editable={editable} />
                ))}
              </Table>
            </Section>

            {/* 5 / 6 */}
            <Section n={5} title="Employee Self-Assessment" note="The employee's own words — enter what they submitted.">
              <Prompts fields={r.self} draft={draft} set={set} editable={editable} />
            </Section>
            <Section n={6} title={r.kind === "Monthly" ? "Manager Assessment" : "Manager Overall Assessment"}
              note="Written by the Reporting Manager, an Admin or HR.">
              <Prompts fields={r.manager} draft={draft} set={set} editable={editable} />
            </Section>

            {/* 7. HR Evaluation */}
            <Section n={7} title="HR Evaluation"
              note={`Rated by HR only — not part of the overall rating${hrEditable ? "" : "; read-only for you"}. Scale: 5 Exceptional · 4 Exceeds · 3 Meets · 2 Needs Improvement · 1 Unsatisfactory.`}>
              <Table head={["Evaluation Area", "HR Rating (1–5)", "HR Comments"]}>
                {r.hr.map((h) => (
                  <HrLine key={h.key} h={h} draft={draft} set={set} editable={hrEditable} />
                ))}
              </Table>
            </Section>

            {/* 8. Summary */}
            <Section n={8} title={r.kind === "Monthly" ? "Monthly Summary" : "Annual Performance Summary"}>
              <div className="grid gap-4 md:grid-cols-3 mb-4">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-ink-500">
                    Overall {r.kind === "Monthly" ? "Monthly" : "Annual"} Rating
                  </div>
                  <div className="font-heading text-2xl font-semibold">
                    {r.summary.overall == null ? "—" : r.summary.overall.toFixed(1)} <span className="text-base text-ink-400">/ 5</span>
                  </div>
                  {editable && (
                    <input
                      className={`${inputCls} mt-1 w-40`}
                      inputMode="decimal"
                      placeholder="Override (1–5)"
                      value={draft["summary.overall"] ?? ""}
                      onChange={(e) => set("summary.overall")(e.target.value)}
                    />
                  )}
                  {!r.summary.overallEntered && (
                    <p className="text-xs text-ink-500 mt-1">Average of the manager ratings entered in section 4.</p>
                  )}
                </div>
                <Choice label="Performance Level" options={LEVELS} auto={r.summary.autoLevel} k="summary.level" draft={draft} set={set} editable={editable} />
                {r.kind === "Yearly" && (
                  <Choice label="Development Priority" options={PRIORITIES} auto={r.summary.autoPriority} k="summary.priority" draft={draft} set={set} editable={editable} />
                )}
              </div>
              <Prompts fields={[r.summary.plan, r.summary.feedback, r.summary.employeeComments]} draft={draft} set={set} editable={editable} />
            </Section>

            {/* 9. Sign-off */}
            <Section n={9} title="Sign-Off" note="Dates are completed on the printed document.">
              <div className="grid sm:grid-cols-3 gap-3 text-sm">
                {[
                  ["Employee", r.employee.name],
                  ["Reporting Manager", r.employee.reportingManager || "The Admin or Lead who reviews it"],
                  ["HR", data?.hrName || "No active HR account"],
                ].map(([who, name]) => (
                  <div key={who} className="rounded border border-ink-200 p-3">
                    <div className="text-[11px] uppercase tracking-wide text-ink-500">{who}</div>
                    <div className="font-medium">{name}</div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>

      {editingPerson && person && people && (
        <EmployeeDetailsModal
          person={person}
          managers={people.managers}
          onClose={() => setEditingPerson(false)}
          onSaved={async () => {
            setEditingPerson(false);
            await loadPeople();
            await loadReport();
            toast.show("Employee details updated.", "success");
          }}
        />
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------- components */


function RatingLine({ a, ...p }: FieldProps & { a: RatingRow }) {
  const comments = `rating.${a.key}.comments`;
  return (
    <tr>
      <Td className="font-medium whitespace-nowrap">{a.label}</Td>
      <Td className="text-xs text-ink-600 min-w-[220px]">{a.evidence}</Td>
      <Td><RatingSelect k={`rating.${a.key}.employee`} label={`${a.label} — employee`} {...p} /></Td>
      <Td><RatingSelect k={`rating.${a.key}.manager`} label={`${a.label} — manager`} {...p} /></Td>
      <Td className="min-w-[200px]">
        {p.editable ? (
          <textarea aria-label={`${a.label} — comments`} className={areaCls} rows={2} placeholder="Manager comments"
            value={p.draft[comments] ?? ""} onChange={(e) => p.set(comments)(e.target.value)} />
        ) : (
          <span className="text-ink-700">{p.draft[comments] || "—"}</span>
        )}
      </Td>
    </tr>
  );
}

function HrLine({ h, ...p }: FieldProps & { h: HrRow }) {
  const comments = `hr.${h.key}.comments`;
  return (
    <tr>
      <Td className="font-medium whitespace-nowrap w-[28%]">{h.label}</Td>
      <Td className="w-[16%]"><RatingSelect k={`hr.${h.key}.rating`} label={`${h.label} — HR rating`} {...p} /></Td>
      <Td>
        {p.editable ? (
          <textarea aria-label={`${h.label} — HR comments`} className={areaCls} rows={2} placeholder="HR comments"
            value={p.draft[comments] ?? ""} onChange={(e) => p.set(comments)(e.target.value)} />
        ) : (
          <span className="text-ink-700">{p.draft[comments] || "—"}</span>
        )}
      </Td>
    </tr>
  );
}

function Choice({ label, options, auto, k, draft, set, editable }: FieldProps & { label: string; options: readonly string[]; auto: string | null; k: string }) {
  const v = draft[k] ?? "";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      {editable ? (
        <select aria-label={label} className={`${inputCls} mt-1`} value={v} onChange={(e) => set(k)(e.target.value)}>
          <option value="">From the ratings{auto ? ` — ${auto}` : ""}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <div className="font-heading text-lg font-semibold mt-1">{v || auto || "—"}</div>
      )}
    </div>
  );
}

function EmployeeDetailsModal({
  person,
  managers,
  onClose,
  onSaved,
}: {
  person: Person;
  managers: { id: string; name: string; role: Role }[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState({
    employeeCode: person.employeeCode,
    department: person.department,
    designation: person.designation,
    joined: person.joined,
    reportingManagerId: person.reportingManagerId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/performance/people/${person.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, reportingManagerId: form.reportingManagerId || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save.");
        return;
      }
      await onSaved();
    } finally {
      setBusy(false);
    }
  }

  const label = "block text-xs font-medium text-ink-700 mb-1";
  return (
    <Modal title={`Employee details — ${person.name}`} onClose={onClose} size="lg">
      <form onSubmit={submit} className="space-y-3 mt-3">
        <div className="grid grid-cols-2 gap-3">
          <label><span className={label}>Employee ID</span><input className={`${inputCls} w-full`} value={form.employeeCode} onChange={field("employeeCode")} /></label>
          <label><span className={label}>Department</span><input className={`${inputCls} w-full`} value={form.department} onChange={field("department")} /></label>
          <label><span className={label}>Designation</span><input className={`${inputCls} w-full`} value={form.designation} onChange={field("designation")} /></label>
          <label><span className={label}>Date of joining</span><input type="date" className={`${inputCls} w-full`} value={form.joined} onChange={field("joined")} /></label>
        </div>
        <label className="block">
          <span className={label}>Reporting Manager (Admin or Lead)</span>
          <select className={`${inputCls} w-full`} value={form.reportingManagerId} onChange={field("reportingManagerId")}>
            <option value="">Not assigned — every Admin &amp; Lead</option>
            {managers.filter((m) => m.id !== person.id).map((m) => (
              <option key={m.id} value={m.id}>{m.name} · {ROLE_LABELS[m.role] ?? m.role}</option>
            ))}
          </select>
          <span className="text-xs text-ink-500">
            Also editable from Users → Edit user. They rate and comment on this person&apos;s reviews.
          </span>
        </label>
        {error && <p className="text-sm text-brand-redText">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Modal>
  );
}
