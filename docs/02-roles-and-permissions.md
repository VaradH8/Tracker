# 02 — Roles & Permissions

Two modules, two separate sets of roles. Every rule below is enforced on the server; the UI only hides what the server would refuse.

## Tracker roles

Each account has one global role (`User.primaryRole`). On top of it, a person can be rostered on a project as **Lead**, **Co-ordinator**, **Developer** or **BD**, which widens what they can do on that project only.

| Role | In one line | Lands on |
| --- | --- | --- |
| **Admin** | Runs the organisation: every project, users, settings, backups, clients. | `/dashboard` |
| **Lead** | Senior tech lead: task authority on their projects; sees their team (people who report to them); a Reporting Manager. | `/my-day` |
| **Coordinator** | Runs the projects they co-ordinate: plans, assigns and tracks every task there. | `/my-day` |
| **HR** | Co-ordinator access, plus onboarding people (Users page, never Admins) and the official performance review download and HR rating. | `/my-day` |
| **BusinessDeveloper** | Clients, pipeline and the projects they create or are rostered on. | `/projects` |
| **Developer** | Their own tasks: updates status, logs time, raises tasks on projects they're rostered on. | `/my-tasks` |

HR is resolved to **Coordinator** for every access check (`lib/role-access.ts`); the real role is kept only for HR-specific privileges and labels.

### Pages per role

| Page | Admin | Lead | Coordinator | HR | BD | Developer |
| --- | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard, Analytics, Audit, Settings | ✅ | | | | | |
| My Day, My Tasks | | ✅ | ✅ | ✅ | | ✅ |
| My team | | ✅ | ✅ | ✅ | | |
| Projects | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Resources, Engagement | ✅ | ✅ | ✅ | ✅ | | |
| Performance (others' reviews) | ✅ | ✅ (own team) | | ✅ | | |
| My performance | | | ✅ | ✅ | | ✅ |
| Users | ✅ | | | ✅ | | |
| Clients | ✅ | | | | ✅ | |
| Leaves, Calendar, Notifications, Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Source of truth: `demo/lib/access.ts` (client) and the server helpers in `demo/lib/server-access.ts`.

### Key server rules

| Area | Rule | Helper |
| --- | --- | --- |
| Projects | Admin sees all. Co-ordinators see projects they co-ordinate or lead. Everyone else sees projects they are rostered on, or have a task on (a Lead also via their team). | `visibleProjectIds`, `canAccessProject` |
| Tasks | Admin and Co-ordinator see every task in their projects; a Lead sees their team's; others see tasks assigned to them or that they are responsible for; anyone rostered as Lead/Co-ordinator on a project sees all of its tasks. | `taskVisibilityFilter`, `canSeeTask` |
| Creating tasks | Admin/Lead/Co-ordinator, project Lead/Co-ordinators, and BD/Developers rostered on the project (Developers may only assign within the roster unless `canAssignAnyone`). | `canCreateProjectTasks` |
| Task files | Upload/download: can see the task, or rostered on its project. Delete: an editor or an assignee of that task, and the file must belong to that task. | `canUseTaskFiles` |
| Someone else's time log or remark | Admin/Lead/Co-ordinator, on a project they can access. Owners can always remove their own. | route checks |
| Users | Admin manages everyone. HR manages non-Admins, can't grant Admin, can't change their own role. | `canManageStaff`, `staffChangeRefusal` |
| Performance | Reporting Manager (Admin or Lead) rates and comments; a Lead only for their reports; HR rates the HR section and downloads the Word form. | `canEditPerformance`, `canDownloadPerformance` |
| Financials, audit | Hidden from Developers; project audit for Admin/Lead/Co-ordinator. | `canSeeProjectFinancials`, `canSeeProjectAudit` |
| Settings, backups, email log, clients edit | Admin only. | `canManageUsers` |

## Engineering roles

`DomainUser.role`, one per account.

| Role | In one line |
| --- | --- |
| **Admin** | Runs the module: people, projects, allocations, KPIs. |
| **CEO** | Read-only portfolio view: dashboard, projects, forecast, resource engagement. |
| **Lead** | Manages projects and people, approves submissions; can also hold tags. |
| **TeamLead** | Supervises (approvals, forecast, people) and also does hands-on work. |
| **SME** | Hands-on: holds tags, submits deliveries, works Engineering tasks. |
| **Actionee** | Hands-on, as SME. |

| Screen | Who |
| --- | --- |
| Dashboard, Projects | Everyone, including CEO |
| My tags | Lead, TeamLead, SME, Actionee (tag holders) |
| Task log | Admin, Lead, TeamLead, SME, Actionee |
| Approvals, People | Admin, Lead, TeamLead (supervisors) |
| Forecast, Resource engagement | Supervisors + CEO |
| KPIs | Admin |

Source of truth: `demo/lib/domain.ts` (`SUPERVISOR_ROLES`, `PORTFOLIO_VIEWER_ROLES`, `TAG_HOLDER_ROLES`, `WORKING_ROLES`) and `requireDomainRole` in each `/api/domain/*` route.

## Accounts and sign-in

- Passwords: 10+ characters with a letter and a digit or symbol; stored with bcrypt.
- Sessions: 30 days, httpOnly + Secure + SameSite=Lax cookie; the database stores only the token's SHA-256. Any password change (self, admin reset, reset link) ends the account's other sessions.
- Lockout: 5 failed attempts per account / 50 per IP in 15 minutes (failures only).
- First admin: while a module has no users, its sign-up/bootstrap form creates an Admin. If `SETUP_TOKEN` is set, that form also asks for it.
- Forgot password (Tracker): a single-use 60-minute link by email. Without SMTP configured, the link waits in the Admin email log to be forwarded; with SMTP on, the log keeps no link.
