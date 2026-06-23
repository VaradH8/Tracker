"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import {
  DOMAIN_ROLES,
  DOMAIN_ROLE_LABELS,
  type DomainRole,
} from "@/lib/domain";

type DUser = {
  id: string;
  name: string;
  email: string;
  role: DomainRole;
  dailyCapacity: number;
  isActive: boolean;
};

export default function DomainUsersPage() {
  const [users, setUsers] = useState<DUser[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "Actionee" as DomainRole,
    dailyCapacity: "8",
  });
  const [error, setError] = useState<string | null>(null);

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
      body: JSON.stringify({
        ...form,
        dailyCapacity: Number(form.dailyCapacity),
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Couldn't add user.");
      return;
    }
    setForm({ name: "", email: "", password: "", role: "Actionee", dailyCapacity: "8" });
    setAdding(false);
    void load();
  }

  async function patch(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/domain/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) void load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-semibold">People</h1>
          <p className="text-sm text-ink-500 mt-1">
            Add domain users and set their role and daily capacity.
          </p>
        </div>
        <button onClick={() => setAdding((v) => !v)} className="btn-primary">
          <Plus size={16} className="mr-1.5" /> Add user
        </button>
      </div>

      {adding && (
        <div className="card p-4 mb-6 grid sm:grid-cols-2 gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Full name"
            className="px-3 py-2 rounded border border-ink-200 text-sm"
          />
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
          <div className="grid grid-cols-2 gap-2">
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
            <input
              type="number"
              min="1"
              max="14"
              value={form.dailyCapacity}
              onChange={(e) => setForm({ ...form, dailyCapacity: e.target.value })}
              placeholder="Capacity h/day"
              className="px-3 py-2 rounded border border-ink-200 text-sm"
            />
          </div>
          {error && (
            <p className="text-xs text-brand-redText sm:col-span-2">{error}</p>
          )}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={addUser}
              disabled={!form.name.trim() || !form.email.trim() || !form.password}
              className="btn-primary"
            >
              Add user
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 text-ink-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left font-semibold px-4 py-2">Name</th>
              <th className="text-left font-semibold px-4 py-2">Role</th>
              <th className="text-left font-semibold px-4 py-2">Capacity</th>
              <th className="text-left font-semibold px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "opacity-50"}>
                <td className="px-4 py-2">
                  <div className="font-medium text-ink-900">{u.name}</div>
                  <div className="text-xs text-ink-500">{u.email}</div>
                </td>
                <td className="px-4 py-2">
                  <select
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="text-xs rounded border border-ink-200 px-2 py-1 bg-white"
                  >
                    {DOMAIN_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {DOMAIN_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    min="1"
                    max="14"
                    defaultValue={u.dailyCapacity}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== u.dailyCapacity) patch(u.id, { dailyCapacity: v });
                    }}
                    className="w-16 text-xs rounded border border-ink-200 px-2 py-1"
                  />
                  <span className="text-xs text-ink-400 ml-1">h/day</span>
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => patch(u.id, { isActive: !u.isActive })}
                    className={`text-xs px-2 py-1 rounded-pill font-medium ${
                      u.isActive
                        ? "bg-brand-greenBg text-brand-greenText"
                        : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {u.isActive ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}