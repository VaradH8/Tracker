# 09 — Build Plan

A phased plan that lets you ship to users week by week. Each phase has a working demo at the end. Total: ~5 weeks of focused engineering.

## Phase 0 — Foundation (3 days)

**Goal**: an empty stack deployed on EC2 that returns a "Hello" page over HTTPS.

- [ ] Set up Git repo with the structure from `specs/07-tech-stack.md`
- [ ] Write `compose.yml`, `Caddyfile`, frontend & backend `Dockerfile`s
- [ ] Provision EC2, install Docker + Portainer
- [ ] Deploy stack via Portainer pointing at the Git repo
- [ ] Verify `https://tracker.<your-domain>` returns a placeholder page
- [ ] Set up `.env`, `.gitignore`, base `README.md`

**Done when**: `curl https://tracker.<domain>` returns 200 with a placeholder HTML.

---

## Phase 1 — Auth + data layer (1 week)

**Goal**: an Admin can log in, manually create teams/users via the API, and the database is wired correctly.

- [ ] Implement all SQLAlchemy models from `specs/05-data-model.md`
- [ ] Write Alembic migrations
- [ ] Write `seed.py` that creates the admin user from env vars on first boot
- [ ] Implement auth endpoints: login, logout, me, forgot-password, reset-password, setup-account, change-password
- [ ] Session middleware writing/reading from `sessions` table
- [ ] CSRF token issuance and validation
- [ ] Permissions module that checks role-per-team for any action
- [ ] Implement `/users`, `/teams`, `/users/:id/team-assignments` endpoints with full role enforcement
- [ ] Backend tests for permissions ("User of team A cannot edit team B")

**Done when**: Admin can log in, hit `/api/v1/teams` POST to create a team, hit `/api/v1/users/invite` to add a user with a role per team. All from a curl/Postman session — no UI yet.

---

## Phase 2 — Login UI + Team Board + My Tasks (1.5 weeks)

**Goal**: real users can log in and update tasks. This is the core daily workflow.

### Backend

- [ ] Implement task CRUD endpoints (`/tasks/*`)
- [ ] Implement remarks endpoints
- [ ] Implement project endpoints
- [ ] Audit log writes for every task mutation

### Frontend

- [ ] Set up Vite + React + Tailwind, font + color tokens from `docs/04-screens.md`
- [ ] Auth pages: Login, Forgot Password, Reset Password, Setup Account
- [ ] Top nav component (role-aware: shows different tabs for Admin / Manager / User)
- [ ] Team Board page with Kanban columns + drag-and-drop (`@dnd-kit`)
- [ ] Task Card component
- [ ] Task Drawer (slide-over) with all fields, role-conditional edit affordances
- [ ] My Tasks page (same Kanban, filtered to caller's assignments)
- [ ] Profile page (name, password change, notification prefs stub)

**Done when**:
- A Manager can log in, create a task, assign it, change its status by drag-and-drop, add a remark
- A User can log in, see their tasks, drag a card to In Progress, mark it Done with actual hours logged
- All edits are blocked appropriately by role on the server side (test with curl as a User trying to edit a task field)

---

## Phase 3 — My Day + Org Dashboard + Notifications (1 week)

**Goal**: each role lands on a useful, personalized dashboard. Notifications work.

- [ ] `/dashboard/admin` and `/dashboard/my-day` endpoints with proper aggregations
- [ ] Org Dashboard page (Admin)
- [ ] My Day page (Manager variant: greeting, today's stats, my day, team needs attention, recent activity)
- [ ] My Day page (User variant: greeting, today's stats, my day, up next, recent updates)
- [ ] Notifications system:
  - On every relevant event (task assigned, status changed by other, mention, blocked, important), insert into `notifications` table
  - Notification panel UI in top nav (🔔 with unread count, slide-out)
  - Per-category prefs in Profile
- [ ] Email sending: invite, password reset, daily overdue digest, weekly Manager summary
- [ ] APScheduler jobs in worker container for daily 9 AM digest and weekly Monday 8 AM summary

**Done when**:
- Manager logs in → sees "My Day" with today's tasks, blocked from team, recent activity
- User logs in → sees "My Day" with their queue
- Admin logs in → sees Org Dashboard with cross-team rollup
- An invite email arrives within 30 seconds
- A user with overdue tasks receives a digest email at 9 AM IST

---

## Phase 4 — Admin tools: Users, Teams, Audit, Import, Export (1 week)

**Goal**: Admin can fully manage the system from the UI; xlsx round-trips work.

- [ ] Admin → Teams page (CRUD)
- [ ] Admin → Users page (invite, bulk-assign, role-per-team editing, reset password, deactivate)
- [ ] Audit log endpoints + UI (global for Admin, team-scoped for Manager)
- [ ] Excel import:
  - `/admin/import/preview` parses `Ongoing_Projects.xlsx`, returns dry-run + unmatched names
  - Import wizard UI: upload → preview → reconcile → confirm
  - Atomic commit
  - Persist name mappings for re-import
- [ ] Excel export: `/exports/team/:teamId.xlsx`, `/exports/project/:projectId.xlsx`, `/exports/org.xlsx` — preserve original column order
- [ ] System Settings page (Admin only): SMTP, working hours, timezone

**Done when**:
- Admin imports the original `Ongoing_Projects.xlsx` end-to-end. Pilot team (Samanvay – Engg Memory) shows up in the system with all tasks intact, dates parsed, assignees mapped to users.
- Exporting that team produces a `.xlsx` that opens in Excel with the same column order as the source.

---

## Phase 5 — Hardening & cutover (3–4 days)

**Goal**: ship it.

- [ ] Backups: nightly pg_dump to S3 via worker; verify download + restore in staging
- [ ] Logs rotation, disk-usage monitoring
- [ ] Rate limits on `/auth/login` and `/auth/forgot-password`
- [ ] Error tracking (Sentry or simple file-based logger for MVP)
- [ ] Manual QA pass against `specs/10-acceptance-criteria.md`
- [ ] Pilot with one team (Samanvay) for a week
- [ ] Migrate remaining 6 teams over the next 2 weeks (one team / 2 days)
- [ ] Spreadsheet officially deprecated; export the system to xlsx weekly for the leadership digest

**Done when**: all acceptance criteria in `specs/10-acceptance-criteria.md` pass.

---

## Total timeline

| Phase | Duration | Cumulative |
|---|---|---|
| 0 — Foundation | 3 days | 3 days |
| 1 — Auth + data | 1 week | ~10 days |
| 2 — Core UI | 1.5 weeks | ~3 weeks |
| 3 — Dashboards + notifications | 1 week | ~4 weeks |
| 4 — Admin + xlsx | 1 week | ~5 weeks |
| 5 — Hardening + cutover | 3–4 days | ~5.5 weeks |

**MVP delivered: ~5–6 weeks** with one focused engineer using Claude Code, longer if part-time.

## Suggested pilot team

**Samanvay – Engg Memory** — has the cleanest existing data in the spreadsheet (real dates, statuses, multi-project structure with Saipem/Luggi/Thermax). It will surface real bugs faster than POCs (which has no data).
