"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  ScrollText,
  UserX,
  UserCheck,
  Pencil,
  Copy,
  KeyRound,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { ROLE_LABELS, type Role } from "@/lib/role";
import {
  useAccounts,
  DEMO_DEFAULT_PASSWORD,
  type Account,
} from "@/lib/account-store";

const ROLES: Role[] = [
  "Admin",
  "Coordinator",
  "BusinessDeveloper",
  "Developer",
];

export default function UsersPage() {
  const { accounts, createAccount, updateAccount } = useAccounts();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Active" | "Deactivated"
  >("All");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  const toast = useToast();

  const visible = accounts
    .filter((a) => {
      if (statusFilter === "All") return true;
      if (statusFilter === "Active") return a.active;
      return !a.active;
    })
    .filter((a) => {
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q)
      );
    });

  function changeRole(id: string, role: Role) {
    updateAccount(id, { role });
    const a = accounts.find((x) => x.id === id);
    if (a) toast.show(`${a.name} is now ${ROLE_LABELS[role]}.`);
  }

  function toggleActive(a: Account) {
    updateAccount(a.id, { active: !a.active });
    toast.show(
      a.active
        ? `${a.name} deactivated. They can't sign in.`
        : `${a.name} reactivated.`,
      a.active ? "info" : "success",
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Users</h1>
            <p className="text-sm text-ink-500 mt-1">
              {accounts.filter((a) => a.active).length} active ·{" "}
              {accounts.filter((a) => !a.active).length} deactivated
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
              placeholder="Search by name or email…"
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
                  <th className="py-3 px-3">Last sign-in</th>
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
                        disabled={!u.active}
                        className="text-sm rounded border border-ink-200 px-2 py-1 disabled:bg-ink-50 disabled:text-ink-400"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-ink-500">
                      {u.lastLogin ?? "never"}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={u.active ? "pill-green" : "pill-grey"}
                      >
                        {u.active ? "Active" : "Deactivated"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditing(u)}
                          title="Edit name, email"
                          className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setResetting(u)}
                          title="Reset password"
                          className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                        >
                          <KeyRound size={14} />
                        </button>
                        <Link
                          href={`/audit?actor=${encodeURIComponent(u.name)}`}
                          title="View this user's audit trail"
                          className="p-1.5 rounded text-ink-400 hover:text-brand-blue hover:bg-brand-blueBg"
                        >
                          <ScrollText size={14} />
                        </Link>
                        <button
                          onClick={() => toggleActive(u)}
                          title={u.active ? "Deactivate" : "Reactivate"}
                          className={
                            u.active
                              ? "p-1.5 rounded text-ink-400 hover:text-brand-redText hover:bg-brand-redBg"
                              : "p-1.5 rounded text-ink-400 hover:text-brand-greenText hover:bg-brand-greenBg"
                          }
                        >
                          {u.active ? (
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
          onCreate={async (input) => {
            const result = await createAccount(input);
            if (!result.ok) {
              toast.show(result.error, "error");
              return;
            }
            setAddOpen(false);
            toast.show(
              `${result.account.name} added — they can now sign in with this password.`,
            );
          }}
        />
      )}

      {editing && (
        <EditUserModal
          account={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            updateAccount(editing.id, patch);
            toast.show(`${patch.name ?? editing.name}'s details updated.`);
            setEditing(null);
          }}
        />
      )}

      {resetting && (
        <ResetPasswordModal
          account={resetting}
          onClose={() => setResetting(null)}
          onReset={(newPassword) => {
            updateAccount(resetting.id, { password: newPassword });
            toast.show(
              `Password reset for ${resetting.name}. Share it with them securely.`,
            );
            setResetting(null);
          }}
        />
      )}
    </AppShell>
  );
}

function AddUserModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    email: string;
    role: Role;
    password: string;
  }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("Developer");
  const [password, setPassword] = useState(DEMO_DEFAULT_PASSWORD);
  const [copied, setCopied] = useState(false);

  function autoEmail(n: string) {
    return n.trim().toLowerCase().replace(/\s+/g, ".") + "@example.com";
  }

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Modal title="Add user" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Internal tool — the user is created directly. Share the initial
        password with them; they can change it after signing in.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Full name
      </label>
      <input
        autoFocus
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          // Auto-suggest email until user manually edits it
          if (
            !email ||
            email === autoEmail(name) ||
            email.endsWith("@example.com")
          ) {
            setEmail(autoEmail(e.target.value));
          }
        }}
        placeholder="e.g. Neha Sharma"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Email
      </label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@example.com"
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Role
      </label>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
        className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm"
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        Initial password
      </label>
      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex-1 px-3 py-2 rounded border border-ink-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <button
          type="button"
          onClick={copyPassword}
          className="btn-ghost border border-ink-200 text-xs px-3"
        >
          <Copy size={14} className="mr-1.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onCreate({
              name: name.trim() || "New User",
              email: email.trim(),
              role,
              password,
            })
          }
          disabled={!name.trim() || !email.trim() || password.length < 6}
          className="btn-primary"
        >
          Add user
        </button>
      </div>
    </Modal>
  );
}

function EditUserModal({
  account,
  onClose,
  onSave,
}: {
  account: Account;
  onClose: () => void;
  onSave: (patch: { name: string; email: string }) => void;
}) {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const dirty =
    name.trim() !== account.name || email.trim() !== account.email;

  return (
    <Modal title="Edit user" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Change the display name or sign-in email. Use the role dropdown on
        the row to change role, and the key icon to reset the password.
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
        className="w-full px-3 py-2 mb-6 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() =>
            onSave({
              name: name.trim() || account.name,
              email: email.trim() || account.email,
            })
          }
          disabled={!dirty || !name.trim() || !email.trim()}
          className="btn-primary"
        >
          Save changes
        </button>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  account,
  onClose,
  onReset,
}: {
  account: Account;
  onClose: () => void;
  onReset: (newPassword: string) => void;
}) {
  const [password, setPassword] = useState(DEMO_DEFAULT_PASSWORD);
  const [copied, setCopied] = useState(false);

  function copyPassword() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Modal title="Reset password" onClose={onClose}>
      <p className="text-sm text-ink-500 mb-5">
        Reset the password for{" "}
        <span className="font-medium text-ink-700">{account.name}</span>. They
        can change it again after signing in.
      </p>

      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        New password
      </label>
      <div className="flex gap-2 mb-6">
        <input
          autoFocus
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex-1 px-3 py-2 rounded border border-ink-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
        <button
          type="button"
          onClick={copyPassword}
          className="btn-ghost border border-ink-200 text-xs px-3"
        >
          <Copy size={14} className="mr-1.5" />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
        <button
          onClick={() => onReset(password)}
          disabled={password.length < 6}
          className="btn-primary"
        >
          Reset password
        </button>
      </div>
    </Modal>
  );
}
