"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, ScrollText, UserX, UserCheck, Pencil } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { RESOURCES, type Resource } from "@/lib/mock";
import { ROLE_LABELS, type Role } from "@/lib/role";

type Row = {
  id: number;
  name: string;
  email: string;
  role: Role;
  designation: string;
  lastActive: string;
  status: "Active" | "Deactivated";
  isAdmin: boolean;
};

const ROLES: Role[] = ["Admin", "Coordinator", "BusinessDeveloper", "Developer"];

function seedRows(): Row[] {
  return RESOURCES.map((r: Resource) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.primaryRole as Role,
    designation: r.designation,
    lastActive: r.lastLogin,
    status: r.status,
    isAdmin: r.isAdmin,
  }));
}

export default function UsersPage() {
  const [rows, setRows] = useState<Row[]>(seedRows);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "Deactivated"
  >("All");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const toast = useToast();

  const visible = rows
    .filter((r) => statusFilter === "All" || r.status === statusFilter)
    .filter((r) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.designation.toLowerCase().includes(q)
      );
    });

  function changeRole(id: number, role: Role) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role } : r)));
    const r = rows.find((x) => x.id === id);
    if (r) toast.show(`${r.name} is now ${ROLE_LABELS[role]}.`);
  }

  function toggleStatus(id: number) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              status: r.status === "Active" ? "Deactivated" : "Active",
            }
          : r,
      ),
    );
    const r = rows.find((x) => x.id === id);
    if (r) {
      toast.show(
        r.status === "Active"
          ? `${r.name} deactivated. History preserved.`
          : `${r.name} reactivated.`,
        r.status === "Active" ? "info" : "success",
      );
    }
  }

  function saveEdit(updated: { name: string; email: string; designation: string }) {
    if (!editing) return;
    setRows((prev) =>
      prev.map((r) => (r.id === editing.id ? { ...r, ...updated } : r)),
    );
    toast.show(`${updated.name}'s details updated.`);
    setEditing(null);
  }

  function addUser(name: string, role: Role) {
    setRows((prev) => [
      {
        id: Math.max(0, ...prev.map((r) => r.id)) + 1,
        name,
        email:
          name.toLowerCase().replace(/\s+/g, ".") + "@example.com",
        role,
        designation: ROLE_LABELS[role],
        lastActive: "never",
        status: "Active",
        isAdmin: role === "Admin",
      },
      ...prev,
    ]);
    setAddOpen(false);
    toast.show(`${name} added as ${ROLE_LABELS[role]}.`);
  }

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Users</h1>
            <p className="text-sm text-ink-500 mt-1">
              {rows.filter((r) => r.status === "Active").length} active ·{" "}
              {rows.filter((r) => r.status === "Deactivated").length}{" "}
              deactivated
            </p>
          </div>
          <button onClick={() => setAddOpen(true)} className="btn-primary">
            <Plus size={16} className="mr-1.5" /> Add user
          </button>
        </div>

        <div className="card p-3 mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, email, designation…"
              className="w-full pl-9 pr-3 py-1.5 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          {(["All", "Active", "Deactivated"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={
                statusFilter === f
                  ? "pill-blue cursor-pointer"
                  : "pill-grey cursor-pointer hover:bg-ink-200"
              }
            >
              {f}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            Icon={Search}
            title="No users match"
            message="Try a different search term or status filter."
          />
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-500 font-heading font-semibold uppercase tracking-wide border-b border-ink-200 bg-ink-50">
                  <th className="py-3 px-5">Name</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Last active</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-50"
                  >
                    <td className="py-3 px-5">
                      <div className="font-medium text-ink-900">{u.name}</div>
                      <div className="text-xs text-ink-500">{u.email}</div>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          changeRole(u.id, e.target.value as Role)
                        }
                        disabled={u.status === "Deactivated"}
                        className="text-sm rounded border border-ink-200 px-2 py-1 disabled:bg-ink-50 disabled:text-ink-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-ink-500">{u.lastActive}</td>
                    <td className="py-3 px-3">
                      <span
                        className={
                          u.status === "Active" ? "pill-green" : "pill-grey"
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditing(u)}
                          title="Edit name, email, designation"
                          className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                        >
                          <Pencil size={14} />
                        </button>
                        <Link
                          href={`/audit?actor=${encodeURIComponent(u.name)}`}
                          title="View this user's audit trail"
                          className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                        >
                          <ScrollText size={14} />
                        </Link>
                        <button
                          onClick={() => toggleStatus(u.id)}
                          title={
                            u.status === "Active"
                              ? "Deactivate"
                              : "Reactivate"
                          }
                          className={
                            u.status === "Active"
                              ? "p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
                              : "p-1.5 rounded text-ink-400 hover:text-brand-greenText hover:bg-brand-greenBg"
                          }
                        >
                          {u.status === "Active" ? (
                            <UserX size={14} />
                          ) : (
                            <UserCheck size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addOpen && (
        <AddUserModal
          onClose={() => setAddOpen(false)}
          onAdd={addUser}
        />
      )}

      {editing && (
        <EditUserModal
          row={editing}
          onClose={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
    </AppShell>
  );
}

function EditUserModal({
  row,
  onClose,
  onSave,
}: {
  row: Row;
  onClose: () => void;
  onSave: (u: { name: string; email: string; designation: string }) => void;
}) {
  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.email);
  const [designation, setDesignation] = useState(row.designation);
  const dirty =
    name.trim() !== row.name ||
    email.trim() !== row.email ||
    designation.trim() !== row.designation;

  return (
    <Modal title="Edit user" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Update the display name, email, or designation.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Full name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Designation
      </label>
      <input
        value={designation}
        onChange={(e) => setDesignation(e.target.value)}
        placeholder="e.g. Senior Developer"
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              name: name.trim() || row.name,
              email: email.trim() || row.email,
              designation: designation.trim() || row.designation,
            })
          }
          disabled={!dirty || !name.trim()}
          className="btn-primary"
        >
          Save changes
        </button>
      </div>
    </Modal>
  );
}

function AddUserModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (name: string, role: Role) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("Developer");

  return (
    <Modal title="Add user" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Internal tool — the user is created directly, no email invite.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Full name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Neha Sharma"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Role
      </label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() => onAdd(name.trim() || "New User", role)}
          disabled={!name.trim()}
          className="btn-primary"
        >
          Add user
        </button>
      </div>
    </Modal>
  );
}
