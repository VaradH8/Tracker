# 03 — Workflows

The journeys that carry most daily use. Each names the screens and API routes involved.

## 1. Developer updates the day's work

1. Sign in → lands on **My Tasks** (`/my-tasks`); **My Day** (`/my-day`) lists today's tasks, overdue first.
2. Open a task → the **task drawer** slides in.
3. Change status (`POST /api/tasks/[id]/status`) — To Do → In Progress → Done (or Blocked, with a reason).
4. Log hours (`POST /api/tasks/[id]/time-entries`) or start/stop the timer (`/timer`).
5. Add a remark if something needs the Lead (`POST /api/tasks/[id]/remarks`).

Done when the change is saved and visible to the Lead/Co-ordinator. Target: ≤ 4 clicks, < 30 s.

## 2. Co-ordinator assigns new work

1. **Projects** → open the project (`/projects/[id]`).
2. **New task** → title, assignees, dates, priority, responsible person.
3. Save (`POST /api/tasks`). Each assignee gets an in-app notification and, with SMTP on, an email.

Variants: bulk reassign or re-date from the board; import many tasks from Excel (`POST /api/projects/[id]/import-tasks`); fork a colleague's task (`POST /api/tasks/[id]/fork`).

## 3. Lead reviews submitted work

1. Notification → open the task.
2. **Approve** (`POST /api/tasks/[id]/approve`) or reopen it with a remark. Reopening a Done task counts as rework in performance reviews.

## 4. Engineering: tags from allocation to approval

1. Admin/Lead allocates tags on a project to people (`/api/domain/allocations`, `/tag-assignments`).
2. The engineer submits the day's delivered tags on **Task log** / **My tags** (`POST /api/domain/tag-submissions`).
3. A supervisor approves or corrects on **Approvals** (`PATCH /api/domain/tag-submissions/[id]`).
4. Dashboard, forecast, availability and KPIs update from the approved numbers.

## 5. Leave

1. **Leaves** → type and dates → submit (`POST /api/leaves`).
2. The approver approves (`PATCH /api/leaves`) or denies (`DELETE /api/leaves/[id]`); the requester is notified.
3. Calendar, availability and engagement reflect it.

## 6. Monthly / yearly performance review

1. HR/Admin/Lead opens **Performance**, picks a person and period: tracker facts (tasks, hours, leave, rework) are filled in.
2. The employee fills the self-rating on **My performance**.
3. The Reporting Manager rates and comments; HR rates the HR section and downloads the official Word form.

## 7. Admin housekeeping

- **Users**: add people, set roles and Reporting Managers, reset passwords (signs the person out everywhere).
- **Settings → Import**: the original workbook import.
- **Settings → Backup**: JSON export of every table (password hashes only if ticked) and restore.
- **Email log**: every notification and reset email the app produced.

## Deleting, and undo

Deleting a task (task drawer) or a project (project page) asks for confirmation, then removes it from the screen with an **Undo** toast for 6 seconds. The delete request is only sent after that window; if the tab closes first, it is sent immediately so nothing is silently kept.
