"use client";

import { useEffect, useId, useState } from "react";
import { Sparkles, X } from "lucide-react";

/**
 * First-run welcome: a short card on someone's landing page the first time
 * they arrive, with three things worth knowing for their role. Dismissed
 * with "Got it" and remembered per account in this browser.
 *
 * Kept in localStorage rather than the database on purpose: it is a hint,
 * not a record. Seeing it once more on a new device costs nothing, and it
 * needs no migration. If storage is unavailable (private mode, blocked
 * site data) it simply shows until dismissed for that visit.
 */
export function WelcomeCard({
  storageKey,
  firstName,
  title,
  tips,
  className,
}: {
  /** Wraps the card while it shows — page spacing, so a dismissed card
   *  leaves no gap behind. */
  className?: string;
  /** Unique per account, e.g. `welcome:tracker:<userId>`. */
  storageKey: string;
  firstName: string;
  title: string;
  tips: string[];
}) {
  const headingId = useId();
  // Decided after mount: the server can't read localStorage, and rendering
  // the card there would flash it for people who already dismissed it.
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(storageKey) !== "dismissed");
    } catch {
      setShow(true);
    }
  }, [storageKey]);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {
      /* storage blocked: it just won't be remembered */
    }
  }

  if (!show) return null;
  return (
    <div className={className}>
      <section
        aria-labelledby={headingId}
        className="card p-5 border-brand-blueBg bg-white flex gap-4 motion-safe:animate-rise-in"
      >
        <div className="w-10 h-10 shrink-0 rounded-full bg-brand-blueBg grid place-items-center">
          <Sparkles size={18} className="text-brand-blueText" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id={headingId} className="font-heading text-base font-semibold text-ink-900">
            Welcome, {firstName}. {title}
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink-700 list-disc pl-5">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <button type="button" onClick={dismiss} className="btn-primary mt-4">
            Got it
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="tap-target self-start p-1.5 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-100"
        >
          <X size={16} />
        </button>
      </section>
    </div>
  );
}

const SHORTCUT = "Press Ctrl K (⌘K on a Mac) to jump to any page, project or task.";

/** Tracker tips per role (the role's landing page is where they show). */
export const TRACKER_WELCOME: Record<
  "Admin" | "Lead" | "Coordinator" | "HR" | "BusinessDeveloper" | "Developer",
  { title: string; tips: string[] }
> = {
  Admin: {
    title: "Here's where everything is.",
    tips: [
      "Dashboard shows every project, who is overloaded and what is late.",
      "Users is where you add people, set roles and reset passwords.",
      "Settings holds working days, leave types, backups and the email log.",
    ],
  },
  Lead: {
    title: "Here's your day.",
    tips: [
      "My Day lists today's work across your projects, overdue first.",
      "Open a project and press New task to assign work — people are notified.",
      SHORTCUT,
    ],
  },
  Coordinator: {
    title: "Here's your day.",
    tips: [
      "My Day lists today's work across the projects you run, overdue first.",
      "Open a project and press New task to assign work — people are notified.",
      SHORTCUT,
    ],
  },
  HR: {
    title: "Here's your day.",
    tips: [
      "My Day lists today's work; Users is where you onboard people.",
      "Performance has every review, and the official Word download.",
      SHORTCUT,
    ],
  },
  BusinessDeveloper: {
    title: "Here's where your work is.",
    tips: [
      "Projects lists the projects you created or are on.",
      "Clients keeps each client's contacts and their projects together.",
      SHORTCUT,
    ],
  },
  Developer: {
    title: "Here's where your work is.",
    tips: [
      "My Tasks is everything assigned to you, grouped by status.",
      "Open a task to change its status, log hours or leave a remark for your Lead.",
      "The bell at the top shows new assignments and replies.",
    ],
  },
};

/** Engineering tips per role, shown on /engineering. */
export const ENGINEERING_WELCOME: Record<
  "Admin" | "CEO" | "Lead" | "TeamLead" | "SME" | "Actionee",
  { title: string; tips: string[] }
> = {
  Admin: {
    title: "Here's the Engineering module.",
    tips: [
      "People is where you add accounts and set roles.",
      "Projects holds divisions and tag allocations; KPIs shows delivery against plan.",
      "Approvals is where submitted tags are checked.",
    ],
  },
  CEO: {
    title: "Here's the portfolio.",
    tips: [
      "This dashboard and Projects show every project's progress.",
      "Forecast shows when work will land at the current pace.",
      "Resource engagement shows who is busy and who is free.",
    ],
  },
  Lead: {
    title: "Here's what needs you.",
    tips: [
      "This page shows what needs you today and anything slipping.",
      "Approvals is where your team's submitted tags wait for you.",
      "Forecast and Resource engagement help you plan who works on what.",
    ],
  },
  TeamLead: {
    title: "Here's your work and your team's.",
    tips: [
      "Task log is where you submit the day's work.",
      "Approvals is where your team's submissions wait for you.",
      "My tags shows your allocations and what is left.",
    ],
  },
  SME: {
    title: "Here's where your work is.",
    tips: [
      "My tags shows your allocations and what is left.",
      "Task log is where you submit the day's delivered tags.",
      "Your supervisor approves them; this page shows what came back.",
    ],
  },
  Actionee: {
    title: "Here's where your work is.",
    tips: [
      "My tags shows your allocations and what is left.",
      "Task log is where you submit the day's delivered tags.",
      "Your supervisor approves them; this page shows what came back.",
    ],
  },
};
