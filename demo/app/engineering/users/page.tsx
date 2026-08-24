"use client";

import { useEffect, useState } from "react";
import { KeyRound, Plus, Settings2, Trash2, X } from "lucide-react";
import {
  DOMAIN_ROLES,
  DOMAIN_ROLE_LABELS,
  manageableRoles,
  type DomainRole,
} from "@/lib/domain";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useDomain } from "@/lib/domain-store";
import { DomainPage, PageHeader } from "@/components/DomainPage";
import { DomainEmployees } from "@/components/DomainEmployees";
import { inputClass, selectClass } from "@/lib/domain-ui";

type DUser = {
  id: string;
  name: string;
  email: string;
  role: DomainRole;
  isActive: boolean;
};

export default function DomainUsersPage() {
  const { current } = useDomain();
  const [users, setUsers] = useState<DUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Actionee" as DomainRole,
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * What this viewer may do here. A Team Lead manages the people they
   * supervise but neither adds nor removes accounts, so the controls they
   * cannot use are not shown at all — the API refuses them either way, and
   * a button that always errors is worse than no button.
   */
  const role = current?.role;
  const canAddOrRemove = role === "Admin" || role === "Lead";
  /**
   * Derived from the same rule the API enforces rather than restated here.
   * A second copy of this ladder is precisely how a Team Lead once ended
   * up unable to reach a view the server was happy to serve them.
   */
  const manageable: DomainRole[] = role ? manageableRoles(role) : [];
  const canManage = (u: DUser) => u.id !== current?.id && manageable.includes(u.role);

  /**
   * Whoever already answers to the name being typed. Checked against the
   * list already on screen, so no extra request — the server enforces the
   * same rule, this just says so before the form is filled in.
   */
  const typed = form.name.trim().toLowerCase();
  const nameTaken =
    typed === "" ? null : (users.find((u) => u.name.trim().toLowerCase() === typed) ?? null);

  async function load() {
    const res = await fetch("/api/domain/users", { cache: "no-store" });
    if (res.ok) setUsers((await res.json()).users ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function addUser() {
    setError(null);
    const res = await fetch("/api/domain/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't add user.");
      return;
    }
    setForm({ name: "", email: "", password: "", role: "Actionee" });
    setAdding(false);
    void load();
  }

  return (
    <DomainPage width="wide">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">People</h1>
          <p className="text-sm text-ink-500 mt-1">
            {canAddOrRemove
              ? "Employees on the payroll, and the login accounts for those who sign in."
              : "Manage the people you supervise."}
          </p>
        </div>
        {canAddOrRemove && (
          <button onClick={() => setAdding((v) => !v)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> Add login account
          </button>
        )}
      </div>

      {adding && (
        <div className="card p-4 mb-6 grid sm:grid-cols-2 gap-2">
          <div>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Full name"
              className={`w-full px-3 py-2 rounded border text-sm ${
                nameTaken ? "border-brand-red" : "border-ink-200"
              }`}
            />
            {/* Flagged while typing, not after submitting: the server
                refuses the duplicate either way, but finding out at that
                point means re-entering the whole form. */}
            {nameTaken && (
              <p className="text-xs text-brand-redText mt-1">
                {nameTaken.name} already has an account ({nameTaken.email}).
                Names have to be unique — otherwise the two are
                indistinguishable when assigning work.
              </p>
            )}
          </div>
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
          <input
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="Temp password (10+ chars, letter + digit)"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as DomainRole })}
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          >
            {DOMAIN_ROLES.map((r) => (
              <option key={r} value={r}>
                {DOMAIN_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {error && (
            <p className="text-xs text-brand-redText sm:col-span-2">{error}</p>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={addUser}
              disabled={
                !form.name.trim() ||
                !form.email.trim() ||
                !form.password ||
                nameTaken !== null
              }
              className="btn-primary"
            >
              Add user
            </button>
          </div>
        </div>
      )}

      {notice && (
        <p className="text-xs text-brand-greenText mb-2">{notice}</p>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Name</th>
              <th className="text-left font-semibold px-4 py-2">Role</th>
              <th className="text-left font-semibold px-4 py-2">Status</th>
              <th className="text-right font-semibold px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <ManageRow
                key={u.id}
                u={u}
                open={managing === u.id}
                onToggle={() => setManaging((m) => (m === u.id ? null : u.id))}
                canManage={canManage(u)}
                canDelete={canAddOrRemove && canManage(u)}
                grantableRoles={manageable}
                onChanged={(msg) => {
                  setNotice(msg ?? null);
                  void load();
                }}
                onDeleted={(msg) => {
                  setManaging(null);
                  setNotice(msg);
                  void load();
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <DomainEmployees
        canEdit={canAddOrRemove}
        accounts={users.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
      />
    </DomainPage>
  );
}

/**
 * One person, with everything you can do to them behind a single Manage
 * button.
 *
 * The controls used to sit loose in the row — a role dropdown, a status
 * pill, a key icon, a bin icon — which made a destructive action a
 * mis-click away from a routine one, and left no room to say what each
 * did. Collapsed into one panel, each action is labelled and the
 * irreversible one is last and behind a confirm.
 */
function ManageRow({
  u,
  open,
  onToggle,
  canManage,
  canDelete,
  grantableRoles,
  onChanged,
  onDeleted,
}: {
  u: DUser;
  open: boolean;
  onToggle: () => void;
  canManage: boolean;
  canDelete: boolean;
  grantableRoles: DomainRole[];
  onChanged: (message?: string) => void;
  onDeleted: (message: string) => void;
}) {
  const [name, setName] = useState(u.name);
  const [email, setEmail] = useState(u.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Re-seed when the row's data changes underneath an open panel.
  useEffect(() => {
    setName(u.name);
    setEmail(u.email);
  }, [u.name, u.email]);

  async function patch(body: Record<string, unknown>, what: string, done: string) {
    setError(null);
    setBusy(what);
    const res = await fetch(`/api/domain/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    onChanged(done);
  }

  async function setNewPassword() {
    setError(null);
    setBusy("password");
    const res = await fetch(`/api/domain/users/${u.id}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't set that password.");
      return;
    }
    setPassword("");
    onChanged(
      `Password set for ${u.name}.` +
        (body.signedOut > 0
          ? ` They were signed out on ${body.signedOut} device${body.signedOut === 1 ? "" : "s"}.`
          : ""),
    );
  }

  /**
   * One button for "they cannot sign in".
   *
   * Every cause but a wrong password reports itself as "Wrong email or
   * password", so an admin cannot tell which one they have and resets the
   * password over and over. This clears all of them at once — the stored
   * address, the deactivation, the throttle, and the password if one is
   * typed — and says what it actually changed.
   */
  async function fixSignIn() {
    setError(null);
    setBusy("fix");
    const res = await fetch(`/api/domain/users/${u.id}/fix-signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(password ? { password } : {}),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setError(body.error ?? "Couldn't fix that.");
      return;
    }
    setPassword("");
    const did = (body.changed ?? []).join(", ");
    onChanged(
      `${body.name} can sign in with ${body.email} — ${did}.` +
        ((body.warnings ?? []).length > 0 ? ` ${body.warnings.join(" ")}` : ""),
    );
  }

  async function remove() {
    setError(null);
    setBusy("delete");
    const res = await fetch(`/api/domain/users/${u.id}`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't delete.");
      return;
    }
    onDeleted(`${u.name} was removed.`);
  }

  return (
    <>
      <tr className={u.isActive ? "" : "opacity-50"}>
        <td className="px-4 py-2">
          <div className="font-medium text-ink-900">{u.name}</div>
          <div className="text-xs text-ink-500">{u.email}</div>
        </td>
        <td className="px-4 py-2 text-ink-700">{DOMAIN_ROLE_LABELS[u.role]}</td>
        <td className="px-4 py-2">
          <span
            className={`text-xs px-2 py-1 rounded-pill font-medium ${
              u.isActive
                ? "bg-brand-greenBg text-brand-greenText"
                : "bg-ink-100 text-ink-500"
            }`}
          >
            {u.isActive ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-4 py-2 text-right">
          {canManage ? (
            <button
              onClick={onToggle}
              aria-expanded={open}
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border ${
                open
                  ? "bg-brand-blueBg text-brand-blue border-brand-blue"
                  : "text-ink-600 border-ink-200 hover:bg-ink-50"
              }`}
            >
              {open ? <X size={13} /> : <Settings2 size={13} />}
              {open ? "Close" : "Manage"}
            </button>
          ) : (
            <span className="text-xs text-ink-300">—</span>
          )}
        </td>
      </tr>

      {open && canManage && (
        <tr>
          <td colSpan={4} className="px-4 py-4 bg-ink-50">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name">
                <div className="flex gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass("sm", "flex-1")}
                  />
                  <button
                    onClick={() => patch({ name: name.trim() }, "name", `Renamed to ${name.trim()}.`)}
                    disabled={busy !== null || !name.trim() || name === u.name}
                    className="btn-ghost text-xs disabled:opacity-40"
                  >
                    {busy === "name" ? "…" : "Save"}
                  </button>
                </div>
              </Field>

              <Field label="Sign-in email">
                <div className="flex gap-2">
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass("sm", "flex-1")}
                  />
                  <button
                    onClick={() => patch({ email: email.trim() }, "email", "Email updated.")}
                    disabled={busy !== null || !email.trim() || email === u.email}
                    className="btn-ghost text-xs disabled:opacity-40"
                  >
                    {busy === "email" ? "…" : "Save"}
                  </button>
                </div>
              </Field>

              <Field label="Role">
                <select
                  value={u.role}
                  onChange={(e) => patch({ role: e.target.value }, "role", "Role updated.")}
                  disabled={busy !== null}
                  className={selectClass("sm", "w-full")}
                >
                  {/* Only the roles this viewer may actually hand out. */}
                  {grantableRoles.map((r) => (
                    <option key={r} value={r}>
                      {DOMAIN_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Status">
                <button
                  onClick={() =>
                    patch(
                      { isActive: !u.isActive },
                      "status",
                      u.isActive ? `${u.name} deactivated.` : `${u.name} reactivated.`,
                    )
                  }
                  disabled={busy !== null}
                  className="btn-ghost text-xs"
                >
                  {u.isActive ? "Deactivate" : "Reactivate"}
                </button>
                <p className="text-[11px] text-ink-400 mt-1">
                  Deactivating removes them from every picker and signs them out.
                </p>
              </Field>

              <Field label="Set a new password">
                <div className="flex gap-2">
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && password) void setNewPassword();
                    }}
                    placeholder="New password"
                    className={inputClass("sm", "flex-1")}
                  />
                  <button
                    onClick={setNewPassword}
                    disabled={busy !== null || !password}
                    className="btn-ghost text-xs disabled:opacity-40"
                  >
                    {busy === "password" ? "…" : "Set"}
                  </button>
                </div>
                <p className="text-[11px] text-ink-400 mt-1">
                  Signs them out everywhere. Read it back to them — it is not
                  shown again.
                </p>
              </Field>

              <Field label="They can't sign in">
                <button
                  onClick={fixSignIn}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border border-brand-blue text-brand-blue hover:bg-brand-blueBg disabled:opacity-40"
                >
                  <KeyRound size={13} />
                  {busy === "fix" ? "Fixing…" : "Fix their sign-in"}
                </button>
                <p className="text-[11px] text-ink-400 mt-1">
                  Tidies their address, switches the account back on, and
                  clears the login lockout. Type a password above first and it
                  sets that too. Use this when a reset alone hasn&apos;t worked.
                </p>
              </Field>

              {canDelete && (
                <Field label="Remove from the module">
                  <ConfirmButton
                    onConfirm={remove}
                    title={`Delete ${u.name}`}
                    confirmLabel="Delete for good?"
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded border border-brand-red text-brand-redText hover:bg-brand-redBg"
                  >
                    <Trash2 size={13} /> Delete
                  </ConfirmButton>
                  <p className="text-[11px] text-ink-400 mt-1">
                    Refused if they own projects or have assigned work —
                    deactivate instead, which keeps the history.
                  </p>
                </Field>
              )}
            </div>

            {error && (
              <p className="text-xs text-brand-redText mt-3">{error}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs font-medium text-ink-700 mb-1">{label}</span>
      {children}
    </div>
  );
}
