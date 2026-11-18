# Tracker API v1 (PM Inventive integration)

REST API for service accounts, under `/api/v1`. Built against the PM Inventive
"Tracker APIs" PRD. The full contract is served as OpenAPI 3.1 at
**`GET /api/v1/openapi.json`**.

## Getting a token

A service account is a `User` with `isServiceAccount = true`. It has no usable
password, cannot sign in to the UI, and is hidden from every people list and
picker.

```sh
# local, or inside the app container in production
npx tsx scripts/create-service-token.ts pm-inventive@inventivebizsol.co.in "PM Inventive" prod
```

The token (`trk_…`) is printed **once**. Put it straight into the password
manager (S-7). Only its SHA-256 hash is stored.

Admin-only management endpoints (cookie session):

| Call | Purpose |
| --- | --- |
| `GET /api/admin/service-accounts` | Accounts and their tokens (prefix, created, last used, revoked) |
| `POST /api/admin/service-accounts` `{ email, name?, tokenName? }` | Create the account if needed and issue a token |
| `PATCH /api/admin/service-accounts/{id}` `{ active: false }` | **Kill switch** (S-6): every token stops on the next request |
| `DELETE /api/admin/service-accounts/{id}/tokens/{tokenId}` | Revoke one token (rotation) |

## Conventions

- `Authorization: Bearer <token>`. Wrong or revoked token → 401 `unauthorized`; disabled account → 401 `account_disabled`.
- Errors: `{ "error": { "code", "message", "field" } }`.
- Lists: `?page=1&page_size=50` (max 200) → `{ items, total, page, page_size }`.
- Dates are `YYYY-MM-DD`; timestamps are ISO-8601 UTC.
- Every write accepts `source_note` (≤ 500 chars) and `on_behalf_of_user_id`.
- `POST` accepts `Idempotency-Key`. A repeat within 24h replays the first result (header `Idempotent-Replayed: true`).
- `updated_since` works on users, projects, sprints and tasks.
- Rate limit: 120 requests/min per token (`API_V1_RATE_PER_MIN`), then 429 with `Retry-After`.
- Every request is logged in `ApiRequestLog` (who, method, path, status, duration) (S-8).

## Endpoints

All 21 from the PRD, plus `GET /sprints/{id}` and `GET /openapi.json`.

`/auth/me` · `/users` · `/users/{id}` · `/projects` · `/projects/{id}` ·
`/sprints` (GET, POST) · `/sprints/{id}` (GET, PATCH) · `/sprints/{id}/summary` ·
`/tasks` (GET, POST) · `/tasks/{id}` (GET, PATCH) · `/tasks/bulk-update` ·
`/tasks/{id}/comments` (GET, POST) · `/tasks/{id}/history` ·
`/tasks/{id}/dependencies` (GET, POST) · `/meta/statuses` · `/meta/priorities`

## Field mapping (PRD name → tracker)

| PRD field | Tracker | Notes |
| --- | --- | --- |
| user `id` | `User.id` | **String** (cuid), not int |
| `weekly_capacity_hours` | `User.capacityPerWeek` | default 40 |
| `timezone` | — | Constant `Asia/Kolkata` (`API_V1_DEFAULT_TIMEZONE`) |
| `role` | `User.primaryRole` | Admin, Lead, Coordinator, HR, BusinessDeveloper, Developer |
| project `key` | `Project.key` (new) | Falls back to `P<id>` until set |
| project `status` | `Project.status` | Discovery, Active, On Hold, Delivered (filter is case-insensitive) |
| `target_end_date` | `Project.targetDate` | |
| `member_ids` | `ProjectMember.userId` | |
| task `key` | — | `<project key>-<task id>`, e.g. `CRM-142`. `q=CRM-142` finds it |
| `assignee_id` | `TaskAssignee` | Tasks can have several assignees. Read: `assignee_id` is the first, `assignee_ids` lists all. Write: `assignee_id` **adds** that person (no-op if already on it); `remove_assignee_id` takes one off; `assignee_ids` replaces the whole list (`[]` = unassigned). `assignee_id: null` is 422. History records the change as `assignee_ids` old → new |
| `reporter_id` | `Task.responsibleId` | "Person Responsible" |
| `estimate_hours` | `Task.estimatedHours` | |
| `logged_hours` | sum of `TimeEntry.hours`, else `Task.actualHours` | read-only |
| `due_date` | `Task.targetDate` | |
| `sprint_id`, `parent_id`, `progress_percent`, `blocked_reason`, `tags` | new `Task` columns | |
| `blocked` | derived from `status == "Blocked"` | Writing `true` sets Blocked; `false` moves a Blocked task to In Progress |
| comments | `Remark` | plus new `onBehalfOfUserId`, `sourceNote` |
| history | `TaskHistory` (new) | Field-level, API writes only. UI-made changes are in the project History tab (`AuditEntry`) |

**Statuses** (workflow order): `To Do`, `In Progress`, `In review`, `Blocked`, `Hold`, `Done`, `Cancelled`.
Input is matched without regard to case or spacing, so `In Review` and `done` are accepted.
`Cancelled` is dropped work: it closes the task like `Done` (no longer open, never overdue,
not carried forward) but is **left out of performance evaluation** entirely and out of sprint
planned/done counts (`cancelled_tasks` in the sprint summary).
`Hold` is paused work: it is not finished (no `completed_at`) but is never overdue, not carried
forward and can't be added to a sprint. While on hold it is left out of performance evaluation,
project progress and sprint planned/done counts (`on_hold_tasks` in the sprint summary). Move it
back to any open status to resume.

**Priorities** (low → high): `Low`, `Medium`, `High`, `Critical`.

## Guardrails (enforced server-side)

| | |
| --- | --- |
| S-1 | No performance, rating, KPI, pay or review data in any shape. `/api/v1/performance…`-style paths return 403. The cookie-based `/api/performance/*` routes return 401 to bearer tokens |
| S-2 | `DELETE` on any `/api/v1` path → 403 |
| S-3 | No user, role or permission endpoints. Comments can only be added, never edited |
| S-4 | Any body field outside the writable list → 403 `forbidden_field` naming the field |
| S-5 | Each task write → `TaskHistory` rows (`changed_by` = service account, `on_behalf_of_user_id`, `source_note`) **and** an `AuditEntry` by "PM Inventive", which shows in the UI History tab |
| S-6 | Kill switch: see above |

## Sprints in the UI

The **Sprints** page (`/sprints`, in the sidebar for Admin, Lead, Co-ordinator, HR and
Developer) lists sprints by Active / Planned / Closed with planned-vs-done progress. The
project's managers (Admin, Lead, Co-ordinator, or the project's own Lead/Co-ordinator) can
create a sprint, edit it, start / close / reopen it, add open tasks and move tasks back to the
backlog. Everyone else sees it read-only. Sprints are never deleted. It uses the cookie
routes `GET/POST /api/sprints`, `PATCH /api/sprints/{id}` and `GET/POST /api/sprints/{id}/tasks`.

## Data safety

The migration `20261116120000_api_v1_pm_inventive` is additive only: new
tables, nullable or defaulted columns, no drops. Sprints and task history are
included in the admin JSON backup/restore. Tokens are left out, as sessions are.
