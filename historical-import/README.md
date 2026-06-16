# Historical import drop zone

Bind-mounted into the app container at `/import` (read-only).

## How to use

1. Copy your weekly tracker CSVs into this folder on the VM, e.g.

       scp 'Ongoing Projects (3)-AMC.csv'    ubuntu@43.242.225.160:~/tracker/historical-import/
       scp 'Ongoing Projects (3)-POCs.csv'   ubuntu@43.242.225.160:~/tracker/historical-import/
       ...

2. Dry-run first — prints what it would create without touching the DB:

       cd ~/tracker
       docker compose exec app npx tsx scripts/import-historical.ts --dir /import --dry-run

3. Inspect the dry-run summary. If it looks right, run for real:

       docker compose exec app npx tsx scripts/import-historical.ts --dir /import

   The script is idempotent — running it twice does not duplicate
   data. Clients are matched by name; projects by (clientId, name);
   tasks by (projectId, title); users by email. Re-runs update
   status/dates/assignees on existing tasks rather than create
   copies.

## What gets created

- A `User` row for every person in the CSVs not already in the
  app. Password is `Tracker@2026` (passes the validator). Users
  should reset on first login via the "Forgot password?" link.
- A `Client` row for every external customer label (Praj, Toyo,
  Thermax, Saipem, Lurgi, KBR, Sangam, S2NERGY, Nugos, Honeywell,
  EEEC, Tetrapack, ...). The special `Internal` client absorbs
  rows whose label is actually a person (Anil Kadam, Mansi,
  Moreshwar).
- A `Project` row for every (Client × Service Area) combo that has
  tasks. Named `"Praj — AMC"`, `"Saipem — POCs"`, etc. Each project
  gets the Lead/Coordinator/Developer rosters from the team header
  at the top of the CSV.
- A `Task` row for every unique task (latest week wins — the CSV is
  rolling state). Status, priority, dates, assignees, estimated
  hours all carry across.
- A `Remark` for every non-empty Remark column.
- One `AuditEntry` with `action = "import.historical"` so the
  source is visible in the audit log.
