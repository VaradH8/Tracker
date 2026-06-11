"use client";

import {
  X,
  Calendar,
  Clock,
  Users,
  UserCheck,
  MessageSquare,
  History,
  Timer,
  Plus,
  Link2,
  Paperclip,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { useRef, useState } from "react";
import {
  AssigneePicker,
  DateField,
  ImportantToggle,
  PriorityPicker,
  QuickActions,
  StatusPicker,
  TimerControls,
} from "./InlineActions";
import { useTasks } from "@/lib/tasks-store";
import { useRole } from "@/lib/role";
import { useMyFirstName } from "@/lib/account-store";
import {
  loggedHoursForTask,
  parseMentions,
  activeFirstNames,
  statusPill,
  type TaskAttachment,
} from "@/lib/mock";
import { useBlockDialog } from "./BlockDialogProvider";
import { useProjects } from "@/lib/projects-store";
import { useNotifications } from "@/lib/notifications-store";

const AVATAR_COLORS = [
  "bg-brand-blue",
  "bg-brand-red",
  "bg-brand-green",
  "bg-brand-yellow",
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function TaskDrawer({
  taskId,
  onClose,
}: {
  taskId: number;
  onClose: () => void;
}) {
  const store = useTasks();
  const { projectById } = useProjects();
  const [role] = useRole();
  const me = useMyFirstName();
  const blockDialog = useBlockDialog();
  const { notify } = useNotifications();
  const [newRemark, setNewRemark] = useState("");
  const [estimateEdit, setEstimateEdit] = useState<string>("");
  const [editingEstimate, setEditingEstimate] = useState(false);
  const [depPickerOpen, setDepPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const task = store.byId(taskId);

  if (!task) return null;

  const isAssignee = task.assignees.includes(me);
  const canEdit = role === "Admin" || role === "Coordinator";
  const canLogTime = isAssignee || canEdit;
  const project = projectById(task.projectId);
  // Sign-off is the Person Responsible (assigner), the project Lead, or
  // a Coordinator/Admin. Doers can't approve their own work.
  const canApprove =
    canEdit ||
    me === task.responsible ||
    (project?.lead != null && me === project.lead);
  const entries = store.entriesForTask(task.id);
  const totalLogged = loggedHoursForTask(task.id, store.timeEntries);
  const taskAudit = store.auditLog.filter((a) => a.taskTitle === task.title);

  function reassign(name: string) {
    if (!task) return;
    const wasAssigned = task.assignees.includes(name);
    store.toggleAssignee(task.id, name);
    if (wasAssigned) return;
    if (name !== me) {
      notify({
        recipient: name,
        kind: "assigned",
        title: "Assigned to a task",
        body: task.title,
        taskId: task.id,
      });
    }
    if (name === me && task.responsible && task.responsible !== me) {
      notify({
        recipient: task.responsible,
        kind: "assigned",
        title: `${me} self-assigned to a task`,
        body: task.title,
        taskId: task.id,
      });
    }
  }

  function postRemark() {
    if (!task) return;
    const body = newRemark.trim();
    if (!body) return;
    store.addRemark(task.id, me, body);
    // Fire @-mention notifications. Skip mentioning yourself.
    const mentioned = parseMentions(body, activeFirstNames());
    for (const recipient of mentioned) {
      if (recipient === me) continue;
      notify({
        recipient,
        kind: "mention",
        title: `${me} mentioned you`,
        body: body.length > 140 ? body.slice(0, 140) + "…" : body,
        taskId: task.id,
      });
    }
    setNewRemark("");
  }

  function saveEstimate() {
    if (!task) return;
    const v = estimateEdit.trim();
    const n = v === "" ? null : Number(v);
    const valid = n === null || (Number.isFinite(n) && n >= 0);
    if (valid && n !== task.estimatedHours) {
      store.setEstimatedHours(task.id, n);
    }
    setEditingEstimate(false);
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !task) return;
    store.addAttachment(task.id, {
      name: file.name,
      size: formatBytes(file.size),
      uploadedBy: me,
      kind: kindFromName(file.name),
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div
        className="flex-1 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <aside className="w-full max-w-[480px] bg-white shadow-2xl flex flex-col h-full overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-200 flex items-center gap-3">
          <PriorityPicker
            value={task.priority}
            onChange={(p) => store.setPriority(task.id, p)}
            readOnly={!canEdit}
          />
          {project && (
            <span
              className="pill-grey truncate max-w-[180px]"
              title={project.name}
            >
              {project.name}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ImportantToggle
              value={task.important}
              onChange={() => store.toggleImportant(task.id)}
              readOnly={!canEdit}
            />
            {canEdit && (
              <button
                onClick={async () => {
                  if (
                    !confirm(
                      `Delete "${task.title}"? Remarks, time logs, attachments, and dependencies on this task go with it. There's no undo.`,
                    )
                  )
                    return;
                  const r = await store.deleteTask(task.id);
                  if (r.ok) onClose();
                }}
                className="p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
                aria-label="Delete task"
                title="Delete task"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-ink-100"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <h2 className="font-heading text-lg font-semibold leading-tight">
            {task.title}
          </h2>

          {(canEdit || isAssignee) && (
            <div className="flex items-center justify-between gap-2 p-3 rounded-card bg-ink-50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-500">Status</span>
                <StatusPicker
                  value={task.status}
                  onChange={(s) => store.setStatus(task.id, s)}
                  onBlock={() => blockDialog.requestBlock(task.id)}
                />
              </div>
              <QuickActions
                task={task}
                isAssignee={isAssignee}
                canEdit={canEdit}
                onStatus={(s) => store.setStatus(task.id, s)}
                onBlock={() => blockDialog.requestBlock(task.id)}
              />
            </div>
          )}

          {task.status === "Done" && (
            <div
              className={`p-3 rounded-card border text-sm flex items-center gap-2 flex-wrap ${
                task.approvedBy
                  ? "bg-brand-greenBg border-brand-green/30"
                  : "bg-brand-yellowBg border-brand-yellowBorder"
              }`}
            >
              {task.approvedBy ? (
                <>
                  <CheckCircle2
                    size={16}
                    className="text-brand-green shrink-0"
                  />
                  <span className="text-ink-900">
                    Approved by{" "}
                    <strong>{task.approvedBy}</strong>
                    {task.approvedAt && (
                      <span className="text-ink-500">
                        {" "}
                        · {task.approvedAt}
                      </span>
                    )}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => store.unapproveTask(task.id)}
                      className="ml-auto text-xs text-ink-500 hover:text-brand-redText"
                    >
                      Revoke
                    </button>
                  )}
                </>
              ) : (
                <>
                  <ShieldCheck
                    size={16}
                    className="text-brand-yellowText shrink-0"
                  />
                  <span className="text-ink-700 flex-1 min-w-0">
                    Done — needs sign-off from{" "}
                    {project?.lead ?? "Lead"}
                    {task.responsible && task.responsible !== project?.lead
                      ? `, ${task.responsible},`
                      : ""}{" "}
                    or a Co-ordinator.
                  </span>
                  {canApprove && (
                    <button
                      onClick={() => store.approveTask(task.id, me)}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      Approve
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {canEdit && (
            <Field label="Description">
              <textarea
                defaultValue={task.description ?? ""}
                onBlur={(e) => {
                  if (e.target.value !== (task.description ?? "")) {
                    store.setDescription(task.id, e.target.value);
                  }
                }}
                placeholder="What needs to be done?"
                rows={3}
                className="w-full px-3 py-2 rounded border border-ink-200 text-sm"
              />
            </Field>
          )}

          {!canEdit && task.description && (
            <Field label="Description">
              <p className="text-sm text-ink-700 leading-relaxed">
                {task.description}
              </p>
            </Field>
          )}

          <Field
            label="Person Responsible"
            icon={<UserCheck size={14} />}
            hint="The person who assigned this task"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-blue text-white grid place-items-center text-[10px] font-heading font-medium shrink-0">
                {(task.responsible ?? "?")[0]}
              </div>
              <span className="text-sm text-ink-900 font-medium">
                {task.responsible ?? "Unassigned"}
              </span>
            </div>
          </Field>

          <Field
            label="Person Accountable"
            icon={<Users size={14} />}
            hint="The person(s) doing the work"
          >
            <div className="flex items-center gap-2">
              <AssigneePicker
                selected={task.assignees}
                onToggle={reassign}
                readOnly={!canEdit}
              />
              <span className="text-xs text-ink-500">
                {task.assignees.join(", ") || "Unassigned"}
              </span>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Target date" icon={<Calendar size={14} />}>
              <DateField
                value={task.targetDate}
                onChange={(d) => store.setTargetDate(task.id, d)}
                readOnly={!canEdit}
                label="Target date"
              />
            </Field>
            <Field label="Estimated" icon={<Clock size={14} />}>
              {canEdit ? (
                editingEstimate ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      autoFocus
                      value={estimateEdit}
                      onChange={(e) => setEstimateEdit(e.target.value)}
                      onBlur={saveEstimate}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEstimate();
                        if (e.key === "Escape") setEditingEstimate(false);
                      }}
                      placeholder="hrs"
                      className="w-20 px-2 py-1 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    <span className="text-xs text-ink-400">hrs</span>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEstimateEdit(
                        task.estimatedHours != null
                          ? String(task.estimatedHours)
                          : "",
                      );
                      setEditingEstimate(true);
                    }}
                    className="text-sm text-ink-700 hover:text-brand-blue text-left"
                  >
                    {task.estimatedHours != null
                      ? `${task.estimatedHours} hrs`
                      : "+ Set estimate"}
                  </button>
                )
              ) : (
                <span className="text-sm text-ink-700">
                  {task.estimatedHours != null
                    ? `${task.estimatedHours} hrs`
                    : "—"}
                </span>
              )}
            </Field>
          </div>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide flex items-center gap-2">
                <Link2 size={12} /> Blocked by
                <span className="font-medium normal-case text-ink-400">
                  ({task.dependsOn?.length ?? 0})
                </span>
              </h3>
              {canEdit && !depPickerOpen && (
                <button
                  onClick={() => setDepPickerOpen(true)}
                  className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={12} /> Add
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {(task.dependsOn ?? []).map((depId) => {
                const dep = store.byId(depId);
                if (!dep) return null;
                return (
                  <li
                    key={depId}
                    className="flex items-center gap-2 text-sm py-1.5 px-2 rounded border border-ink-200"
                  >
                    <span className={statusPill(dep.status)}>{dep.status}</span>
                    <span
                      className={`flex-1 truncate ${
                        dep.status === "Done"
                          ? "line-through text-ink-400"
                          : "text-ink-900"
                      }`}
                      title={dep.title}
                    >
                      {dep.title}
                    </span>
                    {canEdit && (
                      <button
                        onClick={() => store.toggleDependency(task.id, depId)}
                        className="text-ink-400 hover:text-brand-redText"
                        aria-label="Remove dependency"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
              {(task.dependsOn ?? []).length === 0 && !depPickerOpen && (
                <li className="text-xs text-ink-400 italic">
                  No dependencies — this task can move on its own.
                </li>
              )}
            </ul>
            {depPickerOpen && (
              <div className="mt-2 flex items-center gap-2">
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) {
                      store.toggleDependency(task.id, id);
                      setDepPickerOpen(false);
                    }
                  }}
                  className="flex-1 px-2 py-1.5 rounded border border-ink-200 text-sm"
                >
                  <option value="">Choose a task to depend on…</option>
                  {store
                    .forProject(task.projectId)
                    .filter(
                      (t) =>
                        t.id !== task.id &&
                        !(task.dependsOn ?? []).includes(t.id),
                    )
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => setDepPickerOpen(false)}
                  className="text-xs text-ink-500 hover:text-ink-900 px-1"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide flex items-center gap-2">
                <Paperclip size={12} /> Attachments
                <span className="font-medium normal-case text-ink-400">
                  ({task.attachments?.length ?? 0})
                </span>
              </h3>
              {canEdit && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
                >
                  <Upload size={12} /> Upload
                </button>
              )}
            </div>
            <ul className="space-y-1.5">
              {(task.attachments ?? []).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 text-sm py-1.5 px-2 rounded border border-ink-200"
                >
                  <FileText size={14} className="text-ink-400 shrink-0" />
                  <span
                    className="flex-1 truncate text-ink-900"
                    title={a.name}
                  >
                    {a.name}
                  </span>
                  <span className="text-xs text-ink-400 shrink-0">
                    {a.size}
                  </span>
                  <span className="text-xs text-ink-400 shrink-0 hidden sm:inline">
                    {a.uploadedBy} · {a.when}
                  </span>
                  {canEdit && (
                    <button
                      onClick={() => store.removeAttachment(task.id, a.id)}
                      className="text-ink-400 hover:text-brand-redText"
                      aria-label="Remove attachment"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </li>
              ))}
              {(task.attachments ?? []).length === 0 && (
                <li className="text-xs text-ink-400 italic">
                  No attachments yet.
                </li>
              )}
            </ul>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileChosen}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide flex items-center gap-2">
                <Timer size={12} /> Time
                <span className="font-medium normal-case text-ink-400">
                  {totalLogged.toFixed(1)}h logged
                  {task.estimatedHours != null &&
                    ` of ${task.estimatedHours}h est.`}
                </span>
              </h3>
            </div>

            {canLogTime && (
              <div className="mb-3">
                <TimerControls
                  task={task}
                  canRun={canLogTime}
                  loggedHours={totalLogged}
                  active={store.activeTimer}
                  size="md"
                  onStart={() => void store.startTimer(task.id)}
                  onStop={() => void store.stopTimer(task.id)}
                  onDone={() => void store.doneTimer(task.id)}
                />
              </div>
            )}

            {task.estimatedHours != null && task.estimatedHours > 0 && (
              <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-3">
                <div
                  className={
                    totalLogged > task.estimatedHours
                      ? "h-full bg-brand-red"
                      : "h-full bg-brand-blue"
                  }
                  style={{
                    width: `${Math.min(
                      100,
                      (totalLogged / task.estimatedHours) * 100,
                    )}%`,
                  }}
                />
              </div>
            )}

            <ul className="space-y-1.5 mb-1">
              {entries.map((e) => {
                const canDeleteEntry = canEdit || e.person === me;
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-2 text-sm py-1 group"
                  >
                    <span className="w-12 shrink-0 font-heading font-medium text-ink-900">
                      {e.hours}h
                    </span>
                    <span className="text-ink-700">{e.person}</span>
                    {e.note && (
                      <span className="text-ink-400 truncate">· {e.note}</span>
                    )}
                    <span className="ml-auto text-xs text-ink-400 shrink-0">
                      {e.date}
                    </span>
                    {canDeleteEntry && (
                      <button
                        onClick={() => {
                          if (confirm(`Remove ${e.hours}h logged on ${e.date}?`)) {
                            void store.deleteTimeEntry(e.id);
                          }
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1 text-ink-400 hover:text-brand-redText"
                        aria-label="Delete time entry"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
              {entries.length === 0 && (
                <li className="text-xs text-ink-400 italic">
                  No time logged yet.
                </li>
              )}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2 flex items-center gap-2">
              <MessageSquare size={12} /> Remarks
              <span className="font-medium normal-case text-ink-400">
                ({task.remarks?.length ?? 0})
              </span>
            </h3>
            <ul className="space-y-3 mb-3">
              {(task.remarks ?? []).map((r) => {
                const idx = (task.remarks ?? []).indexOf(r);
                const canDeleteRemark = canEdit || r.author === me;
                return (
                  <li key={r.id} className="flex gap-2.5 text-sm group">
                    <div
                      className={`w-7 h-7 rounded-full text-white grid place-items-center text-[10px] font-heading font-medium shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}
                    >
                      {initials(r.author)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-ink-900">
                          {r.author}
                        </span>
                        <span className="text-xs text-ink-400">{r.when}</span>
                        {canDeleteRemark && (
                          <button
                            onClick={() => {
                              if (confirm("Delete this remark?")) {
                                void store.deleteRemark(task.id, r.id);
                              }
                            }}
                            className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1 text-ink-400 hover:text-brand-redText"
                            aria-label="Delete remark"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <p className="text-ink-700">{r.body}</p>
                    </div>
                  </li>
                );
              })}
              {(task.remarks ?? []).length === 0 && (
                <li className="text-xs text-ink-400 italic">
                  No remarks yet.
                </li>
              )}
            </ul>
            {(canEdit || isAssignee) && (
              <div className="border border-ink-200 rounded-card p-2">
                <textarea
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  rows={2}
                  placeholder="Add a remark…  (use @ to mention)"
                  className="w-full text-sm focus:outline-none resize-none"
                />
                <div className="flex justify-end pt-1.5 border-t border-ink-100 mt-1.5">
                  <button
                    onClick={postRemark}
                    disabled={!newRemark.trim()}
                    className="btn-primary text-xs py-1 px-3"
                  >
                    Post
                  </button>
                </div>
              </div>
            )}
          </section>

          <details>
            <summary className="text-xs font-semibold text-ink-700 uppercase tracking-wide cursor-pointer flex items-center gap-2">
              <History size={12} /> Audit timeline
              <span className="font-medium normal-case text-ink-400">
                ({taskAudit.length})
              </span>
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs text-ink-500 pl-5">
              {taskAudit.length === 0 ? (
                <li className="italic">No tracked changes yet.</li>
              ) : (
                taskAudit.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium text-ink-900">
                      {a.actor}
                    </span>{" "}
                    {auditVerb(a.action)}
                    {a.before && a.after && (
                      <span className="text-ink-400">
                        {" "}
                        · {a.before} → {a.after}
                      </span>
                    )}{" "}
                    · {a.when}
                  </li>
                ))
              )}
            </ul>
          </details>
        </div>
      </aside>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function kindFromName(name: string): TaskAttachment["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext))
    return "image";
  if (["doc", "docx", "txt", "md"].includes(ext)) return "doc";
  if (["xls", "xlsx", "csv"].includes(ext)) return "sheet";
  return "other";
}

function auditVerb(action: string): string {
  switch (action) {
    case "task.status_change":
      return "changed status";
    case "task.mark_important":
      return "marked Important";
    case "task.reassign":
      return "reassigned";
    case "task.responsible_change":
      return "changed who's responsible";
    case "task.create":
      return "created task";
    case "task.approve":
      return "approved";
    default:
      return action;
  }
}

function Field({
  label,
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-700 uppercase tracking-wide mb-1">
        {icon}
        {label}
      </label>
      {hint && <p className="text-[11px] text-ink-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}
