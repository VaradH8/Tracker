# 02 — Roles & Permissions

## The three roles

| Role | Scope | Description |
|---|---|---|
| **Admin** | Global | Full access across all teams. Manages users, teams, system settings. |
| **Manager** | Per-team | Full edit access within assigned team(s). Plans and chases work. |
| **User** | Per-team | Updates own assigned tasks. Read-only on everything else. |

## Important: roles are per-team (except Admin)

- **Admin** is a **global** role. One person, one role, applies everywhere.
- **Manager** and **User** are **per-team** roles. The same person can be a `Manager` in Team A and a `User` in Team B.

The system stores `(user_id, team_id, role)` tuples. A user with no entry for a given team has no access to that team (except read-only browsing if enabled).

## Permission matrix

| Action | Admin | Manager | User |
|---|:-:|:-:|:-:|
| **Authentication** | | | |
| Log in / log out | ✅ | ✅ | ✅ |
| Reset own password | ✅ | ✅ | ✅ |
| Change own profile (name, password) | ✅ | ✅ | ✅ |
| **Teams** | | | |
| Create team | ✅ | ❌ | ❌ |
| Archive team | ✅ | ❌ | ❌ |
| Edit team name/description | ✅ | ❌ | ❌ |
| Add/remove team members | ✅ | ❌ | ❌ |
| **Projects** | | | |
| Create project (within own team) | ✅ | ✅ | ❌ |
| Archive project (within own team) | ✅ | ✅ | ❌ |
| Edit project name | ✅ | ✅ | ❌ |
| **Tasks — create & delete** | | | |
| Create task (in own team) | ✅ | ✅ | ❌ |
| Delete task | ✅ | ✅ | ❌ |
| **Tasks — edit fields** | | | |
| Edit description | ✅ | ✅ | ❌ |
| Edit priority | ✅ | ✅ | ❌ |
| Edit start/target date | ✅ | ✅ | ❌ |
| Edit estimated effort | ✅ | ✅ | ❌ |
| Reassign Person Responsible | ✅ | ✅ | ❌ |
| Toggle "Important" flag | ✅ | ✅ | ❌ |
| **Tasks — own task only** | | | |
| Update status (own task) | ✅ | ✅ | ✅ |
| Log actual hours (own task, on Done) | ✅ | ✅ | ✅ |
| Add remark (own task) | ✅ | ✅ | ✅ |
| @mention others in remark | ✅ | ✅ | ✅ |
| **Users** | | | |
| Invite user | ✅ | ❌ | ❌ |
| Edit user role per team | ✅ | ❌ | ❌ |
| Deactivate / reactivate user | ✅ | ❌ | ❌ |
| Reset another user's password | ✅ | ❌ | ❌ |
| **Audit log** | | | |
| View global audit log | ✅ | ❌ | ❌ |
| View team-scoped audit log | ✅ | ✅ (own team) | ❌ |
| **Excel** | | | |
| Import xlsx | ✅ | ❌ | ❌ |
| Export xlsx (own team) | ✅ | ✅ | ✅ |
| Export xlsx (org-wide) | ✅ | ❌ | ❌ |
| **Cross-team viewing** | | | |
| View other teams' boards (read-only) | ✅ | ✅ | ✅ |
| **System** | | | |
| Configure SMTP, working hours, timezone | ✅ | ❌ | ❌ |
| View backup status | ✅ | ❌ | ❌ |

## Server-side enforcement rule

**Every API endpoint must check permissions on the server.** Never trust the client. Each task-mutating endpoint follows this pattern:

```
1. Authenticate the request (valid session?)
2. Identify the actor (user_id from session)
3. Identify the resource (task_id → team_id)
4. Look up actor's role in that team
5. Check the action is allowed by the matrix above
6. If yes, proceed; if no, return 403
```

## Special cases & edge rules

- **Multi-assignee tasks**: a task can have multiple users in `Person Responsible`. Any of them can update status / add remarks. All changes are logged with the actor's identity.
- **Manager editing own task**: when a Manager is also an assignee on a task they manage, they have Manager-level edit power (can edit description, dates, etc.)
- **User who is on multiple teams**: their permission for a given task is determined by their role in *that task's team*, not the highest role they hold elsewhere.
- **Admin in cross-team boards**: Admin can edit anything, anywhere. They effectively have Manager-level access to every team plus admin-only screens.
- **Deactivated users**: cannot log in, but their historical assignments and remarks are preserved (do not delete or reassign on deactivation).
