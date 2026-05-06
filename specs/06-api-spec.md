# 06 — API Specification

REST over HTTPS. JSON request/response bodies. Session cookie auth (`session_id` httpOnly, secure, SameSite=Lax, 12h sliding expiry).

All endpoints validate authorization server-side using the matrix in `docs/02-roles-and-permissions.md`. Unauthorized requests return `403`. Unauthenticated requests return `401`.

## Conventions

- All paths prefixed `/api/v1`
- Pagination: `?page=1&page_size=50` (max 200)
- Filtering: query params (e.g., `?status=Blocked&team_id=3`)
- Error response shape: `{ "error": { "code": "string", "message": "string" } }`
- Success response shape: bare resource OR `{ "data": ..., "meta": { "page": ..., "total": ... } }` for paginated
- Date fields in ISO 8601 (`YYYY-MM-DD` for dates, full ISO for timestamps)

## Endpoints

### Authentication

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{ email, password }` | sets cookie, returns `{ user }` |
| POST | `/auth/logout` | — | 204, clears cookie |
| GET | `/auth/me` | — | `{ user, teams: [...], is_admin }` |
| POST | `/auth/forgot-password` | `{ email }` | 204 (always, even if email not found) |
| POST | `/auth/reset-password` | `{ token, new_password }` | 204 |
| POST | `/auth/setup-account` | `{ token, name, password }` | 204 (sets initial password from invite) |
| POST | `/auth/change-password` | `{ current_password, new_password }` | 204 |

### Users (Admin only unless noted)

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/users` | filter `?status=active`, `?team_id=` | list of users |
| POST | `/users/invite` | `{ email, name, team_assignments: [{team_id, role}] }` | created user, sends invite email |
| GET | `/users/:id` | — | user with team assignments |
| PATCH | `/users/:id` | `{ name?, email?, is_active? }` | updated user |
| POST | `/users/:id/reset-password-link` | — | 204, sends reset email |
| POST | `/users/:id/team-assignments` | `{ team_id, role }` | adds row to user_team_roles |
| DELETE | `/users/:id/team-assignments/:teamId` | — | 204, removes from team |
| PATCH | `/users/:id/team-assignments/:teamId` | `{ role }` | updates role for that team |
| POST | `/users/bulk-assign` | CSV multipart upload | results summary |
| GET | `/users/me/notification-prefs` | (any user) | current prefs |
| PATCH | `/users/me/notification-prefs` | `{ ... }` | updated prefs |

### Teams

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/teams` | (all roles, filtered by access) | teams visible to caller |
| POST | `/teams` | Admin only. `{ name, description?, manager_user_ids: [] }` | new team |
| GET | `/teams/:id` | — | team with member count, project count |
| PATCH | `/teams/:id` | Admin only. `{ name?, description? }` | updated team |
| POST | `/teams/:id/archive` | Admin only | 204, soft-archive |
| POST | `/teams/:id/unarchive` | Admin only | 204 |
| GET | `/teams/:id/members` | — | list of (user, role) for this team |

### Projects (within a team)

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/teams/:teamId/projects` | — | list |
| POST | `/teams/:teamId/projects` | Manager+ only. `{ name }` | new project |
| PATCH | `/teams/:teamId/projects/:id` | Manager+ only. `{ name }` | updated |
| POST | `/teams/:teamId/projects/:id/archive` | Manager+ only | 204 |

### Tasks

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/tasks` | filter `?team_id=`, `?project_id=`, `?status=`, `?assignee_id=`, `?important=true`, `?overdue=true`, `?due_today=true`, `?due_within_days=7`, `?created_within_days=`, `?search=` | paginated list |
| GET | `/tasks/me` | tasks where caller is in task_assignees, optional `?team_id=` | paginated list |
| POST | `/teams/:teamId/projects/:projectId/tasks` | Manager+. `{ priority, description, effort_hours?, effort_note?, start_date?, target_date?, status?, is_important?, assignee_user_ids: [] }` | new task; sr_no auto-assigned |
| GET | `/tasks/:id` | — | full task with assignees, remarks count, audit count |
| PATCH | `/tasks/:id` | role-checked per field | updated task |
| DELETE | `/tasks/:id` | Manager+ | 204 |
| POST | `/tasks/:id/status` | (any assignee) `{ status, actual_hours?, blocker_reason? }` | task with new status |
| POST | `/tasks/:id/important` | Manager+. `{ is_important: bool }` | updated |
| POST | `/tasks/:id/assignees` | Manager+. `{ user_ids: [] }` | replaces assignees |

### Remarks

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/tasks/:id/remarks` | — | chronological list |
| POST | `/tasks/:id/remarks` | (any assignee + Manager+ on team). `{ body, mentions?: [] }` | new remark |

### Audit log

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/admin/audit` | Admin only. filter `?actor_id=`, `?action=`, `?team_id=`, `?from=`, `?to=` | paginated, reverse chronological |
| GET | `/teams/:id/audit` | Manager of team OR Admin. same filters | paginated |
| GET | `/tasks/:id/audit` | (any with task read access) | task-scoped audit |
| GET | `/admin/audit/export` | Admin. same filters | CSV download |

### Notifications

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/notifications` | caller's notifications. `?unread_only=true` | paginated |
| POST | `/notifications/:id/read` | — | 204 |
| POST | `/notifications/read-all` | — | 204 |

### Excel import / export

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| POST | `/admin/import/preview` | Admin. multipart xlsx | dry-run summary: `{ teams_to_create, projects_to_create, tasks_to_create, unmatched_names: [], warnings: [] }` |
| POST | `/admin/import/confirm` | Admin. `{ import_session_id, name_mappings: [{raw, user_id?, create_user?}] }` | counts + invites_sent |
| GET | `/admin/import/history` | Admin | last 20 imports |
| GET | `/exports/team/:teamId.xlsx` | (Manager+ on team OR Admin) | xlsx download |
| GET | `/exports/project/:projectId.xlsx` | (Manager+ on team OR Admin) | xlsx download |
| GET | `/exports/org.xlsx` | Admin | full org xlsx |

### Dashboard endpoints (aggregations)

| Method | Path | Returns |
|---|---|---|
| GET | `/dashboard/admin` | `{ stats: {active, overdue, important, done_this_week}, important_tasks: [], teams_summary: [] }` |
| GET | `/dashboard/my-day` | `{ greeting, stats: {due_today, overdue, important_mine, blocked_team?}, my_day: [], up_next: [] (User), team_attention: {} (Manager), recent_activity: [] }` |

The shape adapts based on caller's primary role context (Manager response includes `blocked_team` and `team_attention`; User response includes `up_next`).

### System (Admin only)

| Method | Path | Body / Notes | Returns |
|---|---|---|---|
| GET | `/admin/settings` | — | system settings |
| PATCH | `/admin/settings` | partial fields | updated settings |
| GET | `/admin/health` | — | `{ db: 'ok', email: 'ok', last_backup_at, disk_usage }` |

## Background jobs (not HTTP endpoints, but spec'd here)

- **9 AM IST daily**: send overdue digest emails to users with at least one overdue task
- **8 AM IST Monday**: send weekly team summary to all Managers (per team)
- **Nightly 2 AM IST**: pg_dump → upload to S3, encrypted, with 14-day lifecycle
- **Hourly**: clean up expired sessions, expired password reset tokens, expired invite tokens

## Rate limits

- `/auth/login`: 5 requests / minute / IP
- `/auth/forgot-password`: 3 requests / minute / IP
- All other endpoints: 120 requests / minute / authenticated session

## CSRF protection

POST/PATCH/DELETE require an `X-CSRF-Token` header that matches a token in the session. Token issued on login, returned in `/auth/me`.
