"use client";

import { useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { TopNav } from "@/components/TopNav";

type Step = "upload" | "preview" | "done";

const UNMATCHED = [
  { raw: "ADHIL", suggestion: "Adil Khan" },
  { raw: "Sanjay J.", suggestion: null },
  { raw: "Abhishek& Kiran", suggestion: "Abhishek Singh / Kiran Patil (split)" },
  { raw: "Manasi K", suggestion: "Manasi Kulkarni" },
];

export default function AdminImportPage() {
  const [step, setStep] = useState<Step>("upload");

  return (
    <>
      <TopNav />
      <main className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-2xl font-semibold">Import xlsx</h1>
          <p className="text-sm text-ink-500 mt-1">
            Upload <code>Ongoing_Projects.xlsx</code>, reconcile names, confirm.
            Atomic — nothing persists until you click confirm.
          </p>
        </header>

        <Stepper step={step} />

        {step === "upload" && <UploadStep onNext={() => setStep("preview")} />}
        {step === "preview" && (
          <PreviewStep
            onBack={() => setStep("upload")}
            onConfirm={() => setStep("done")}
          />
        )}
        {step === "done" && <DoneStep onAgain={() => setStep("upload")} />}
      </main>
    </>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = [
    { id: "upload", label: "Upload" },
    { id: "preview", label: "Preview & Reconcile" },
    { id: "done", label: "Confirm" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full grid place-items-center text-xs font-heading font-medium ${
              i <= idx
                ? "bg-brand-blue text-white"
                : "bg-ink-100 text-ink-500"
            }`}
          >
            {i < idx ? <CheckCircle2 size={14} /> : i + 1}
          </div>
          <span
            className={`text-sm ${i === idx ? "font-medium text-ink-900" : "text-ink-500"}`}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight size={14} className="text-ink-400 mx-1" />
          )}
        </li>
      ))}
    </ol>
  );
}

function UploadStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="card p-6">
      <div className="border-2 border-dashed border-ink-200 rounded-card p-12 text-center bg-ink-50">
        <UploadCloud size={40} className="mx-auto text-brand-blue mb-3" />
        <p className="text-base font-medium text-ink-900 mb-1">
          Drop <code>Ongoing_Projects.xlsx</code> here
        </p>
        <p className="text-sm text-ink-500 mb-4">
          Or click to browse · max 25 MB
        </p>
        <button onClick={onNext} className="btn-primary">
          <FileSpreadsheet size={16} className="mr-1.5" /> Use sample file
        </button>
      </div>

      <div className="mt-6 p-4 bg-brand-blueBg rounded-card text-sm text-ink-700">
        <p className="font-medium mb-1">What will happen:</p>
        <ul className="list-disc list-inside space-y-0.5 text-ink-700">
          <li>System parses each sheet as a Team</li>
          <li>Each row becomes a Task; assignees are matched to existing users</li>
          <li>Unmatched names go to a reconciliation queue (next step)</li>
          <li>Nothing is written until you click Confirm</li>
        </ul>
      </div>
    </div>
  );
}

function PreviewStep({
  onBack,
  onConfirm,
}: {
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DryRunStat label="Teams" value={4} note="all new" />
        <DryRunStat label="Projects" value={7} note="all new" />
        <DryRunStat label="Tasks" value={42} note="39 valid · 3 warnings" />
        <DryRunStat label="Names to map" value={4} note="reconcile below" tone="warn" />
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} className="text-brand-yellow" />
          <h2 className="font-heading text-lg font-semibold">
            Reconcile unmatched names
          </h2>
        </div>
        <p className="text-sm text-ink-500 mb-4">
          The xlsx referenced these names. Map each to an existing user, create
          a new user, or skip.
        </p>

        <div className="space-y-2">
          {UNMATCHED.map((row) => (
            <div
              key={row.raw}
              className="flex items-center gap-3 p-3 rounded border border-ink-200"
            >
              <code className="text-xs bg-ink-100 px-2 py-1 rounded font-mono">
                {row.raw}
              </code>
              <ChevronRight size={14} className="text-ink-400" />
              <select
                defaultValue={row.suggestion ? "match" : "create"}
                className="flex-1 px-3 py-1.5 rounded border border-ink-200 text-sm"
              >
                {row.suggestion && (
                  <option value="match">
                    Match to {row.suggestion}
                  </option>
                )}
                <option value="create">Create new user</option>
                <option value="skip">Skip (drop these tasks)</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-heading text-lg font-semibold mb-3">
          Warnings ({3})
        </h2>
        <ul className="text-sm text-ink-700 space-y-2">
          <li className="flex gap-2">
            <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
            Sheet "Thermax ENIMAX", row 14: priority "P3" not recognized →
            defaulting to <span className="font-medium">Medium</span>
          </li>
          <li className="flex gap-2">
            <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
            Sheet "POCs", row 4: target_date <code>"TBD"</code> → stored as
            null
          </li>
          <li className="flex gap-2">
            <AlertTriangle size={14} className="text-brand-yellow mt-0.5 shrink-0" />
            Sheet "AMC", row 9: effort "8 Hrs(Max)" → parsed as 8 (kept original
            in <code>effort_note</code>)
          </li>
        </ul>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost">
          ← Back
        </button>
        <button onClick={onConfirm} className="btn-primary">
          Confirm import (atomic)
        </button>
      </div>
    </div>
  );
}

function DoneStep({ onAgain }: { onAgain: () => void }) {
  return (
    <div className="card p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-brand-greenBg grid place-items-center mb-4">
        <CheckCircle2 size={28} className="text-brand-green" />
      </div>
      <h2 className="font-heading text-xl font-semibold mb-2">
        Import complete
      </h2>
      <p className="text-sm text-ink-500 mb-6">
        Created 4 teams, 7 projects, 42 tasks. 4 invite emails sent.
      </p>
      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mb-6 text-left">
        <Stat n={4} label="Teams" />
        <Stat n={7} label="Projects" />
        <Stat n={42} label="Tasks" />
        <Stat n={4} label="Invites sent" />
        <Stat n={3} label="Warnings" />
        <Stat n={0} label="Errors" />
      </div>
      <button onClick={onAgain} className="btn-ghost border border-ink-200">
        Import another file
      </button>
    </div>
  );
}

function DryRunStat({
  label,
  value,
  note,
  tone = "ok",
}: {
  label: string;
  value: number;
  note: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`card p-4 ${tone === "warn" ? "border-brand-yellowBorder bg-brand-yellowBg" : ""}`}
    >
      <div className="text-xs text-ink-500 font-medium">{label}</div>
      <div className="font-heading text-2xl font-semibold leading-tight">
        {value}
      </div>
      <div className="text-xs text-ink-500 mt-0.5">{note}</div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-ink-50 rounded p-3">
      <div className="font-heading text-xl font-semibold">{n}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </div>
  );
}
