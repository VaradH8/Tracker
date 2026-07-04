"use client";

import { useRef, useState } from "react";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

type Step = "upload" | "preview" | "done";

type Counts = {
  tasksCreated: number;
  tasksUpdated: number;
  assigneesLinked: number;
  remarksCreated: number;
};

type ImportResult = {
  mode: "preview" | "commit";
  rawRowCount: number;
  uniqueTaskCount: number;
  counts: Counts;
  unmatchedNames: string[];
};

/**
 * "Import Tasks" dialog for a single project. Upload a task table (.xlsx /
 * .csv), preview the created-vs-updated counts, then confirm. Admins and
 * Coordinators only — the server enforces the same gate on /import-tasks.
 */
export function ImportTasksModal({
  projectId,
  projectName,
  onClose,
  onImported,
}: {
  projectId: number;
  projectName: string;
  onClose: () => void;
  onImported: () => void | Promise<void>;
}) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function send(mode: "preview" | "commit"): Promise<ImportResult | null> {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    const res = await fetch(`/api/projects/${projectId}/import-tasks`, {
      method: "POST",
      body: fd,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? "Import failed.");
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
        await onImported();
        toast.show(
          `Imported ${r.counts.tasksCreated + r.counts.tasksUpdated} tasks.`,
        );
      }
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function accept(f: File | undefined) {
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      toast.show("Pick a .xlsx, .xls or .csv file.", "error");
      return;
    }
    setFile(f);
  }

  return (
    <Modal title="Import tasks" onClose={onClose} size="lg">
      <p className="text-sm text-ink-500 mb-5 truncate">Into {projectName}</p>

      {step === "upload" && (
        <>
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
            className={`border-2 border-dashed rounded-card p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-brand-blue bg-brand-blueBg"
                : "border-ink-200 bg-ink-50 hover:bg-ink-100"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => accept(e.target.files?.[0])}
            />
            <UploadCloud size={34} className="mx-auto text-brand-blue mb-2" />
            {file ? (
              <p className="text-sm font-medium text-ink-900 inline-flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-brand-green" />
                {file.name}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  className="p-0.5 rounded hover:bg-ink-200 text-ink-500"
                  aria-label="Remove file"
                >
                  <X size={13} />
                </button>
              </p>
            ) : (
              <p className="text-sm font-medium text-ink-900">
                Drop a task file here, or click to browse
              </p>
            )}
            <p className="text-xs text-ink-500 mt-1">.xlsx · .csv · max 25 MB</p>
          </div>

          <div className="mt-4 p-3 bg-brand-blueBg rounded-card text-xs text-ink-700">
            <p className="font-medium mb-1">Expected columns (header row):</p>
            <p>
              <code>Task</code> (required) · <code>Priority</code> ·{" "}
              <code>Status</code> · <code>Start date</code> ·{" "}
              <code>Target date</code> · <code>Effort</code> ·{" "}
              <code>Assignees</code> · <code>Remark</code>. Nothing is written
              until you confirm.
            </p>
          </div>

          <div className="flex justify-end gap-2 mt-6">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={onPreview}
              disabled={!file || busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="mr-1.5 animate-spin" /> Reading…
                </>
              ) : (
                <>
                  <FileSpreadsheet size={16} className="mr-1.5" /> Preview
                </>
              )}
            </button>
          </div>
        </>
      )}

      {step === "preview" && preview && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <PreviewStat label="New" value={preview.counts.tasksCreated} />
            <PreviewStat label="Updated" value={preview.counts.tasksUpdated} />
            <PreviewStat
              label="Assignees"
              value={preview.counts.assigneesLinked}
            />
          </div>
          <p className="text-xs text-ink-500 mb-4">
            {preview.rawRowCount} row{preview.rawRowCount === 1 ? "" : "s"} read
            → {preview.uniqueTaskCount} unique task
            {preview.uniqueTaskCount === 1 ? "" : "s"}. Re-importing updates
            tasks that already exist (matched by title).
          </p>

          {preview.unmatchedNames.length > 0 && (
            <div className="card p-4 mb-4 border-brand-yellowBorder bg-brand-yellowBg">
              <div className="flex items-center gap-2 mb-1.5">
                <AlertTriangle size={15} className="text-brand-yellow" />
                <h3 className="font-heading text-sm font-semibold">
                  Names that don&apos;t match a user
                </h3>
              </div>
              <p className="text-xs text-ink-600 mb-2">
                These tasks still import — they just come in unassigned. Add the
                user first, or fix the spelling, then re-import.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.unmatchedNames.map((n) => (
                  <code
                    key={n}
                    className="text-xs bg-white border border-ink-200 px-2 py-0.5 rounded font-mono"
                  >
                    {n}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2">
            <button
              onClick={() => setStep("upload")}
              disabled={busy}
              className="btn-ghost"
            >
              ← Back
            </button>
            <button
              onClick={onConfirm}
              disabled={busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="mr-1.5 animate-spin" />{" "}
                  Importing…
                </>
              ) : (
                "Confirm import"
              )}
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <div className="text-center py-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-brand-greenBg grid place-items-center mb-3">
            <CheckCircle2 size={26} className="text-brand-green" />
          </div>
          <h3 className="font-heading text-lg font-semibold mb-1">
            Import complete
          </h3>
          <p className="text-sm text-ink-500 mb-6">
            {result.counts.tasksCreated} created, {result.counts.tasksUpdated}{" "}
            updated · {result.counts.assigneesLinked} assignees linked.
          </p>
          <button onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      )}
    </Modal>
  );
}

function PreviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-3 text-center">
      <div className="font-heading text-2xl font-semibold leading-tight">
        {value}
      </div>
      <div className="text-xs text-ink-500 mt-0.5">{label}</div>
    </div>
  );
}
