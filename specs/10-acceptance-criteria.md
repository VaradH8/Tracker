# 10 — Acceptance Criteria (Definition of Done for MVP)

The MVP is considered shipped when **every** item below is verified.

## Functional

### Authentication & user management
- [ ] Admin user is created on first deploy from env vars
- [ ] Admin is forced to change password on first login
- [ ] Admin can invite a new user; user receives a magic-link email valid for 24 hours
- [ ] User clicks invite link, sets a password, lands on My Day
- [ ] User can request password reset; reset email arrives; reset works
- [ ] Sessions expire after 12 hours of inactivity (sliding)
- [ ] Logout clears session

### Permissions
- [ ] An automated test suite exists asserting: a User of Team A cannot edit any task in Team B (verified for every write endpoint)
- [ ] A Manager cannot create a new Team (only Admin)
- [ ] A Manager cannot invite a user (only Admin)
- [ ] A User cannot edit description, priority, dates, or assignment on any task — including their own
- [ ] A User cannot mark a task Important
- [ ] A User cannot delete a task
- [ ] A deactivated user cannot log in but their historical data is intact

### Tasks workflow
- [ ] Manager can create a task with multiple assignees (e.g., "Ankit + Vishal + Adil")
- [ ] Status transitions work: To Do → In Progress → (Blocked) → In Progress → Done
- [ ] When marking Done, prompt for actual hours appears; it defaults to estimated effort
- [ ] When marking Blocked, prompt for blocker reason appears; reason is saved as a remark and Manager(s) are notified
- [ ] Manager can toggle Important; star appears on the card; task shows on Admin Org Dashboard
- [ ] Inline edits on the board work for Manager (status, target date, priority, effort)
- [ ] Manager can reassign a task; both old and new assignees notified
- [ ] Drag-and-drop between Kanban columns updates status

### Dashboards
- [ ] Admin lands on Org Dashboard showing 4 stat cards + Important Tasks table + Per-Team Summary
- [ ] Manager lands on My Day with greeting, 4 stats, My Day list, Team Needs Attention, Recent Activity
- [ ] User lands on My Day with greeting, 3 stats, My Day list, Up Next, Recent Updates
- [ ] All counts on stat cards match the underlying data (verified by spot-check)
- [ ] Overdue calculation: a task with `target_date < today AND status != Done` is flagged as overdue everywhere

### Notifications
- [ ] Task assigned → assignee gets in-app notification + email
- [ ] Task marked Blocked → all Managers of that team get notified
- [ ] @mention in remark → mentioned user gets notification
- [ ] Daily 9 AM IST overdue digest email arrives for users with at least one overdue task; not sent if none
- [ ] Weekly Monday 8 AM IST team summary arrives for Managers

### Excel import / export
- [ ] All 7 teams from `Ongoing_Projects.xlsx` import with zero data loss
- [ ] Every task row appears as a Task in the system
- [ ] Names like "ADHIL", "Sanjay J.", "Abhishek& Kiran" land in reconciliation queue (not silently dropped)
- [ ] Priority values normalize correctly (P1 → Critical, P2 → High, blank → Medium)
- [ ] Effort strings like "8 hrs", "8 Hrs(Max)", "TBD" parse correctly
- [ ] Date formats (ISO, dd/mm/yyyy, Excel serial) all parse correctly
- [ ] Export of any single team produces a `.xlsx` that opens in Excel with the same column order as the original sheet
- [ ] Round-trip: import original xlsx, then export, then re-import the export — task count preserved

### Audit
- [ ] Every task field change creates an audit entry with actor, timestamp, before, after
- [ ] Admin can view the global audit log
- [ ] Manager can view their team's audit log only
- [ ] Audit log can be filtered by user, team, action type, date range
- [ ] Audit log exports to CSV

### Cross-team viewing
- [ ] User can browse other teams' boards in read-only mode
- [ ] No edit affordances are visible for read-only access (no drag, no inline edits, no New Task button)

## Non-functional

### Visual
- [ ] All screens use Google color palette as specified in `docs/04-screens.md`
- [ ] Headings, stat numbers, table headers use Space Grotesk
- [ ] Body text, buttons, pills use Poppins
- [ ] Logo shows the four-dot Google color sequence
- [ ] Overdue cards have red left border
- [ ] Important cards have yellow background
- [ ] Mobile-width browser (≤720px) renders Kanban as 2 columns instead of 4

### Performance
- [ ] P95 page load < 1.5s on the EC2 box, with 30 active users
- [ ] P95 API response < 300ms
- [ ] Team board with 100 tasks renders in < 1s

### Security
- [ ] HTTPS only (Caddy auto-redirects 80 → 443)
- [ ] Passwords are bcrypt-hashed
- [ ] Session cookies are httpOnly, secure, SameSite=Lax
- [ ] CSRF token required on all state-changing requests
- [ ] Rate limit on `/auth/login` (5/min/IP)
- [ ] Rate limit on `/auth/forgot-password` (3/min/IP)
- [ ] All API endpoints enforce authorization server-side (verified by attempting actions as the wrong role)

### Operational
- [ ] Nightly backup runs at 2 AM IST and uploads to S3
- [ ] Backup files are encrypted (gpg or openssl) before S3 upload
- [ ] Restore drill: wipe DB on a staging container, restore from last night's S3 dump, app comes up healthy
- [ ] `/api/v1/admin/health` returns DB / email / disk / last-backup status
- [ ] Container logs rotate (max 30 days)

## Acceptance scenarios (live demo to leadership)

These are the demos to run after Phase 5 — if all pass, MVP is shipped.

1. **Admin onboarding scenario**: Admin uploads `Ongoing_Projects.xlsx`, reconciles 9 names, confirms import. All 7 teams visible. 9 invite emails sent. Demo team Samanvay's board renders with all tasks.

2. **Manager Monday morning scenario**: Manager Manasi logs in, lands on My Day. Sees today's overdue task ("Comment Classification API bug"). Opens it, posts a remark "@Abhishek please update". Then opens Team Board, creates a new task for next sprint, marks it Important. Total time: < 5 minutes.

3. **User daily scenario**: User Sanjana logs in on her phone. Sees My Day with 3 tasks due today. Drags one to In Progress. Hits a blocker on another, drags to Blocked, types reason. Manager Manasi gets a notification within 5 seconds. Total time: < 2 minutes.

4. **Cross-team coordination scenario**: User Priyanka (in Thermax P&ID) browses Samanvay's board read-only to check status of a dependency. Cannot drag, cannot edit — verified by trying. Goes back to her own My Tasks.

5. **Disaster recovery scenario**: Admin pulls last night's backup from S3, restores to a staging container, confirms last day's changes are present.

If all five scenarios pass, the MVP is signed off.
