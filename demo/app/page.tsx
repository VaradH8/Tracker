import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Logo } from "@/components/Logo";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-ink-900">
      <header className="border-b border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
          <Logo size="md" />
          <nav className="hidden sm:flex items-center gap-8 text-sm">
            <a href="#features" className="text-ink-700 hover:text-brand-blue">
              Features
            </a>
            <a href="#roles" className="text-ink-700 hover:text-brand-blue">
              Roles
            </a>
            <a
              href="#why"
              className="text-ink-700 hover:text-brand-blue"
            >
              Why
            </a>
          </nav>
          <Link href="/login" className="btn-primary">
            Sign in <ArrowRight size={14} className="ml-1.5" />
          </Link>
        </div>
      </header>

      <section className="max-w-[1200px] mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
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
            <a
              href="#features"
              className="btn-ghost text-base px-5 py-2.5 border border-ink-200"
            >
              See what's inside
            </a>
          </div>
          <p className="text-xs text-ink-500 mt-6">
            Demo build · pick any role at sign-in · no credentials required
          </p>
        </div>

        <HeroPreview />
      </section>

      <section id="features" className="bg-ink-50 border-y border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 py-16">
          <h2 className="font-heading text-3xl font-semibold text-center mb-3">
            Everything in one place
          </h2>
          <p className="text-ink-700 text-center max-w-xl mx-auto mb-12">
            One tool that's tight enough for a 10-person org and structured
            enough to grow with you.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <Feature
              Icon={Briefcase}
              title="Projects, not just tasks"
              body="Group work by client. See progress, hours, and health at a glance — drill into any project for the full task list and history."
            />
            <Feature
              Icon={Users}
              title="Resource visibility"
              body="One page per person. Hours logged, tasks shipped, estimate accuracy, performance flags. Make decisions on data, not gut."
            />
            <Feature
              Icon={Gauge}
              title="Right signals, surfaced"
              body="Overdue, blocked, idle. The cards that need a conversation today are the ones the dashboard puts in front of you."
            />
            <Feature
              Icon={CheckCircle2}
              title="Inline edits everywhere"
              body="Change status, priority, assignee, or date in one click on the card. No drawers, no menus, no training."
            />
            <Feature
              Icon={ShieldCheck}
              title="Audit log"
              body="Every status change, every reassignment, every project edit — captured with actor and timestamp. Compliance-grade by default."
            />
            <Feature
              Icon={Briefcase}
              title="Excel in, Excel out"
              body="Migrate from your existing tracker in three clicks. Export back to xlsx for leadership digests in the column order they expect."
            />
          </div>
        </div>
      </section>

      <section id="roles" className="max-w-[1200px] mx-auto px-6 py-16">
        <h2 className="font-heading text-3xl font-semibold text-center mb-3">
          Built for the four roles you actually have
        </h2>
        <p className="text-ink-700 text-center max-w-xl mx-auto mb-12">
          Each role lands on the screen they care about most — no menu hunting
          on day one.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <RoleCard
            color="bg-brand-redBg text-brand-redText"
            label="Admin"
            blurb="Org-wide health, resources, settings."
            lands="/dashboard"
          />
          <RoleCard
            color="bg-brand-blueBg text-brand-blue"
            label="Co-ordinator"
            blurb="Plan projects, run the day, unblock the team."
            lands="/my-day"
          />
          <RoleCard
            color="bg-brand-yellowBg text-brand-yellowText"
            label="Business Developer"
            blurb="Project pipeline, client info, intake."
            lands="/projects"
          />
          <RoleCard
            color="bg-brand-greenBg text-brand-greenText"
            label="Developer"
            blurb="Today's tasks, status updates, remarks."
            lands="/my-tasks"
          />
        </div>
      </section>

      <section id="why" className="bg-ink-900 text-white">
        <div className="max-w-[900px] mx-auto px-6 py-20 text-center">
          <h2 className="font-heading text-3xl font-semibold mb-4">
            Stop guessing who's busy.
          </h2>
          <p className="text-ink-200 text-lg leading-relaxed mb-8 max-w-2xl mx-auto">
            Spreadsheets don't tell you who's idle, whose estimates always
            overrun, or which task has gone five days without a status change.
            Task Manager does.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center btn-primary text-base px-5 py-2.5"
          >
            Try it now <ArrowRight size={16} className="ml-2" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-ink-200">
        <div className="max-w-[1200px] mx-auto px-6 py-8 flex items-center justify-between text-sm text-ink-500">
          <Logo size="sm" />
          <p>© 2026 · Demo build</p>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  Icon,
  title,
  body,
}: {
  Icon: typeof Briefcase;
  title: string;
  body: string;
}) {
  return (
    <div className="card p-6">
      <div className="w-10 h-10 rounded-card bg-brand-blueBg text-brand-blue grid place-items-center mb-4">
        <Icon size={20} />
      </div>
      <h3 className="font-heading text-lg font-semibold mb-1.5">{title}</h3>
      <p className="text-sm text-ink-700 leading-relaxed">{body}</p>
    </div>
  );
}

function RoleCard({
  color,
  label,
  blurb,
  lands,
}: {
  color: string;
  label: string;
  blurb: string;
  lands: string;
}) {
  return (
    <div className="card p-5">
      <div
        className={`inline-flex items-center px-2 py-0.5 rounded-pill text-xs font-medium mb-3 ${color}`}
      >
        {label}
      </div>
      <p className="text-sm text-ink-700 leading-relaxed mb-3">{blurb}</p>
      <p className="text-xs text-ink-500">
        Lands on <code className="text-ink-700">{lands}</code>
      </p>
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
        <span className="ml-3 text-xs text-ink-500">app.taskmanager / dashboard</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <Stat label="Active projects" value="6" tone="bg-brand-blueBg text-brand-blue" />
        <Stat label="Overdue tasks" value="3" tone="bg-brand-redBg text-brand-redText" />
        <Stat label="Resources flagged" value="2" tone="bg-brand-yellowBg text-brand-yellowText" />
        <Stat label="Done this week" value="14" tone="bg-brand-greenBg text-brand-greenText" />
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
        <PreviewRow name="Onboarding deck refresh" owner="Sanjana" tone="grey" />
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
    <div className={`flex items-center justify-between p-3 rounded-card border border-ink-200 ${cls}`}>
      <div className="text-sm text-ink-900">{name}</div>
      <div className="text-xs text-ink-500">{owner}</div>
    </div>
  );
}
