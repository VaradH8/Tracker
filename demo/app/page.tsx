import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/Logo";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-ink-900 flex flex-col">
      <header className="border-b border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="md" />
          <Link href="/login" className="btn-primary">
            Sign in <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
      </header>

      <section className="flex-1 max-w-[1200px] mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center w-full">
        <div>
          <div className="inline-flex items-center gap-1.5 mb-4 px-2.5 py-1 rounded-pill bg-brand-blueBg text-brand-blue text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-blue animate-pulse" />
            Built for engineering services teams
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-semibold leading-tight mb-5">
            Run projects.{" "}
            <span className="text-brand-blue">See who's doing what.</span>{" "}
            Keep the work moving.
          </h1>
          <p className="text-lg text-ink-700 leading-relaxed mb-8 max-w-xl">
            Task Manager replaces the spreadsheet your co-ordinators are
            cobbling together. Plan projects, assign developers, track
            deliveries, and surface the signals that matter — overdue work,
            idle resources, blocked tasks — all in one place.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/login" className="btn-primary text-base px-5 py-2.5">
              Open the app <ArrowRight size={16} className="ml-2" />
            </Link>
          </div>
          <p className="text-xs text-ink-500 mt-6">
            Need an account? Ask your Admin to send an invite.
          </p>
        </div>

        <HeroPreview />
      </section>

      <footer className="border-t border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 py-8 flex items-center justify-between text-sm text-ink-500">
          <Logo size="sm" />
          <p>© 2026 · Task Manager</p>
        </div>
      </footer>
    </div>
  );
}

function HeroPreview() {
  return (
    <div className="card p-5 shadow-lg">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-2.5 h-2.5 rounded-full bg-brand-red" />
        <span className="w-2.5 h-2.5 rounded-full bg-brand-yellow" />
        <span className="w-2.5 h-2.5 rounded-full bg-brand-green" />
        <span className="ml-3 text-xs text-ink-500">
          app.taskmanager / dashboard
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat
          label="Active projects"
          value="6"
          tone="bg-brand-blueBg text-brand-blue"
        />
        <Stat
          label="Overdue tasks"
          value="3"
          tone="bg-brand-redBg text-brand-redText"
        />
        <Stat
          label="Resources flagged"
          value="2"
          tone="bg-brand-yellowBg text-brand-yellowText"
        />
        <Stat
          label="Done this week"
          value="14"
          tone="bg-brand-greenBg text-brand-greenText"
        />
      </div>
      <div className="space-y-2">
        <PreviewRow
          name="Comment Classification API"
          owner="Manasi · Abhishek"
          tone="red"
        />
        <PreviewRow
          name="Replace P&ID symbol library"
          owner="Priyanka"
          tone="yellow"
        />
        <PreviewRow
          name="Onboarding deck refresh"
          owner="Sanjana"
          tone="grey"
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`rounded-card p-3 ${tone}`}>
      <div className="font-heading text-2xl font-semibold leading-tight">
        {value}
      </div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function PreviewRow({
  name,
  owner,
  tone,
}: {
  name: string;
  owner: string;
  tone: "red" | "yellow" | "grey";
}) {
  const cls =
    tone === "red"
      ? "border-l-[3px] border-l-brand-red"
      : tone === "yellow"
        ? "bg-brand-yellowBg border-brand-yellowBorder"
        : "";
  return (
    <div
      className={`flex items-center justify-between p-3 rounded-card border border-ink-200 ${cls}`}
    >
      <div className="text-sm text-ink-900">{name}</div>
      <div className="text-xs text-ink-500">{owner}</div>
    </div>
  );
}
