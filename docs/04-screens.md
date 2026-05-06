# 04 — Screens

Every screen needed for the MVP. Match the visual style of `assets/demo.html` (Google color palette, Space Grotesk for headings, Poppins for body).

## Screen inventory

| # | Screen | Route | Used by | Notes |
|---|---|---|---|---|
| 1 | Login | `/login` | All | Email + password, "Forgot password?" link |
| 2 | Forgot Password | `/forgot-password` | All | Enter email, sends reset link |
| 3 | Reset Password | `/reset/:token` | All | Set new password from emailed link |
| 4 | First-time Setup | `/setup/:token` | All | After invite — set initial password |
| 5 | My Day (Manager) | `/my-day` (when Manager) | Manager | Personal landing dashboard |
| 6 | My Day (User) | `/my-day` (when User) | User | Personal landing dashboard |
| 7 | Org Dashboard | `/dashboard` | Admin | Cross-team rollup, important tasks |
| 8 | Team Board | `/teams/:teamId` | All (edit by role) | Kanban + table toggle |
| 9 | Team-picker | `/teams` | Manager (multi-team), All | Picker if user belongs to multiple |
| 10 | My Tasks | `/my-tasks` | All | Personal queue grouped by status |
| 11 | Task Drawer | overlay on board | All | Slides over current screen |
| 12 | Project Detail | `/teams/:teamId/projects/:projectId` | All (edit by role) | All tasks of one project |
| 13 | Admin · Teams | `/admin/teams` | Admin | List, create, archive teams |
| 14 | Admin · Users | `/admin/users` | Admin | Invite, manage, role-per-team |
| 15 | Admin · Audit Log | `/admin/audit` | Admin | Global audit |
| 16 | Manager · Audit | `/teams/:teamId/audit` | Manager | Team-scoped audit |
| 17 | Admin · Import | `/admin/import` | Admin | Upload xlsx, dry-run, reconcile |
| 18 | Admin · System Settings | `/admin/settings` | Admin | SMTP, working hours, timezone |
| 19 | Profile / Account | `/profile` | All | Name, email, password |
| 20 | Notification Preferences | `/profile/notifications` | All | Per-category in-app/email toggles |
| 21 | Notifications Panel | overlay (🔔) | All | Slide-out from top nav |

---

## Screen-by-screen specs

### 5. My Day (Manager)

**Layout** (top to bottom):

1. Header: "Good morning, [Name]" + small date/time + team-picker dropdown (if Manager of multiple teams)
2. Stat cards row (4 cards):
   - **Due Today** (count of own tasks where target_date == today AND status ≠ Done)
   - **Overdue** (own tasks where target_date < today AND status ≠ Done)
   - **⭐ Important — mine** (own tasks with is_important = true)
   - **Blocked — team** (across teams I manage, count of tasks in Blocked status)
3. **My Day** section header + list of own tasks where target_date ≤ today, sorted by priority desc. Each row: title, project, target date, status pill, quick-action buttons (mark in-progress / done)
4. **Team needs attention** section. Three subsections:
   - Blocked by team users (need unblocking)
   - Unassigned in own teams
   - Overdue with no remark in last 3 days
5. **Recent activity** section (last 5 events in teams I manage): "[User] [action] [task title]"
6. **Quick actions** row: `+ New task` (opens task creation modal) · `Export Excel` · `Open team board`

### 6. My Day (User)

**Layout**:

1. Header: "Good morning, [Name]" + date + team filter chip
2. Stat cards row (3 cards):
   - **Due Today**
   - **Overdue**
   - **⭐ Important — mine**
3. **My Day** section: own tasks where target_date ≤ today, sorted: Overdue first, then Due Today, then by priority
4. **Up Next** section: own tasks due tomorrow through end of week, max 5 cards
5. **Recent updates** section: last 5 events relevant to me (assignments, Manager replies, etc.)
6. **Quick actions**: `Open My Tasks` · `Browse team boards`

### 7. Org Dashboard (Admin)

**Layout**:

1. Stat cards (4 cards): Active Tasks · Overdue · ⭐ Important · Done This Week
2. Optional alert banners for system issues
3. Section: **★ Important Tasks Across All Teams** — table with Task, Team / Project, Owner, Status, Due
4. Section: **Per-Team Summary** — table with Team, Active count, Overdue count, ⭐ count, Last activity, Manager(s)

### 8. Team Board

**Layout**:

1. Page header: team name, breadcrumb (Org > Team), action buttons (`+ New task` for Admin/Manager, `Export Excel` for all)
2. Filter row: All projects ▾, Group by ▾, search box, quick filter chips (Priority ≥ High, Due this week, Overdue, Unassigned, Blocked)
3. Kanban columns: To Do · In Progress · Blocked · Done
4. Each card shows: priority pill, project pill, task title, assignee avatars, target date, ⭐ icon if important, "Overdue Nd" badge if overdue
5. Card states:
   - Default: white background, subtle border
   - Important: yellow background (`#FEF7E0`), yellow-ish border
   - Overdue: red left border (3px solid `#EA4335`)
6. Inline edits (Admin/Manager only): click status pill / target date / priority pill / effort to edit in place
7. Drag & drop between columns (Admin/Manager: full; User: only own tasks)
8. Toggle table view (alternative to Kanban) — same data as a sortable table

### 10. My Tasks

Same as Team Board structure, but:
- Filtered to tasks where current user is in `Person Responsible`
- Across all teams the user belongs to (with team filter chip)
- Users see their own tasks editable for status only; Manager-on-this-team can also edit task definition

### 11. Task Drawer

Slide-out panel from the right, ~480px wide. Sections:

1. **Header**: priority pill, project pill, ⭐ toggle (Manager+), close X
2. **Title** (text input — disabled for User)
3. **Description** (multi-line text — disabled for User)
4. **Person Responsible** (multi-select chip input — disabled for User)
5. **Dates row**: Start Date · Target Date (date pickers — disabled for User)
6. **Effort row**: Estimated (disabled for User) · Actual (editable when status=Done by anyone assigned)
7. **Status** dropdown (editable: User if assigned; Manager+ always)
8. **Remarks** thread:
   - Chronological list of remarks (text + author + timestamp)
   - "Add remark" text box at bottom (any assignee + Manager+)
   - @mention autocomplete (suggests team members)
9. **Audit timeline** (collapsed by default): every change to this task with actor, timestamp, before/after

### 13. Admin · Teams

Table with: Team Name · Manager(s) · Members · Projects · Active Tasks · Status · Created.

Actions: + New Team, Archive, click row to edit.

### 14. Admin · Users

Table with: Name · Email · Roles per Team (chips) · Last Login · Status.

Actions: + Invite User, Bulk Assign (CSV), click row → user detail panel with full editing.

### 15. Admin · Audit Log

Reverse-chronological table: When | Who | What | Where | Diff (expandable).

Filters: user, team, action type, date range. Search box. Export CSV button.

### 17. Admin · Import

Three-step wizard:
1. **Upload**: drag-drop zone for xlsx
2. **Preview & Reconcile**: shows what will be created + list of unmatched names with mapping options
3. **Confirm**: shows summary, "Import" button (atomic)

Last-import banner at top showing: date, counts, success/failure.

---

## Visual style guide

- **Color palette** (Google):
  - Primary blue: `#1A73E8` (active nav, primary buttons, links)
  - Hover blue: `#1967D2`
  - Light blue bg: `#E8F0FE` (active nav background, info banner)
  - Red (danger/overdue): `#EA4335` (border), `#C5221F` (text), `#FCE8E6` (bg)
  - Yellow (important/warn): `#F9AB00` (star icon), `#B06000` (text), `#FEF7E0` (bg), `#FDD663` (border)
  - Green (success/done): `#34A853`, `#137333` (text), `#E6F4EA` (bg)
  - Greys: `#202124` (primary text), `#3C4043` (secondary), `#5F6368` (tertiary), `#9AA0A6` (muted), `#DADCE0` (borders), `#F1F3F4` (hover bg), `#F8F9FA` (page bg), `#FFFFFF` (cards)
- **Fonts** (load from Google Fonts):
  - Headings, logo, stat numbers, table headers, avatar initials: **Space Grotesk** weights 400/500/600/700
  - Body, buttons, table cells, pills, helper text: **Poppins** weights 300/400/500/600
- **Border radius**: 8px on cards, 4px on buttons, 20px on pill-shaped role/filter buttons, 50% on avatars
- **Logo**: four small dots in Google's blue/red/yellow/green sequence, followed by the app name in Space Grotesk semibold
