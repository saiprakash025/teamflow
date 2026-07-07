# TeamFlow

A unified project management platform combining task planning, dependency-aware
workflows, root-cause-analysis (RCA) incident reviews, notifications, and reporting
into a single system — built as a systems engineering assignment.

## Overview

TeamFlow lets teams organize work across multiple projects, track tasks through a
Kanban/List/Calendar board, model dependencies between tasks (including circular-dependency
prevention and blocker enforcement), run structured RCA investigations with multi-reviewer
sign-off, and get a live activity/reporting view of project health — all behind role-based
permissions (admin / member / viewer) that are enforced on the server, not just hidden in
the UI.

## Tech Stack

**Client**
- React 18 (Vite)
- React Router v6
- Axios
- Context API for state (Auth, Theme, Toast) — no Redux; see Design Decisions for why
- Plain CSS with CSS custom properties for theming (no Tailwind/UI kit)

**Server**
- Node.js + Express (monolithic REST API)
- MongoDB + Mongoose
- JWT authentication (`jsonwebtoken`) + `bcryptjs` for password hashing
- Multer for local-disk file uploads (attachments)
- Node's built-in `EventEmitter` as an in-process event bus for notifications

## Features Implemented

- **Auth**: register/login, JWT-protected routes, session restore via `/api/me`
- **Projects**: create/update/delete, per-project membership with roles (admin/member/viewer),
  the creator is auto-added as an admin member
- **Tasks**: CRUD, status/priority/due date/assignee, self-referencing `parent` for subtasks,
  enforced status-transition rule (can't mark Done while a blocker or subtask is still open,
  with a specific machine-readable rejection reason)
- **Dependencies**: directed `blockedBy`/`blocks` relationships plus an explicit `TaskRelation`
  audit record; circular dependencies are rejected outright; unresolved blockers are surfaced
  as a non-blocking warning when adding a dependency (not when transitioning status — that's
  a hard block)
- **Cross-project linking**: a task can appear on a second project's board via
  `ProjectTaskLink` without being duplicated
- **Comments**: threaded (self-referencing `parentComment`) on both tasks and RCAs, with
  `@mention` autocomplete that triggers a notification
- **Attachments**: drag-and-drop upload with progress, backed by a local-disk Multer endpoint
- **Assignee overload warning**: non-blocking warning surfaced on task creation if the
  assignee already has more than 8 open tasks
- **RCA workflow**: four fixed sections (timeline, contributing factors, corrective actions,
  preventive measures), draft → submit → multi-reviewer approval, mandatory comment on every
  review decision, a single rejection keeps it open, admin override (reassign reviewer or
  force-close) logged as a distinct activity action
- **Notifications**: single event pipeline (in-app bell + email-log stub) covering assignment,
  status change, RCA submission, and review decisions; deduplicated on
  `(user, type, entityId)` within a rolling 10-minute window
- **Reports**: completion rate, workload per assignee, 8-week velocity, project-health signal,
  RCA counts by status — computed live, not cached
- **CSV export**: scoped to the requesting user's accessible projects and the active
  list-view filter
- **Activity log**: append-only, per-project or per-entity, actor/action/entity/payload
- **Permissions**: admin/member/viewer enforced server-side on every write route (project,
  task, RCA), not just hidden in the UI
- **View preference + theme**: stored per user per project (`ProjectPreference`), applied
  instantly with no page reload
- **UX**: loading skeletons, empty states, toast notifications, responsive layout (horizontal-
  scroll Kanban, collapsing list columns, full-screen drawer on mobile)

## Folder Structure

```
TeamFlow/
├── server/
│   ├── src/
│   │   ├── models/        # Mongoose schemas (User, Project, Task, Rca, TaskRelation,
│   │   │                  #   ProjectTaskLink, Notification, ActivityLog, ProjectPreference)
│   │   ├── routes/        # Express route handlers, one file per resource
│   │   ├── middleware/    # JWT auth guard
│   │   ├── utils/         # DB connection, permissions helpers, activity-log helper
│   │   ├── events/        # In-process notification event bus
│   │   ├── scripts/       # seed.js — creates test users
│   │   └── index.js       # app entry point
│   └── package.json
├── client/
│   ├── src/
│   │   ├── api/           # axios client + grouped endpoint calls
│   │   ├── context/       # Auth, Theme, Toast providers
│   │   ├── components/    # Navbar, ProtectedRoute, shared UI
│   │   ├── pages/         # Login, Register, Dashboard
│   │   ├── project/       # Project page, Kanban/List/Calendar, Reports, Activity
│   │   ├── tasks/         # Task drawer, form, comments, attachments, dependencies
│   │   ├── rca/           # RCA form, review, reviewer status, override dialog
│   │   └── notifications/ # Bell + panel
│   └── package.json
├── docs/
│   ├── DatabaseSchema.md
│   └── TeamFlow-Design-Document.pdf   # Architecture, ERD, business rules, API, decisions
└── README.md
```

## Setup

```bash
# server
cd server
cp .env.example .env      # fill in MONGO_URI and JWT_SECRET
npm install
npm run seed               # optional: creates test users, see below
npm run dev                # http://localhost:5000

# client (separate terminal)
cd client
cp .env.example .env
npm install
npm run dev                # http://localhost:5173
```

### Test accounts (after `npm run seed`)

| Email | Password | Role |
|---|---|---|
| sai@test.com | password123 | member (make this your main test account) | 
| rahul@test.com | password123 | member |
| priya@test.com | password123 | viewer |
| admin@test.com | password123 | global admin (use this to test RCA override) | 

## Environment Variables

**server/.env**
| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB Atlas (or local) connection string — include a database name in the path |
| `PORT` | API port (default 5000) |
| `JWT_SECRET` | Signing secret for access tokens |
| `JWT_REFRESH_SECRET` | Reserved for a future refresh-token flow — **not currently used** (see Limitations) |
| `CLIENT_URL` | Allowed CORS origin, e.g. `http://localhost:5173` |
| `SMTP_HOST` | Reserved for real email delivery — **not currently used**; email is a console-log stub (see Limitations) |

**client/.env**
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the API, e.g. `http://localhost:5000/api` |

## Assumptions

- One assignee per task (no multi-assignee support).
- A project's global admin role can never be self-assigned at registration — it must be
  granted by a trusted server-side action (e.g. the seed script), closing a privilege-
  escalation path that existed early in development.
- The project creator is automatically given an `admin` membership row so they are never
  locked out of their own project by the permission checks.
- A single notification pipeline serves both the in-app bell and "email" — in this build the
  email side is a console-log stub, not a real SMTP/provider integration.
- Dependency warnings (unresolved blockers) are informational at the point of *adding* a
  dependency; the *hard* block happens at status-transition time (moving a task to Done).

## Known Limitations

- **No refresh-token flow.** Access tokens expire after 15 minutes; the frontend logs the
  user out on a 401 rather than silently refreshing. `JWT_REFRESH_SECRET` is reserved for
  this but not wired up yet.
- **Notifications are polled** (every 30s) from the frontend, not pushed via WebSockets/
  Socket.IO — acceptable at this scale, but not truly real-time.
- **File storage is local disk**, served statically by Express. This does not survive a
  redeploy on ephemeral hosting and does not scale across multiple server instances —
  production would swap this for S3/Cloudinary with the URL stored in Mongo (interface is
  already isolated to one route, so the swap is contained).
- **Email is a stub** (`console.log`), not a real SMTP/provider send.
- **Calendar is month-view only**; no week view.
- **RCA/comment text fields are plain `<textarea>`**, not a rich-text editor.
- **Offline mode is not implemented** — the app requires a live connection to the API.
- The in-process `EventEmitter` notification bus only works within a single Node process;
  it would need to move to a real broker (Redis pub/sub, RabbitMQ, SQS) before running
  more than one server instance.

## API Overview

See `docs/TeamFlow-Design-Document.pdf` for the full endpoint list, request/response shapes,
and the reasoning behind each design decision (architecture, data model, and business rules).
