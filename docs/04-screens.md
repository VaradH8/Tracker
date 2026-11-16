# 04 — Screens

Every page in `demo/app/`, who reaches it, and what it is for. Colours, type, widths and motion follow [design-system.md](./design-system.md).

## Public

| Route | Purpose |
| --- | --- |
| `/` | Landing page with a sign-in link |
| `/login` | Tabs for Tracker and Engineering sign-in; Engineering shows the first-admin form while it has no users |
| `/signup` | First Tracker admin only; closed once any user exists |
| `/forgot-password`, `/reset-password` | Reset-link request and redemption |

## Tracker (inside `AppShell`: sidebar + top bar)

| Route | Who | Purpose |
| --- | --- | --- |
| `/dashboard` | Admin | Org roll-up: stat cards, project timeline, workload and progress charts |
| `/analytics` | Admin | Deeper reporting |
| `/my-day` | Lead, Co-ordinator, HR, Developer | Today's queue, overdue first |
| `/my-tasks` | Lead, Co-ordinator, HR, Developer | Personal board by status; forkable colleague tasks |
| `/team` | Lead, Co-ordinator, HR | The people who report to me and their work |
| `/projects`, `/projects/[id]` | Everyone (scoped) | Project list; board, details, roster, history, import, delete (Admin, with undo) |
| `/calendar` | Everyone | Task dates and leave |
| `/resources` | Admin, Lead, Co-ordinator, HR | Per-person hours and workload |
| `/engagement` | Admin, Lead, Co-ordinator, HR | Who is on what; project forecasts |
| `/performance` | Admin, Lead (own team), HR | Reviews of others |
| `/my-performance` | Developer, Co-ordinator, HR | Own review and self-assessment |
| `/clients`, `/clients/[id]` | Admin, BD | Clients and their projects |
| `/leaves` | Everyone | Request, approve, see team availability |
| `/users` | Admin, HR | People admin |
| `/audit` | Admin | Audit log |
| `/settings` (+ `/users`, `/audit`, `/emails`, `/import`) | Admin | General, backup, email log, import |
| `/notifications`, `/profile` | Everyone | Notification list; own profile and password |

The **task drawer** opens over any page from a task link.

## Engineering (inside `DomainShell`: left rail)

| Route | Who | Purpose |
| --- | --- | --- |
| `/engineering` | Everyone incl. CEO | Role-specific home: what needs me / what do I owe |
| `/engineering/projects` | Everyone incl. CEO | Projects, divisions, deliveries |
| `/engineering/my-tags` | Tag holders | My allocations and submissions |
| `/engineering/task-log` | All but CEO | Submit and review work |
| `/engineering/approvals` | Supervisors | Approve or correct submissions |
| `/engineering/forecast` | Supervisors, CEO | Finish-date forecast |
| `/engineering/availability` | Supervisors, CEO | Resource engagement |
| `/engineering/kpis` | Admin | KPIs |
| `/engineering/users` | Supervisors | People |
| `/engineering/account` | Everyone | Own account and password |

## States every screen handles

| State | How |
| --- | --- |
| Loading | Skeleton placeholders (`components/Skeleton.tsx`) rather than a bare "Loading…" line |
| Empty | `components/EmptyState.tsx` |
| Error | A crash in a page, a chart or the task drawer is caught by `components/SectionErrorBoundary.tsx` — the rest of the app keeps working; `app/error.tsx` is the last resort |
| Offline | `components/OfflineBanner.tsx` warns that changes won't save until the connection returns |
| Permission denied | The API returns 403; `AppShell` redirects pages the role can't open |
| Success / undo | `components/Toast.tsx`, with an Undo action after deletes |
| Destructive actions | `ConfirmDialog` before deleting; undo window after |
| First run | `components/WelcomeCard.tsx`: three role-specific tips on the landing page (Tracker) or `/engineering`, until "Got it" (remembered per account in the browser) |

## Main action per screen

Each screen has one primary (filled blue) button for the job people come to it for; everything else is a ghost button or a link.

| Screen | Main action |
| --- | --- |
| My Day / My Tasks | Open a task (the drawer) |
| Projects | New project |
| Project page | New task |
| Task drawer | Change status / log time |
| Users | Add user |
| Clients | New client |
| Leaves | Request leave |
| Settings | Save changes |
| Engineering task log | Submit |
| Engineering approvals | Approve |

## Phones

The app is responsive down to 390 px (checked on every main page for both modules):

- Below `md` the sidebar becomes a slide-over menu (the same items, in the same order).
- Grids collapse to one column (`grid-cols-1` is always set, so a long word or a wide select can't stretch a column past the screen).
- Wide tables scroll sideways inside their card (`overflow-x-auto`) rather than being cut off.
- Button rows wrap.

## Accessibility baseline

- WCAG 2.2 AA is the target; `__tests__/a11y.test.tsx` runs axe-core in CI over shared components and the sign-in page.
- No text below 12 px.
- Icon-only buttons have an `aria-label` and the `tap-target` class: at least 24×24 px with a mouse, 44×44 px on touch screens.
- Form fields have labels tied to their inputs.
- Colour contrast is enforced on the tokens by `__tests__/design-tokens.test.ts` (every text colour ≥ 4.5:1 on every surface it sits on), and bright colours can't be used as text.
