# 03 — Workflows by Role

This document walks through what each role sees and does, from login to logout. Implement the UI to match these flows.

---

## ADMIN — Complete Workflow

### Login

User opens the app URL → enters email + password → clicks Sign In.

### Landing: Org Dashboard

Top nav: `Dashboard | Teams | Users | Audit Log | Import | 🔔 | Profile`

Sees:
- 4 stat cards: `Active Tasks | Overdue | Important ⭐ | Done This Week`
- System alerts banner (backup failed, import errors, etc.) — only if any
- Table: **★ Important Tasks Across All Teams** — task name, team, owner, status, due date
- Table: **Per-Team Summary** — team name, active count, overdue count, last activity timestamp

Actions:
- Click any stat card → drills down to filtered task list
- Click any task row → opens task drawer (read + can edit any field)
- Click any team name → jumps to that team's board
- Click 🔔 → notification panel slides out

### Teams tab

Sees: table of all teams — Name, Manager(s), Members count, Projects count, Active Tasks count, Status (Active/Archived).

Actions:
- **+ New Team** → dialog with name + initial Manager(s) → Save → team created, Managers notified
- **Archive** any team → confirmation → soft-delete
- Click team name → team detail page where can edit name, add/remove members, change roles

### Users tab

Sees: table of all users — Name, Email, Roles per Team, Last Login, Status.

Actions:
- **+ Invite User** → dialog with email + name + initial team(s) + role per team → Send → magic link emailed (24h validity)
- **Bulk Assign** → upload CSV
- Click user row → user detail panel:
  - Edit name/email
  - Add user to another team with chosen role
  - Remove from a team
  - Change role for any team
  - Reset password (sends reset link)
  - Deactivate / Reactivate

### Audit Log tab

Sees: reverse-chronological table — When | Who | What | Where | Before → After.

Actions:
- Filter by user, team, action type, date range
- Search free text
- Export filtered audit as CSV
- Click row → expand to see full diff

### Import tab

Sees:
- Last import status banner
- Drag-drop zone for `.xlsx`

Actions:
- Upload xlsx → system shows dry-run preview ("Will create 7 teams, 14 projects, 23 tasks; 9 names need mapping")
- Reconciliation step: map each unmatched name to existing user OR create new user OR skip
- **Confirm Import** → atomic write + invite emails fire
- **Cancel** → nothing persisted

### Profile dropdown

Profile · Notification Preferences · System Settings (Admin only) · Sign Out

System Settings: working hours per day, timezone, SMTP config, backup schedule.

---

## MANAGER — Complete Workflow

### First-time setup

Receives invite email → clicks magic link → sets password → auto-logged-in → lands on **My Day** (or team-picker if Manager of multiple teams).

### Login (returning users)

Top nav: `My Day | Team Board | My Tasks | Audit | 🔔 | Profile`

### Landing: My Day dashboard

A personalized dashboard showing what matters today for the Manager. Sees:

- **Greeting**: "Good morning, [Name]"
- **Today's stats** (4 cards): `Due Today | Overdue | ⭐ Important (mine) | Blocked (team)`
- **My Day section**: tasks where the Manager is in `Person Responsible` AND target_date ≤ today, sorted by priority
- **Team needs attention** section: across teams they manage —
  - Tasks marked Blocked by team members (need unblocking)
  - Tasks unassigned
  - Tasks overdue with no recent remark
- **Recent activity**: last 5 changes in their team(s) (e.g., "Sanjana moved 'Bulk select bug' to Done · 10m ago")
- **Quick actions** row: `+ New task | Export Excel | Open team board`

If Manager has multiple teams, a team-picker dropdown at top filters the dashboard to one team or shows all.

### Team Board tab

Kanban with 4 columns: `To Do | In Progress | Blocked | Done`. Cards show: priority pill, project name, task title, assignee avatars, target date, ⭐ if Important. Overdue cards have red left border. Important cards have yellow background.

Actions:
- **+ New Task** → form (project, priority, description, assignees, effort, dates, optional remark, ⭐ toggle) → Save
- Click any card → drawer with all fields editable (description, priority, dates, effort, assignment, ⭐ flag) + remarks timeline + audit timeline
- Inline edits on board: status pill, target date, priority, effort
- Drag & drop card between status columns → status updates, logged, assignees + Manager notified
- Filters: All projects ▾, Group by ▾ (Status / Project / Assignee / Priority), quick filter chips (Priority ≥ High, Due this week, Overdue, Unassigned, Blocked)
- **Export Excel** → downloads `.xlsx` matching original column order
- **+ New Project** within board (inline)
- Click project header → edit name, archive

### My Tasks tab

Same My Tasks view as User, but Manager can additionally edit task definition (description, dates, priority) since they're a Manager somewhere. The task drawer adapts based on the Manager's role for the task's team.

### Audit tab

Audit log scoped to **own team(s) only**, last 7 days default.

Actions:
- Filter by user (team members only), action type, date range
- Click row → expand for before/after diff

### 🔔 Notifications

- Tasks assigned to me
- Tasks I own changed by someone else
- @mentions in remarks
- ⚠️ Team User marked task as Blocked
- Daily 9 AM overdue digest
- Weekly Monday 8 AM team summary

### Manager daily routine

1. Login → My Day → scan greeting + today's stats
2. Work through "Due Today" list
3. Check "Team needs attention" → unblock blocked tasks, ping idle overdue ones
4. Open Team Board for planning new tasks
5. End of day: review Recent Activity, sign off

---

## USER — Complete Workflow

### First-time setup

Receives invite email → magic link → password setup → auto-logged-in → lands on **My Day**.

### Login (returning users)

Top nav: `My Day | My Tasks | Team Boards | 🔔 | Profile`

### Landing: My Day dashboard

Sees:

- **Greeting**: "Good morning, [Name]"
- **Today's stats** (3 cards): `Due Today | Overdue | ⭐ Important (mine)`
- **My Day section**: tasks assigned to me where target_date ≤ today, sorted: Overdue first, then Due Today, then by priority
- **Up Next section**: my tasks due tomorrow and the rest of this week, max 5 cards
- **Recent updates section**: last 5 events relevant to me — task assigned, Manager replied to my remark, Manager changed details on my task, etc.
- **Quick actions**: `Open My Tasks | Browse team boards`

If User is on multiple teams, a team filter chip lets them narrow My Day to one team.

### My Tasks tab

Personal queue grouped by status: `To Do | In Progress | Blocked | Done`. Cards sorted by target date asc within each column. Across all teams the User belongs to (filterable).

Actions:
- **Drag card between columns** to update status:
  - To Do → In Progress: status logged, Manager notified
  - In Progress → Blocked: prompt for blocker reason → save → Manager notified
  - In Progress → Done: prompt for actual hours (defaults to estimated effort) → save → Manager notified
  - Blocked → In Progress: status reverted, logged
- **Click card** → drawer:
  - Read-only: description, priority, dates, effort, assignees, ⭐ flag
  - Editable: own status, actual hours (on Done), add remark
  - Read remarks timeline (chronological)
  - Read audit timeline
- **+ New Task button is disabled** with tooltip: "Only Manager can create tasks. Ask via remark on an existing task."

### Team Boards tab (read-only)

Sees: list of all teams as buttons. Click any team to browse its board.

- Cards visible but not draggable
- Click card → read-only drawer (no edit affordances)
- Cannot add remarks on tasks they're not assigned to
- No "+ New Task" button

### 🔔 Notifications

- Task assigned to me
- Manager changed details on my task (date, priority, etc.)
- @mention in remark
- Daily 9 AM digest if I have overdue tasks
- Task I'm on was marked Important
- Manager replied to my remark

### User daily routine

1. Login → My Day → see today's queue
2. Pick top task → drag to In Progress
3. Work; if blocked → drag to Blocked, type reason
4. Finish → drag to Done, log actual hours
5. Throughout day: 🔔 alerts for new assignments / Manager replies

---

## What every role does on login (summary table)

| Step | Admin | Manager | User |
|---|---|---|---|
| Lands on | Org Dashboard | My Day | My Day |
| Top nav | Dashboard, Teams, Users, Audit, Import | My Day, Team Board, My Tasks, Audit | My Day, My Tasks, Team Boards |
| Primary daily action | Review org-wide health | Plan & chase team work + own tasks | Update own task status |
| Can create tasks | ✅ any team | ✅ own team | ❌ |
| Can invite users | ✅ | ❌ | ❌ |
| Can mark Important | ✅ | ✅ | ❌ |
| Sees audit log | ✅ global | ✅ own team | ❌ |
