"use client";

import { AppShell } from "@/components/AppShell";
import { useRole, ROLE_LABELS, type Role } from "@/lib/role";

const NOTIF_PREFS: Record<Role, string[]> = {
  Admin: [
    "Backup status changes",
    "User invites accepted",
    "Project health switches to At risk",
    "Weekly org summary",
  ],
  Coordinator: [
    "Tasks assigned to me",
    "Status changes on tasks I own",
    "Tasks marked Blocked by my team",
    "@mentions in remarks",
    "Daily 9 AM overdue digest",
    "Weekly Monday team summary",
  ],
  BusinessDeveloper: [
    "New project intake requests",
    "Project status changes I follow",
    "Client-facing comms scheduled",
    "@mentions in remarks",
  ],
  Developer: [
    "Tasks assigned to me",
    "Co-ordinator edits to my tasks",
    "@mentions in remarks",
    "Daily 9 AM overdue digest",
    "Tasks I'm on marked Important",
  ],
};

const PROFILE_NAME: Record<Role, { name: string; email: string }> = {
  Admin: { name: "Varad Hadawale", email: "varad@example.com" },
  Coordinator: { name: "Manasi Kulkarni", email: "manasi@example.com" },
  BusinessDeveloper: { name: "Rohit Mehra", email: "rohit@example.com" },
  Developer: { name: "Sanjana Rao", email: "sanjana@example.com" },
};

export default function ProfilePage() {
  const [role] = useRole();
  const me = PROFILE_NAME[role];
  const prefs = NOTIF_PREFS[role];

  return (
    <AppShell>
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <header>
          <h1 className="font-heading text-3xl font-semibold">Profile</h1>
          <p className="text-sm text-ink-500 mt-1">
            Signed in as <span className="font-medium">{ROLE_LABELS[role]}</span>
          </p>
        </header>

        <section className="card p-6">
          <h2 className="font-heading text-lg font-semibold mb-4">Account</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Display name" value={me.name} />
            <Field label="Email" value={me.email} />
          </div>
          <div className="mt-4 pt-4 border-t border-ink-100 flex gap-2">
            <button className="btn-primary">Save changes</button>
            <button className="btn-ghost border border-ink-200">
              Change password
            </button>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-heading text-lg font-semibold mb-1">
            Notification preferences
          </h2>
          <p className="text-sm text-ink-500 mb-4">
            Per-category in-app and email toggles · tailored to your role.
          </p>
          <div className="space-y-2">
            {prefs.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between p-3 rounded border border-ink-200"
              >
                <span className="text-sm text-ink-900">{label}</span>
                <div className="flex items-center gap-3 text-xs">
                  <label className="flex items-center gap-1.5 text-ink-700">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-brand-blue"
                    />
                    In-app
                  </label>
                  <label className="flex items-center gap-1.5 text-ink-700">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="accent-brand-blue"
                    />
                    Email
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-ink-700 mb-1.5">
        {label}
      </label>
      <input
        defaultValue={value}
        className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
      />
    </div>
  );
}
