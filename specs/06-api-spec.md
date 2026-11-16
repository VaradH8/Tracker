# 06 — API

Every endpoint is a Next.js route handler under `demo/app/api/`. JSON in and out, except file uploads (`multipart/form-data`) and downloads.

## Conventions

- **Auth**: a cookie session — `tracker_session` for Tracker routes (`requireUser`), `domain_session` for `/api/domain/*` (`requireDomainUser`). No session → `401`; wrong role or object → `403` (or `404` when the object isn't the one named in the URL).
- **CSRF**: `demo/middleware.ts` refuses any POST/PUT/PATCH/DELETE to `/api/*` whose `Origin` isn't this site, or that the browser marks `Sec-Fetch-Site: cross-site` (`lib/csrf.ts`). Requests without an Origin (scripts, probes) pass.
- **Caching**: `/api/domain/*` answers `Cache-Control: no-store`.
- **Rate limits** (in-process, per container): sign-in 5 failures per account and 50 per IP per 15 min; forgot-password 3 per email and 10 per IP per 15 min; notifications 30 per actor per 5 min. Client IP = right-most `X-Forwarded-For` hop (`lib/client-ip.ts`; `TRUSTED_PROXY_HOPS` for more than one proxy).
- **Errors**: `{ "error": "<message for a person>" }` with the status code.
- **Tests**: every route has a permission test in `demo/__tests__/` asserting the wrong role gets `403`.

## Public endpoints

| Route | Why public | Protection |
| --- | --- | --- |
| `POST /api/auth/signin`, `POST /api/domain/auth/signin` | Sign-in | Failure-only lockout; generic errors |
| `POST /api/auth/signup`, `POST /api/domain/auth/bootstrap` | First admin | Closed once the module has a user; `SETUP_TOKEN` if set |
| `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` | Password reset | Always 200; rate-limited; 256-bit hashed single-use 60-min token |
| `POST /api/auth/signout`, `POST /api/domain/auth/signout` | Sign-out | POST only |
| `GET /api/health` | Container and uptime probe | Reports only up/down |

## Every route

Generated from the route files (`Extra checks` lists the permission helpers each one calls beyond the session).

| Path | Methods | Auth | Extra checks |
| --- | --- | --- | --- |
| `/api/admin/backup` | GET, POST | Tracker session | Admin |
| `/api/audit` | GET | Tracker session | oversight roles |
| `/api/auth/[...nextauth]` | GET, POST | Public | — |
| `/api/auth/change-password` | POST | Public | — |
| `/api/auth/forgot-password` | POST | Public | rate-limited |
| `/api/auth/reset-password` | POST | Public | — |
| `/api/auth/signin` | POST | Public | — |
| `/api/auth/signout` | GET, POST | Public | — |
| `/api/auth/signup` | GET, POST | Public | setup token |
| `/api/clients/[id]` | PATCH, DELETE | Tracker session | Admin |
| `/api/clients` | GET, POST | Tracker session | — |
| `/api/domain/allocations/[id]` | PATCH, DELETE | Engineering session | role list |
| `/api/domain/allocations/conflicts` | GET | Engineering session | role list |
| `/api/domain/allocations` | GET, POST | Engineering session | role list |
| `/api/domain/auth/bootstrap` | POST | Public | setup token |
| `/api/domain/auth/change-password` | POST | Engineering session | — |
| `/api/domain/auth/signin` | POST | Public | — |
| `/api/domain/auth/signout` | POST | Public | — |
| `/api/domain/divisions` | GET, POST | Engineering session | role list |
| `/api/domain/employees/[id]` | PATCH, DELETE | Engineering session | role list |
| `/api/domain/employees` | GET, POST | Engineering session | role list |
| `/api/domain/forecast` | GET | Engineering session | role list |
| `/api/domain/forecast/simulate` | POST | Engineering session | role list |
| `/api/domain/holidays/preview` | GET | Engineering session | — |
| `/api/domain/holidays` | GET, POST, DELETE | Engineering session | role list |
| `/api/domain/kpis` | GET | Engineering session | role list |
| `/api/domain/me/preferences` | GET, PATCH | Engineering session | — |
| `/api/domain/me` | GET, PATCH | Engineering session | — |
| `/api/domain/projects/[id]/deliveries` | GET | Engineering session | role list |
| `/api/domain/projects/[id]/free-resources` | POST | Engineering session | role list |
| `/api/domain/projects/[id]` | PATCH, DELETE | Engineering session | — |
| `/api/domain/projects` | GET, POST | Engineering session | role list |
| `/api/domain/resources/availability` | GET | Engineering session | role list |
| `/api/domain/tag-assignments/[id]` | PATCH, DELETE | Engineering session | role list |
| `/api/domain/tag-assignments/impact` | GET | Engineering session | role list |
| `/api/domain/tag-assignments` | GET, POST, DELETE | Engineering session | role list |
| `/api/domain/tag-submissions/[id]` | PATCH | Engineering session | role list |
| `/api/domain/tag-submissions` | GET, POST | Engineering session | — |
| `/api/domain/tasks/[id]/attachments/[attId]` | GET, DELETE | Engineering session | — |
| `/api/domain/tasks/[id]/attachments` | POST | Engineering session | — |
| `/api/domain/tasks/[id]` | PATCH, DELETE | Engineering session | — |
| `/api/domain/tasks` | GET, POST | Engineering session | role list |
| `/api/domain/users/[id]/fix-signin` | POST | Engineering session | role list |
| `/api/domain/users/[id]/password` | POST | Engineering session | role list |
| `/api/domain/users/[id]` | PATCH, DELETE | Engineering session | role list |
| `/api/domain/users` | GET, POST | Engineering session | role list |
| `/api/emails` | GET, DELETE | Tracker session | Admin |
| `/api/engagement/forecasts` | PUT, DELETE | Tracker session | oversight roles |
| `/api/engagement` | GET | Tracker session | oversight roles |
| `/api/engagement/track` | PATCH | Tracker session | oversight roles |
| `/api/health` | GET | Public | — |
| `/api/import` | POST | Tracker session | — |
| `/api/leaves/[id]` | DELETE | Tracker session | — |
| `/api/leaves` | GET, POST, PATCH | Tracker session | — |
| `/api/me` | GET | Tracker session | — |
| `/api/notifications/[id]` | PATCH | Tracker session | — |
| `/api/notifications` | GET, POST, PATCH, DELETE | Tracker session | Admin, project access, rate-limited |
| `/api/performance/me` | GET, PUT | Tracker session | — |
| `/api/performance/people/[id]` | PATCH | Tracker session | — |
| `/api/performance/people` | GET | Tracker session | — |
| `/api/performance/report/download` | GET | Tracker session | — |
| `/api/performance/report` | GET, PUT | Tracker session | — |
| `/api/pipeline/[id]` | DELETE | Tracker session | — |
| `/api/pipeline` | GET, POST, PATCH | Tracker session | — |
| `/api/projects/[id]/import-tasks` | POST | Tracker session | project access |
| `/api/projects/[id]/members` | POST | Tracker session | project lead/co-ord |
| `/api/projects/[id]` | GET, PATCH, DELETE | Tracker session | Admin, project access |
| `/api/projects` | GET, POST | Tracker session | — |
| `/api/resources/hours` | GET | Tracker session | — |
| `/api/settings` | GET, PATCH | Tracker session | Admin |
| `/api/tasks/[id]/approve` | POST, DELETE | Tracker session | project access |
| `/api/tasks/[id]/assignees` | POST | Tracker session | project access |
| `/api/tasks/[id]/attachments/[attId]` | GET, DELETE | Tracker session | project access, task files |
| `/api/tasks/[id]/attachments` | POST | Tracker session | project access, task files |
| `/api/tasks/[id]/dependencies` | POST | Tracker session | project lead/co-ord |
| `/api/tasks/[id]/fork` | POST | Tracker session | — |
| `/api/tasks/[id]/remarks/[remarkId]` | DELETE | Tracker session | project access |
| `/api/tasks/[id]/remarks` | POST | Tracker session | project access |
| `/api/tasks/[id]` | GET, PATCH, DELETE | Tracker session | project access, project lead/co-ord |
| `/api/tasks/[id]/status` | POST | Tracker session | project access |
| `/api/tasks/[id]/time-entries` | GET, POST | Tracker session | project access |
| `/api/tasks/[id]/timer` | POST | Tracker session | project access |
| `/api/tasks` | GET, POST | Tracker session | — |
| `/api/time-entries/[id]` | DELETE | Tracker session | project access |
| `/api/time-entries` | GET | Tracker session | — |
| `/api/timer/active` | GET | Tracker session | — |
| `/api/users/[id]` | PATCH, DELETE | Tracker session | Admin, Admin/HR |
| `/api/users` | GET, POST | Tracker session | Admin, Admin/HR |
