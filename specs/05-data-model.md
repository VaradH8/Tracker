# 05 — Data model

PostgreSQL 16 via Prisma 6. The schema is `demo/prisma/schema.prisma`; every change ships as a migration in `demo/prisma/migrations/` and is applied on boot with `prisma migrate deploy`. Extras Prisma can't express (partial unique indexes) live in `demo/prisma/post-push.sql`, re-run on every boot.

The two modules share the database but not their tables: Engineering tables are all prefixed `Domain`.

## Rules for schema changes

- **Additive by default.** New columns are nullable or defaulted; nothing is dropped or renamed in place.
- **Data-changing migrations must be safe to re-run** (guard with a `WHERE` that skips rows already converted — see `20261116000000_hash_session_ids`).
- **The seed only fills an empty database** (`RUN_SEED=1` on first boot).
- **Backups follow the schema automatically**: the JSON backup (`lib/backup-tables.ts`) reads the model list from Prisma, so a new table is included the day it is added.

## Tracker (20 models)

| Model | Columns | References |
| --- | --- | --- |
| `User` | 27 | User |
| `PasswordResetToken` | 5 | User |
| `Session` | 4 | User |
| `Client` | 8 | — |
| `Project` | 13 | Client |
| `ProjectMember` | 4 | Project, User |
| `Task` | 21 | Project, User, Task |
| `TaskAssignee` | 3 | Task, User |
| `TaskDependency` | 3 | Task |
| `TaskAttachment` | 8 | Task, User |
| `TimeEntry` | 9 | Task, User |
| `Remark` | 5 | Task, User |
| `AuditEntry` | 8 | User |
| `Notification` | 8 | User |
| `EmailLog` | 8 | User |
| `Leave` | 8 | User |
| `AppSettings` | 7 | — |
| `ResourceForecast` | 10 | Project |
| `PerformanceReview` | 8 | User |
| `PipelineDeal` | 10 | — |

Notes:

- `User.primaryRole` is the global role; `ProjectMember.role` is the per-project lane (Lead / Coordinator / Developer / BD).
- `User.reportingManagerId` (self-reference) defines a Lead's team and who rates a review.
- `Task.forkedFromId` (self-reference) records fork lineage; `Task.reopenCount` counts rework.
- `Session.id` and `PasswordResetToken.id` are SHA-256 hashes of the secret in the cookie or link, never the secret itself.
- `EmailLog` is the audit trail of every email the app produced; with SMTP on, reset emails are logged without their link.

## Engineering (18 models)

| Model | Columns | References |
| --- | --- | --- |
| `DomainUser` | 11 | — |
| `DomainEmployee` | 13 | DomainUser |
| `DomainSession` | 4 | DomainUser |
| `DomainProject` | 13 | DomainUser |
| `DomainDivision` | 3 | — |
| `DomainProjectDivision` | 5 | DomainProject, DomainDivision |
| `DomainAllocation` | 10 | DomainProject, DomainUser |
| `DomainTagAssignment` | 14 | DomainProject, DomainDivision, DomainUser |
| `DomainDeliveryCorrection` | 7 | DomainTagAssignment, DomainUser |
| `DomainTagSubmission` | 13 | DomainTagAssignment, DomainUser |
| `DomainTask` | 24 | DomainProject, DomainDivision, DomainUser |
| `DomainDefaultReviewer` | 4 | DomainUser |
| `DomainTaskReviewer` | 7 | DomainTask, DomainUser |
| `DomainTaskAttachment` | 9 | DomainTask, DomainUser |
| `DomainTaskEvent` | 7 | DomainTask, DomainUser |
| `DomainWorkLog` | 8 | DomainUser, DomainProject, DomainTask |
| `DomainHoliday` | 4 | — |
| `DomainLeave` | 13 | DomainUser |

Notes:

- `DomainSession.id` is hashed the same way as `Session.id`.
- `DomainTaskAttachment` files live on the shared uploads volume under `domain/<taskId>/`; Tracker attachments under `<taskId>/`. Only the path is stored.

## Files on disk

Attachments are written to `UPLOAD_DIR` (`/uploads`, the `tracker_uploads` volume) with random file names; the original name is kept in the database for display. The nightly `pg_dump` does **not** include this volume — see [08-deployment](./08-deployment.md).
