"use client";

import { CheckCircle2, Database, Mail } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsTabs } from "@/components/SettingsTabs";

export default function SettingsGeneralPage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ink-500 mt-1">
            Org-wide configuration · Admin only
          </p>
        </header>

        <SettingsTabs />

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Mail size={18} className="text-brand-blue" /> SMTP
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Host" value="smtp.ses.ap-south-1.amazonaws.com" />
              <Field label="Port" value="587" />
              <Field label="User" value="AKIA..." />
              <Field label="From address" value="tracker@yourcompany.com" />
            </div>
            <button className="btn-ghost mt-4 border border-ink-200">
              Send test email
            </button>
          </section>

          <section className="card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4">
              Working schedule
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Working hours per day" value="8" />
              <Field label="Timezone" value="Asia/Kolkata" />
            </div>
          </section>

          <section className="card p-6">
            <h2 className="font-heading text-lg font-semibold mb-4 flex items-center gap-2">
              <Database size={18} className="text-brand-blue" /> Backups
            </h2>
            <ul className="text-sm space-y-2">
              <li className="flex items-center gap-2 text-ink-700">
                <CheckCircle2 size={14} className="text-brand-green" />
                Last backup:{" "}
                <span className="font-medium">2026-05-06 02:00 IST</span> · 38
                MB · S3
              </li>
              <li className="flex items-center gap-2 text-ink-700">
                <CheckCircle2 size={14} className="text-brand-green" />
                Schedule: nightly 2 AM IST · 14-day retention
              </li>
              <li className="flex items-center gap-2 text-ink-700">
                <CheckCircle2 size={14} className="text-brand-green" />
                Last restore drill: 2026-04-12
              </li>
            </ul>
          </section>

          <div className="flex gap-2">
            <button className="btn-primary">Save changes</button>
            <button className="btn-ghost">Cancel</button>
          </div>
        </div>
      </div>
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
