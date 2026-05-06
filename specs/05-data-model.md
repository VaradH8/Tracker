# 05 — Data Model

PostgreSQL 16. All tables use `BIGSERIAL` primary keys. Timestamps in UTC. All tables include `created_at` and `updated_at` (triggers update the latter).

## Schema diagram (logical)

```
users ──┬── user_team_roles ──┬── teams ──┬── projects ── tasks ──┬── task_assignees ── (back to users)
        │                                                          ├── remarks
        │                                                          └── audit_log entries
        │
        └── notifications
        └── sessions
        └── password_reset_tokens
        └── invite_tokens
```

## Tables

### users

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `email` | VARCHAR(255) | UNIQUE NOT NULL | lowercase normalized |
| `name` | VARCHAR(120) | NOT NULL | display name |
| `password_hash` | VARCHAR(255) | NULL on invite, set on first login | bcrypt |
| `is_admin` | BOOLEAN | NOT NULL DEFAULT false | global admin flag |
| `is_active` | BOOLEAN | NOT NULL DEFAULT true | false = deactivated |
| `last_login_at` | TIMESTAMP | NULL | |
| `notification_prefs` | JSONB | NOT NULL DEFAULT '{}' | per-category toggles |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Index: `email`, `is_active`.

### teams

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `name` | VARCHAR(120) | UNIQUE NOT NULL | |
| `description` | TEXT | NULL | |
| `is_archived` | BOOLEAN | NOT NULL DEFAULT false | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Index: `is_archived`.

### user_team_roles

The `(user, team, role)` triple. One user can have multiple rows (one per team).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | |
| `team_id` | BIGINT | FK → teams(id) ON DELETE CASCADE | |
| `role` | VARCHAR(20) | NOT NULL CHECK (role IN ('manager','user')) | only manager/user — admin lives on users.is_admin |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Constraint: `UNIQUE (user_id, team_id)`. Index: `team_id`.

### projects

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `team_id` | BIGINT | FK → teams(id) ON DELETE CASCADE | |
| `name` | VARCHAR(120) | NOT NULL | |
| `is_archived` | BOOLEAN | NOT NULL DEFAULT false | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Constraint: `UNIQUE (team_id, name)`. Index: `team_id, is_archived`.

### tasks

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `project_id` | BIGINT | FK → projects(id) ON DELETE CASCADE | |
| `team_id` | BIGINT | FK → teams(id) | denormalized for fast team-scoped queries |
| `sr_no` | INT | NOT NULL | per-project sequence; auto-assigned on create |
| `priority` | VARCHAR(10) | NOT NULL CHECK (priority IN ('Critical','High','Medium','Low')) | |
| `description` | TEXT | NOT NULL | task description |
| `effort_hours` | NUMERIC(6,2) | NULL | estimated effort, NULL = TBD |
| `effort_note` | VARCHAR(60) | NULL | preserves original spreadsheet text like "8 hrs (Max)" |
| `actual_hours` | NUMERIC(6,2) | NULL | logged on Done |
| `start_date` | DATE | NULL | |
| `target_date` | DATE | NULL | |
| `status` | VARCHAR(15) | NOT NULL DEFAULT 'To Do' CHECK (status IN ('To Do','In Progress','Blocked','Done')) | |
| `is_important` | BOOLEAN | NOT NULL DEFAULT false | drives org dashboard |
| `import_notes` | TEXT | NULL | unparsed values from xlsx import (e.g., "TBD") |
| `created_by` | BIGINT | FK → users(id) | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Constraint: `UNIQUE (project_id, sr_no)`. Indexes: `team_id, status`, `target_date`, `is_important WHERE is_important = true`, `status WHERE status != 'Done'`.

Computed (not stored) — `is_overdue = (target_date < CURRENT_DATE AND status != 'Done')`. Compute at read time.

### task_assignees

Multi-assignee join table.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `task_id` | BIGINT | FK → tasks(id) ON DELETE CASCADE | |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | |

PK: `(task_id, user_id)`. Index: `user_id` (for "my tasks" queries).

### remarks

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `task_id` | BIGINT | FK → tasks(id) ON DELETE CASCADE | |
| `author_id` | BIGINT | FK → users(id) | |
| `body` | TEXT | NOT NULL | |
| `mentions` | BIGINT[] | NOT NULL DEFAULT '{}' | array of user_ids @mentioned |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Index: `task_id, created_at`.

### audit_log

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `actor_id` | BIGINT | FK → users(id) | who did it |
| `action` | VARCHAR(40) | NOT NULL | e.g., 'task.create', 'task.status_change', 'task.reassign', 'task.delete', 'team.create', 'user.invite', 'user.role_change', 'task.mark_important' |
| `team_id` | BIGINT | NULL | team context (null for global actions) |
| `task_id` | BIGINT | NULL | |
| `target_user_id` | BIGINT | NULL | for user-related actions |
| `before` | JSONB | NULL | snapshot of relevant fields before change |
| `after` | JSONB | NULL | snapshot of relevant fields after change |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Indexes: `team_id, created_at DESC`, `actor_id, created_at DESC`, `created_at DESC` (for global feed).

### notifications

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | recipient |
| `kind` | VARCHAR(40) | NOT NULL | 'task.assigned', 'task.status_change', 'task.mention', 'task.blocked' (manager-only), 'task.marked_important', 'manager.weekly_summary', 'user.overdue_digest' |
| `task_id` | BIGINT | NULL | optional link |
| `actor_id` | BIGINT | NULL | who triggered it |
| `payload` | JSONB | NOT NULL DEFAULT '{}' | extra context (e.g., before/after status) |
| `is_read` | BOOLEAN | NOT NULL DEFAULT false | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Indexes: `user_id, is_read, created_at DESC`.

### sessions

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | also session cookie value |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | |
| `expires_at` | TIMESTAMP | NOT NULL | sliding 12h |
| `last_seen_at` | TIMESTAMP | NOT NULL DEFAULT now() | |
| `ip_address` | VARCHAR(45) | NULL | |
| `user_agent` | TEXT | NULL | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

Index: `user_id`, `expires_at`.

### password_reset_tokens

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `token_hash` | VARCHAR(64) | PK | sha256 of token sent in email |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | |
| `expires_at` | TIMESTAMP | NOT NULL | 24h from issue |
| `used_at` | TIMESTAMP | NULL | one-time use |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

### invite_tokens

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `token_hash` | VARCHAR(64) | PK | sha256 of token in invite link |
| `user_id` | BIGINT | FK → users(id) ON DELETE CASCADE | |
| `expires_at` | TIMESTAMP | NOT NULL | 24h |
| `used_at` | TIMESTAMP | NULL | |
| `created_at` | TIMESTAMP | NOT NULL DEFAULT now() | |

### system_settings

Single-row config table (`SELECT * WHERE id = 1`).

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | INT | PK = 1 (CHECK id = 1) | enforce singleton |
| `working_hours_per_day` | NUMERIC(4,2) | 8.0 | |
| `timezone` | VARCHAR(50) | 'Asia/Kolkata' | IANA tz |
| `smtp_host` | VARCHAR(255) | NULL | |
| `smtp_port` | INT | 587 | |
| `smtp_user` | VARCHAR(255) | NULL | |
| `smtp_password_encrypted` | TEXT | NULL | encrypted at rest |
| `smtp_from_address` | VARCHAR(255) | NULL | |
| `updated_at` | TIMESTAMP | now() | |

## Data normalization rules (xlsx import)

- **Priority** mapping: `P1` → `Critical`, `P2` → `High`, `High`/`high `/`HIGH` → `High`, `Medium` → `Medium`, blank → `Medium`, anything else → `Medium` with warning logged
- **Effort**: extract numeric prefix from text (`8 hrs` → 8.0, `8 Hrs(Max)` → 8.0 with `effort_note='8 Hrs(Max)'`, `TBD` → null with `effort_note='TBD'`)
- **Dates**: accept ISO `YYYY-MM-DD`, `dd/mm/yyyy`, and Excel serials (e.g., 46147 → 2026-04-15). Failures logged to `import_notes`.
- **Person Responsible**: split on `+`, `,`, `&`, normalize whitespace and case, fuzzy-match to existing users (Levenshtein ≤ 2 or substring match), unmatched names go to reconciliation queue
- **Status**: free text in spreadsheet → mapped: blank/`To Do` → `To Do`, `In progress`/`InProgress`/`In Progress` → `In Progress`, `Blocked`/`Hold` → `Blocked`, `Done`/`Completed`/`Closed` → `Done`

## Required seed data

On first deploy:
1. Insert one admin user (email + bcrypt(initial password) from env vars)
2. Insert system_settings row with id=1
3. No teams or projects — Admin creates via UI or import
