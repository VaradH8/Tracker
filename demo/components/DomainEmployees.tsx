"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { ConfirmButton } from "@/components/ConfirmButton";
import { inputClass, selectClass } from "@/lib/domain-ui";
import type { EmployeeRow } from "@/lib/domain-employee";

type Account = { id: string; name: string; email: string };

const BLANK = {
  code: "",
  name: "",
  designation: "",
  department: "",
  email: "",
  phone: "",
  location: "",
  joinedOn: "",
};

/**
 * The employee register — the HR half of People.
 *
 * An employee is somebody on the payroll, which is not the same thing as an
 * account. Most of this list never signs in, so nothing here asks for a
 * password or a role; a login can be attached afterwards for the few who
 * need one.
 */
export function DomainEmployees({
  canEdit,
  accounts,
}: {
  /** Admin/Lead. A Team Lead reads the register but doesn't change it, so
   *  the controls they can't use aren't rendered — the API refuses them
   *  either way, and a button that always errors is worse than no button. */
  canEdit: boolean;
  /** Login accounts available to link, so HR can join a record to a user. */
  accounts: Account[];
}) {
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/domain/employees", { cache: "no-store" });
    if (res.ok) setRows((await res.json()).employees ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Flagged while typing rather than after submitting: the server refuses a
  // duplicate code either way, but finding out then costs the whole form.
  const typedCode = form.code.trim().toLowerCase().replace(/[\s-]+/g, "");
  const codeTaken =
    typedCode === ""
      ? null
      : (rows.find(
          (r) => r.code.trim().toLowerCase().replace(/[\s-]+/g, "") === typedCode,
        ) ?? null);

  async function add() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/domain/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't add employee.");
      return;
    }
    setForm({ ...BLANK });
    setAdding(false);
    void load();
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/domain/employees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save that.");
      return;
    }
    void load();
  }

  async function remove(id: number) {
    setError(null);
    const res = await fetch(`/api/domain/employees/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't remove that record.");
      return;
    }
    void load();
  }

  const valid = form.name.trim() !== "" && form.code.trim() !== "" && !codeTaken;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
        <div>
          <h2 className="font-heading text-lg font-semibold">Employees</h2>
          <p className="text-sm text-ink-500 mt-1">
            People on the payroll. An employee doesn&apos;t need a login — add
            one only for the people who actually sign in.
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setAdding((v) => !v)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> Add employee
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded border border-brand-red bg-brand-redBg px-3 py-2 text-sm text-brand-redText">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {adding && canEdit && (
        <div className="card p-4 mb-6 grid sm:grid-cols-2 gap-2">
          <div>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="Employee code (e.g. EMP-014)"
              className={`w-full px-3 py-2 rounded border text-sm ${
                codeTaken ? "border-brand-red" : "border-ink-200"
              }`}
            />
            {codeTaken && (
              <p className="text-xs text-brand-redText mt-1">
                {codeTaken.name} already holds {codeTaken.code}. Codes have to
                be unique — it&apos;s the handle everything else refers to.
              </p>
            )}
          </div>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
            className={inputClass()}
          />
          <input
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="Designation (optional)"
            className={inputClass()}
          />
          <input
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
            placeholder="Department (optional)"
            className={inputClass()}
          />
          <input
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email (optional)"
            className={inputClass()}
          />
          <input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Phone (optional)"
            className={inputClass()}
          />
          <input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="Location (optional)"
            className={inputClass()}
          />
          <label className="text-sm text-ink-500 flex items-center gap-2">
            <span className="whitespace-nowrap">Joined</span>
            <input
              type="date"
              value={form.joinedOn}
              onChange={(e) => setForm({ ...form, joinedOn: e.target.value })}
              className={inputClass()}
            />
          </label>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              onClick={() => {
                setAdding(false);
                setForm({ ...BLANK });
              }}
              className="btn-ghost border border-ink-200"
            >
              Cancel
            </button>
            <button
              onClick={() => void add()}
              disabled={!valid || busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save employee"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-ink-500">
          No employees on file yet.
          {canEdit ? " Use “Add employee” to file the first one." : ""}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-500 border-b border-ink-100">
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Designation</th>
                <th className="px-4 py-2 font-medium">Department</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Login</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((e) => (
                <tr key={e.id} className={e.isActive ? "" : "text-ink-400"}>
                  <td className="px-4 py-2 whitespace-nowrap">{e.code}</td>
                  <td className="px-4 py-2">
                    {e.name}
                    {!e.isActive && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-ink-100 text-ink-500">
                        inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2">{e.designation ?? "—"}</td>
                  <td className="px-4 py-2">{e.department ?? "—"}</td>
                  <td className="px-4 py-2">
                    {e.email ?? "—"}
                    {e.phone ? <span className="text-ink-500"> · {e.phone}</span> : null}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{e.joinedOn ?? "—"}</td>
                  <td className="px-4 py-2">
                    {canEdit ? (
                      <select
                        value={e.account?.id ?? ""}
                        onChange={(ev) =>
                          void patch(e.id, { userId: ev.target.value || null })
                        }
                        className={selectClass("sm")}
                        title="Link a login account to this person"
                      >
                        <option value="">No login</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (e.account?.email ?? "No login")
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => void patch(e.id, { isActive: !e.isActive })}
                        className="btn-ghost border border-ink-200 text-xs mr-1"
                      >
                        {e.isActive ? "Deactivate" : "Reactivate"}
                      </button>
                      <ConfirmButton
                        onConfirm={() => void remove(e.id)}
                        title={`Remove ${e.name}?`}
                        className="btn-ghost border border-ink-200 text-xs"
                      >
                        <Trash2 size={13} />
                      </ConfirmButton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
