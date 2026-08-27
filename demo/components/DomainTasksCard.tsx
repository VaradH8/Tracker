"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";

/**
 * Tasks, on the dashboard, in one card.
 *
 * The dashboard used to render the task lists in full, with the submit box
 * and the approve controls inline. That was right when there was nowhere
 * else to go; there is now a Task log with the history, the filters and
 * the assign form, and a second full copy of the same list on the front
 * page only splits people's attention between two places that can both
 * act on the same task.
 *
 * So the dashboard keeps the one thing a dashboard is for — the number,
 * and whether it is worth your attention — and hands off. Two counts,
 * because "three assigned to you" and "three waiting on your approval" are
 * different days.
 */
export function DomainTasksCard({
  assigned,
  toApprove,
}: {
  /** Open tasks assigned to this person. */
  assigned: number;
  /** Submitted tasks waiting on this person's decision. */
  toApprove: number;
}) {
  const nothing = assigned === 0 && toApprove === 0;

  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-semibold flex items-center gap-2">
            <ClipboardList size={17} className="text-ink-400" />
            Tasks
          </h2>

          {nothing ? (
            <p className="text-sm text-ink-500 mt-1">
              Nothing assigned to you.
            </p>
          ) : (
            <div className="flex items-baseline gap-5 mt-2 flex-wrap">
              {assigned > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-2xl font-semibold text-ink-900">
                    {assigned}
                  </span>
                  <span className="text-sm text-ink-600">
                    assigned to you
                  </span>
                </span>
              )}
              {toApprove > 0 && (
                <span className="flex items-baseline gap-1.5">
                  <span className="font-heading text-2xl font-semibold text-ink-900">
                    {toApprove}
                  </span>
                  <span className="text-sm text-ink-600">
                    waiting on your approval
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Always offered, even at zero — assigning work is the other half
            of this page, and a card that disappears when you have no tasks
            takes the way in with it. */}
        <Link
          href={
            toApprove > 0 && assigned === 0
              ? "/engineering/task-log?tab=approve"
              : "/engineering/task-log"
          }
          className="btn-primary text-sm shrink-0"
        >
          Open tasks <ArrowRight size={14} className="ml-1.5" />
        </Link>
      </div>
    </section>
  );
}
