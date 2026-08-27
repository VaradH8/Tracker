"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarDays, Check, Paperclip, Plus, X } from "lucide-react";
import { DOMAIN_ROLE_LABELS, type DomainRole } from "@/lib/domain";
import {
  budgetedHours,
  daySpan,
  weekendLabel,
  HOURS_PER_DAY,
} from "@/lib/domain-task-hours";
import { dateClass, inputClass, textareaClass } from "@/lib/domain-ui";
import { DateInput } from "@/components/DateInput";
import { fmtDate } from "@/lib/domain-format";
import { SearchSelect } from "@/components/SearchSelect";
import { useDomain } from "@/lib/domain-store";

/**
 * Handing work over.
 *
 * One form for both cases. Giving a task to somebody else and giving one
 * to yourself differ only in the name in the first field, so they are not
 * two screens — which also means a self-assigned task gets reviewers,
 * files and hours without anything being built twice.
 *
 * Reviewers are optional and plural. Naming nobody means the task is done
 * when you say it is done; naming somebody means it waits for them. Any
 * one of them approving closes it, so the form says so rather than
 * leaving people to discover it.
 */

type Person = { id: string; name: string; role: string };
/** The receipt for a task that has just gone out. */
type Assigned = {
  id: number;
  title: string;
  who: string;
  toSelf: boolean;
  due: string | null;
  hours: number | null;
  weekends: boolean;
  reviewers: string[];
  attached: number;
  failed: string[];
};
type Project = { id: number; name: string; divisions?: { id: number; name: string }[] };

export function DomainAssignTask({
  onCreated,
  onOpenHistory,
}: {
  onCreated: () => void;
  /** Take the assigner to the task they just handed out. */
  onOpenHistory?: (taskId: number) => void;
}) {
  const { current } = useDomain();
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [assignDate, setAssignDate] = useState(todayISO);
  const [dueDate, setDueDate] = useState("");
  const [hours, setHours] = useState("");
  /** Whether the hours box has been typed in. Once it has, the dates stop
   *  overwriting it — the figure they suggest is a starting point. */
  const [hoursTouched, setHoursTouched] = useState(false);
  /** Whether the Saturdays and Sundays in the span are being worked. Off
   *  by default: counting them silently would promise somebody's weekend. */
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What was just assigned, kept so the confirmation can describe it. */
  const [done, setDone] = useState<Assigned | null>(null);

  useEffect(() => {
    fetch("/api/domain/users", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((b) => setPeople(b.users ?? []))
      .catch(() => null);
    fetch("/api/domain/projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((b) => setProjects(b.projects ?? []))
      .catch(() => null);
  }, []);

  /**
   * The dates propose the hours: nine a working day, counted as the gap.
   * Assigned Monday and due Thursday is three days and twenty-seven
   * hours. Suggested, never imposed — plenty of tasks are two hours
   * inside a week-long window.
   */
  const span = useMemo(
    () => daySpan(assignDate || null, dueDate || null),
    [assignDate, dueDate],
  );
  const suggested = useMemo(
    () => budgetedHours(assignDate || null, dueDate || null, includeWeekends),
    [assignDate, dueDate, includeWeekends],
  );
  useEffect(() => {
    if (!hoursTouched) setHours(suggested === null ? "" : String(suggested));
  }, [suggested, hoursTouched]);

  const divisions =
    projects.find((p) => String(p.id) === projectId)?.divisions ?? [];

  /** Anybody may be asked to review, including upwards — see the tasks
   *  route. Only the assignee is out, since that is not review. */
  const reviewerOptions = people
    .filter((p) => p.id !== assigneeId)
    .map((p) => ({
      value: p.id,
      label: p.name,
      hint: DOMAIN_ROLE_LABELS[p.role as DomainRole] ?? p.role,
    }));
  const chosenReviewers = reviewerIds
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => !!p);

  function reset() {
    setTitle("");
    setNote("");
    setDueDate("");
    setHours("");
    setHoursTouched(false);
    setIncludeWeekends(false);
    setReviewerIds([]);
    setFiles([]);
    setDivisionId("");
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await fetch("/api/domain/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: note || null,
        assigneeId,
        projectId: projectId || null,
        divisionId: divisionId || null,
        startDate: assignDate || null,
        targetDate: dueDate || null,
        estimatedHours: hours || null,
        includesWeekends: includeWeekends,
        reviewerIds,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(body.error ?? "Couldn't assign that.");
      return;
    }

    /**
     * Files go after the task exists, because they hang off its id. A
     * failure here is reported without pretending the task failed — it
     * did not, and saying so would have somebody assign it twice.
     */
    const failed: string[] = [];
    for (const f of files) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("side", "Brief");
      const up = await fetch(`/api/domain/tasks/${body.task.id}/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!up.ok) failed.push(f.name);
    }
    setBusy(false);
    setDone({
      id: body.task.id,
      title: body.task.title,
      who: body.task.assignee ?? "somebody",
      toSelf: body.task.assigneeId === current?.id,
      due: body.task.targetDate ?? null,
      hours: body.task.estimatedHours ?? null,
      weekends: includeWeekends && (span?.weekend.length ?? 0) > 0,
      reviewers: chosenReviewers.map((r) => r.name),
      attached: files.length - failed.length,
      failed,
    });
    reset();
    onCreated();
  }

  const canSubmit = !!title.trim() && !!assigneeId && !busy;

  return (
    <div className="card p-5">
      <h2 className="font-heading text-lg font-semibold mb-1">Assign a task</h2>
      <p className="text-sm text-ink-500 mb-4">
        To anybody, including yourself. Reviewers are optional — without one
        the task is done when the person doing it says so.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-xs sm:col-span-2">
          <span className="block text-ink-700 font-medium mb-1">
            What needs doing <span className="text-brand-redText">*</span>
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Tag the pump house isometrics"
            className={inputClass("md", "w-full")}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">
            Assign to <span className="text-brand-redText">*</span>
          </span>
          <SearchSelect
            value={assigneeId}
            onChange={(v) => {
              setAssigneeId(v);
              setReviewerIds((ids) => ids.filter((id) => id !== v));
            }}
            placeholder="Pick a person…"
            searchPlaceholder="Search people"
            options={[
              ...(current
                ? [{ value: current.id, label: `Myself (${current.name})`, pinned: true }]
                : []),
              ...people
                .filter((p) => p.id !== current?.id)
                .map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: DOMAIN_ROLE_LABELS[p.role as DomainRole] ?? p.role,
                })),
            ]}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Project</span>
          <SearchSelect
            value={projectId}
            onChange={(v) => {
              setProjectId(v);
              setDivisionId("");
            }}
            placeholder="Ad hoc — no project"
            searchPlaceholder="Search projects"
            options={projects.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </label>

        {divisions.length > 0 && (
          <label className="text-xs">
            <span className="block text-ink-700 font-medium mb-1">Division</span>
            <SearchSelect
              value={divisionId}
              onChange={setDivisionId}
              placeholder="Not division-specific"
              searchPlaceholder="Search divisions"
              options={divisions.map((d) => ({
                value: String(d.id),
                label: d.name,
              }))}
            />
          </label>
        )}

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Assign date</span>
          <DateInput
            value={assignDate}
            onChange={setAssignDate}
            className={dateClass("md")}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Due date</span>
          <DateInput
            value={dueDate}
            min={assignDate || undefined}
            onChange={setDueDate}
            className={dateClass("md")}
          />
        </label>

        <label className="text-xs">
          <span className="block text-ink-700 font-medium mb-1">Hours</span>
          <input
            type="number"
            min={0}
            step={0.25}
            value={hours}
            onChange={(e) => {
              setHours(e.target.value);
              setHoursTouched(true);
            }}
            placeholder="—"
            className={inputClass("md", "w-full")}
          />
          <span className="block text-[11px] text-ink-400 mt-1">
            {hoursTouched
              ? "Yours — the dates won't overwrite it now"
              : suggested !== null
                ? `${HOURS_PER_DAY}h a day × ${span?.days(includeWeekends)} ${
                    includeWeekends ? "day" : "working day"
                  }${(span?.days(includeWeekends) ?? 0) === 1 ? "" : "s"}`
                : `Set it with or without dates — ${HOURS_PER_DAY}h a day is only a starting point`}
          </span>
        </label>

        {/*
          The weekend, said out loud.

          A span that crosses a Saturday is the single most common way an
          estimate goes wrong: Friday-to-Monday looks like three days and
          is one, unless somebody has actually decided the weekend is being
          worked. Rather than picking silently, the form shows which days
          are at stake and makes the assigner choose — and the hours move
          the moment they do, so the consequence is visible before the
          task goes anywhere.
        */}
        {span && span.weekend.length > 0 && (
          <div className="sm:col-span-2 rounded-lg border border-brand-yellow bg-brand-yellowBg p-3">
            <div className="flex items-start gap-2">
              <CalendarDays
                size={15}
                className="text-brand-yellowText mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm text-ink-800">
                  This runs across{" "}
                  <span className="font-medium">
                    {weekendLabel(span.weekend)}
                  </span>
                  .
                </p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setIncludeWeekends(false);
                      setHoursTouched(false);
                    }}
                    className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                      !includeWeekends
                        ? "bg-white border-brand-blue text-brand-blue"
                        : "bg-transparent border-ink-200 text-ink-600 hover:bg-white"
                    }`}
                  >
                    Working days only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIncludeWeekends(true);
                      setHoursTouched(false);
                    }}
                    className={`px-2.5 py-1 rounded-pill text-xs font-medium border ${
                      includeWeekends
                        ? "bg-white border-brand-blue text-brand-blue"
                        : "bg-transparent border-ink-200 text-ink-600 hover:bg-white"
                    }`}
                  >
                    Include the weekend
                  </button>
                  <span className="text-xs text-ink-600 ml-1">
                    {includeWeekends
                      ? `${span.days(true)} days · ${span.days(true) * HOURS_PER_DAY}h`
                      : `${span.days(false)} working ${
                          span.days(false) === 1 ? "day" : "days"
                        } · ${span.days(false) * HOURS_PER_DAY}h`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <label className="text-xs sm:col-span-2">
          <span className="block text-ink-700 font-medium mb-1">
            Note <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="What they need to know before starting"
            className={textareaClass("w-full")}
          />
        </label>

        {/* ---- reviewers ------------------------------------------- */}
        <div className="text-xs sm:col-span-2">
          <span className="block text-ink-700 font-medium mb-1">
            Reviewers{" "}
            <span className="text-ink-400 font-normal">
              (optional, any number)
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {chosenReviewers.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-brand-blueBg text-brand-blue text-[11px] font-medium"
              >
                {r.name}
                <button
                  onClick={() =>
                    setReviewerIds((ids) => ids.filter((x) => x !== r.id))
                  }
                  aria-label={`Remove ${r.name}`}
                  className="hover:text-brand-redText"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <SearchSelect
              value=""
              onChange={(v) =>
                setReviewerIds((ids) => (ids.includes(v) ? ids : [...ids, v]))
              }
              size="sm"
              className="w-52"
              placeholder="Add a reviewer…"
              searchPlaceholder="Search people"
              options={reviewerOptions.filter((o) => !reviewerIds.includes(o.value))}
            />
          </div>
          <p className="text-[11px] text-ink-500">
            {reviewerIds.length === 0
              ? "Nobody yet — the task will be done the moment it's submitted."
              : reviewerIds.length === 1
                ? "They approve it once it's submitted."
                : `Any one of the ${reviewerIds.length} can approve it — it doesn't wait for all of them.`}
          </p>
        </div>

        {/* ---- files ----------------------------------------------- */}
        <div className="text-xs sm:col-span-2">
          <span className="block text-ink-700 font-medium mb-1">
            Attach <span className="text-ink-400 font-normal">(optional)</span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label className="btn-ghost text-xs border border-ink-200 cursor-pointer">
              <Paperclip size={13} className="mr-1.5" />
              Choose files
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) =>
                  setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])
                }
              />
            </label>
            {files.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-ink-100 text-[11px]"
              >
                {f.name}
                <button
                  onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                  aria-label={`Remove ${f.name}`}
                  className="hover:text-brand-redText"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-brand-redText mt-3">{error}</p>}
      {/*
        The receipt.

        A one-line "Assigned." leaves the assigner wondering what actually
        went out — with what deadline, to whom, whether the files made it,
        and above all who has to approve it, which is the bit people get
        wrong. So it reads the task back. It also carries the way OUT:
        having just handed work over, the next thing you want is to see it
        on the list, and before this there was nowhere to go.
      */}
      {done && (
        <div className="mt-4 rounded-lg border border-brand-green bg-brand-greenBg p-4">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 w-5 h-5 rounded-full bg-brand-green text-white flex items-center justify-center">
              <Check size={13} strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-800">
                {done.toSelf
                  ? "Added to your own list"
                  : `Sent to ${done.who}`}
              </p>
              <p className="text-sm text-ink-700 mt-0.5 break-words">
                {done.title}
              </p>

              <ul className="text-sm text-ink-600 mt-2 grid gap-0.5">
                <li>
                  {done.due
                    ? `Due ${fmtDate(done.due)}`
                    : "No deadline set"}
                  {done.hours != null && ` · ${done.hours}h budgeted`}
                  {done.weekends && " · weekend included"}
                </li>
                <li>
                  {done.reviewers.length === 0 ? (
                    done.toSelf ? (
                      "Nobody has to approve it — submit it when it's done."
                    ) : (
                      <>
                        Nobody has to approve it —{" "}
                        {done.who.split(" ")[0]} closes it by submitting.
                      </>
                    )
                  ) : (
                    <>
                      {done.reviewers.join(", ")}{" "}
                      {done.reviewers.length > 1
                        ? "can approve it — any one of them closes it."
                        : "has to approve it."}
                    </>
                  )}
                </li>
                {done.attached > 0 && (
                  <li>
                    {done.attached} file{done.attached === 1 ? "" : "s"} attached
                  </li>
                )}
              </ul>

              {done.failed.length > 0 && (
                <p className="text-sm text-brand-redText mt-2">
                  The task went out, but {done.failed.join(", ")} didn&apos;t
                  attach. Add {done.failed.length === 1 ? "it" : "them"} from
                  the task itself.
                </p>
              )}

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <button
                  onClick={() => onOpenHistory?.(done.id)}
                  className="btn-ghost text-sm border border-ink-200 bg-white"
                >
                  See it in History <ArrowRight size={13} className="ml-1.5" />
                </button>
                <button
                  onClick={() => setDone(null)}
                  className="btn-ghost text-sm"
                >
                  Assign another
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="btn-primary disabled:opacity-50"
        >
          <Plus size={15} className="mr-1.5" />
          {busy ? "Assigning…" : "Assign task"}
        </button>
      </div>
    </div>
  );
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
