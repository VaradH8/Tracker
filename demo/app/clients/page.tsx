"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  Mail,
  Plus,
  ArrowRight,
  Calendar,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { CLIENTS, PROJECTS } from "@/lib/mock";
import { useToast } from "@/components/Toast";

export default function ClientsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const toast = useToast();

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-heading text-3xl font-semibold">Clients</h1>
            <p className="text-sm text-ink-500 mt-1">
              {CLIENTS.length} active clients · click into any for projects &
              contact details
            </p>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="btn-primary"
          >
            <Plus size={16} className="mr-1.5" /> Add client
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CLIENTS.map((c) => {
            const projects = PROJECTS.filter((p) => p.clientId === c.id);
            const active = projects.filter((p) => p.status === "Active").length;
            return (
              <div key={c.id} className="card p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-card bg-brand-blueBg text-brand-blue grid place-items-center">
                    <Building2 size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading text-lg font-semibold">
                      {c.name}
                    </h3>
                    <p className="text-xs text-ink-500">{c.industry}</p>
                  </div>
                  <span className="pill-grey text-[11px]">
                    Since {c.since.slice(0, 4)}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex items-center gap-2 text-ink-700">
                    <span className="text-ink-500 text-xs">Contact</span>
                    <span className="font-medium">{c.primaryContact}</span>
                  </div>
                  <a
                    href={`mailto:${c.email}`}
                    className="text-xs text-brand-blue hover:underline inline-flex items-center gap-1"
                  >
                    <Mail size={11} /> {c.email}
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-ink-50 rounded p-2 text-center">
                    <div className="font-heading text-lg font-semibold">
                      {projects.length}
                    </div>
                    <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                      Projects
                    </div>
                  </div>
                  <div className="bg-ink-50 rounded p-2 text-center">
                    <div className="font-heading text-lg font-semibold text-brand-blue">
                      {active}
                    </div>
                    <div className="text-[10px] text-ink-500 uppercase tracking-wide">
                      Active
                    </div>
                  </div>
                </div>

                <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wide mb-2">
                  Projects
                </h4>
                {projects.length === 0 ? (
                  <p className="text-xs text-ink-400 italic">
                    No projects yet for this client.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {projects.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-ink-50 text-sm group"
                        >
                          <span className="flex-1 truncate text-ink-900 group-hover:text-brand-blue">
                            {p.name}
                          </span>
                          <span className="text-xs text-ink-500 inline-flex items-center gap-1">
                            <Calendar size={11} />
                            {new Date(p.targetDate).toLocaleDateString(
                              "en-IN",
                              { day: "numeric", month: "short" },
                            )}
                          </span>
                          <ArrowRight
                            size={12}
                            className="text-ink-400 group-hover:text-brand-blue group-hover:translate-x-0.5 transition"
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {createOpen && (
        <AddClientModal
          onClose={() => setCreateOpen(false)}
          onCreate={(name) => {
            setCreateOpen(false);
            toast.show(`Client “${name}” added.`);
          }}
        />
      )}
    </AppShell>
  );
}

function AddClientModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-900/40 backdrop-blur-sm p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-heading text-lg font-semibold mb-1">Add client</h2>
        <p className="text-sm text-ink-500 mb-5">
          Register a new client to attach projects to.
        </p>

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Client name
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Reliance Industries"
          className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />

        <label className="block text-xs font-medium text-ink-700 mb-1.5">
          Industry
        </label>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. Petrochemicals"
          className="w-full px-3 py-2 mb-4 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Primary contact
            </label>
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Name"
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-700 mb-1.5">
              Contact email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@client.com"
              className="w-full px-3 py-2 rounded border border-ink-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button
            onClick={() => onCreate(name.trim() || "New client")}
            disabled={!name.trim()}
            className="btn-primary disabled:opacity-50"
          >
            Add client
          </button>
        </div>
      </div>
    </div>
  );
}
