"use client";

import { useRef, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  Loader2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SettingsTabs } from "@/components/SettingsTabs";
import { useRole } from "@/lib/role";
import { useToast } from "@/components/Toast";

type Step = "upload" | "preview" | "done";

type Counts = {
  usersCreated: number;
  usersReused: number;
  clientsCreated: number;
  clientsReused: number;
  projectsCreated: number;
  projectsReused: number;
  tasksCreated: number;
  tasksUpdated: number;
  remarksCreated: number;
  memberRowsCreated: number;
};

type ImportResult = {
  mode: "preview" | "commit";
  sheets: { imported: string[]; skipped: string[] };
  perSheet: {
    serviceArea: string;
    taskCount: number;
    lead: string[];
    coordinator: string[];
  }[];
  counts: Counts;
  rawTaskCount: number;
  uniqueTaskCount: number;
  unmatchedNames: string[];
  unknownPeopleKeys: string[];
};

export default function SettingsImportPage() {
  const [role] = useRole();
  const toast = useToast();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function send(mode: "preview" | "commit"): Promise<ImportResult | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error ?? "Import failed.");
    }
    return body as ImportResult;
  }

  async function onPreview() {
    setBusy(true);
    try {
      const r = await send("preview");
      if (r) {
        setPreview(r);
        setStep("preview");
      }
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    setBusy(true);
    try {
      const r = await send("commit");
      if (r) {
        setResult(r);
        setStep("done");
        toast.show("Import complete.");
      }
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStep("upload");
  }

  if (role !== "Admin") {
    return (
      <AppShell>
        <div className="max-w-[1100px] mx-auto px-6 py-8">
          <div className="card p-8 text-center">
            <h1 className="font-heading text-xl font-semibold mb-2">
              Admins only
            </h1>
            <p className="text-sm text-ink-500">
              Importing the tracker workbook is restricted to admins.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-6 py-8">
        <header className="mb-6">
          <h1 className="font-heading text-3xl font-semibold">Settings</h1>
          <p className="text-sm text-ink-500 mt-1">
            Org-wide configuration · Admin only
          </p>
        </header>

        <SettingsTabs />

        <div className="mb-6">
          <h2 className="font-heading text-xl font-semibold mb-1">
            Import xlsx
          </h2>
          <p className="text-sm text-ink-500">
            Upload <code>Ongoing_Projects.xlsx</code>. Preview the changes,
            then confirm. The import is idempotent — running it again updates
            existing rows instead of duplicating them.
          </p>
        </div>

        <Stepper step={step} />

        {step === "upload" && (
          <UploadStep
            file={file}
            busy={busy}
            onPick={setFile}
            onNext={onPreview}
          />
        )}
        {step === "preview" && preview && (
          <PreviewStep
            data={preview}
            busy={busy}
            onBack={() => setStep("upload")}
            onConfirm={onConfirm}
          />
        )}
        {step === "done" && result && (
          <DoneStep data={result} onAgain={reset} />
        )}
      </div>
    </AppShell>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps = [
    { id: "upload", label: "Upload" },
    { id: "preview", label: "Preview" },
    { id: "done", label: "Confirm" },
  ];
  const idx = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 mb-8">
      {steps.map((s, i) => (
        <li key={s.id} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full grid place-items-center text-xs font-heading font-medium ${
              i <= idx ? "bg-brand-blue text-white" : "bg-ink-100 text-ink-500"
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

function UploadStep({
  file,
  busy,
  onPick,
  onNext,
}: {
  file: File | null;
  busy: boolean;
  onPick: (f: File | null) => void;
  onNext: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function accept(f: File | undefined) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) return;
    onPick(f);
  }

  return (
    <div className="card p-6">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`border-2 border-dashed rounded-card p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-brand-blue bg-brand-blueBg"
            : "border-ink-200 bg-ink-50 hover:bg-ink-100"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => accept(e.target.files?.[0])}
        />
        <UploadCloud size={40} className="mx-auto text-brand-blue mb-3" />
        {file ? (
          <p className="text-base font-medium text-ink-900 mb-1 inline-flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-brand-green" />
            {file.name}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPick(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              className="p-0.5 rounded hover:bg-ink-200 text-ink-500"
              aria-label="Remove file"
            >
              <X size={14} />
            </button>
          </p>
        ) : (
          <p className="text-base font-medium text-ink-900 mb-1">
            Drop <code>Ongoing_Projects.xlsx</code> here
          </p>
        )}
        <p className="text-sm text-ink-500">Or click to browse · .xlsx · max 25 MB</p>
      </div>

      <div className="mt-6 p-4 bg-brand-blueBg rounded-card text-sm text-ink-700">
        <p className="font-medium mb-1">What will happen:</p>
        <ul className="list-disc list-inside space-y-0.5 text-ink-700">
          <li>Each project sheet (AMC, POCs, Thermax …) becomes Projects</li>
          <li>Each task row becomes a Task; assignees match to existing users</li>
          <li>Unmatched names are listed in the preview; their tasks still import</li>
          <li>Nothing is written until you confirm on the next step</li>
        </ul>
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={onNext}
          disabled={!file || busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="mr-1.5 animate-spin" /> Reading…
            </>
          ) : (
            <>
              <FileSpreadsheet size={16} className="mr-1.5" /> Preview import
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function PreviewStep({
  data,
  busy,
  onBack,
  onConfirm,
}: {
  data: ImportResult;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const c = data.counts;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DryRunStat
          label="Clients"
          value={c.clientsCreated + c.clientsReused}
          note={`${c.clientsCreated} new · ${c.clientsReused} existing`}
        />
        <DryRunStat
          label="Projects"
          value={c.projectsCreated + c.projectsReused}
          note={`${c.projectsCreated} new · ${c.projectsReused} existing`}
        />
        <DryRunStat
          label="Tasks"
          value={data.uniqueTaskCount}
          note={`${data.rawTaskCount} rows → deduped`}
        />
        <DryRunStat
          label="Names to map"
          value={data.unmatchedNames.length}
          note={data.unmatchedNames.length ? "skipped — see below" : "all matched"}
          tone={data.unmatchedNames.length ? "warn" : "ok"}
        />
      </div>

      <div className="card p-5">
        <h2 className="font-heading text-lg font-semibold mb-3">
          Sheets detected
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {data.perSheet.map((s) => (
            <span
              key={s.serviceArea}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-brand-greenBg text-brand-greenText text-xs font-medium"
            >
              {s.serviceArea}
              <span className="text-ink-500">· {s.taskCount}</span>
            </span>
          ))}
        </div>
        {data.sheets.skipped.length > 0 && (
          <p className="text-xs text-ink-500">
            Skipped (not project sheets):{" "}
            {data.sheets.skipped.join(", ")}
          </p>
        )}
      </div>

      {data.unmatchedNames.length > 0 && (
        <div className="card p-5 border-brand-yellowBorder bg-brand-yellowBg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-brand-yellow" />
            <h2 className="font-heading text-lg font-semibold">
              Unmatched names
            </h2>
          </div>
          <p className="text-sm text-ink-600 mb-3">
            These names appeared in the sheet but don&apos;t match a known
            person. Their task assignments are skipped — the tasks still
            import. Fix the spelling in the sheet, or add the user first, then
            re-import.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.unmatchedNames.map((n) => (
              <code
                key={n}
                className="text-xs bg-white border border-ink-200 px-2 py-1 rounded font-mono"
              >
                {n}
              </code>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button onClick={onBack} disabled={busy} className="btn-ghost">
          ← Back
        </button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className="btn-primary disabled:opacity-50"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="mr-1.5 animate-spin" /> Importing…
            </>
          ) : (
            "Confirm import"
          )}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ data, onAgain }: { data: ImportResult; onAgain: () => void }) {
  const c = data.counts;
  return (
    <div className="card p-8 text-center">
      <div className="w-14 h-14 mx-auto rounded-full bg-brand-greenBg grid place-items-center mb-4">
        <CheckCircle2 size={28} className="text-brand-green" />
      </div>
      <h2 className="font-heading text-xl font-semibold mb-2">Import complete</h2>
      <p className="text-sm text-ink-500 mb-2">
        {c.clientsCreated} clients and {c.projectsCreated} projects created,{" "}
        {c.usersCreated} users added.
      </p>
      <p className="text-sm text-ink-500 mb-6">
        Tasks: {c.tasksCreated} created, {c.tasksUpdated} updated ·{" "}
        {c.remarksCreated} remarks.
      </p>
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