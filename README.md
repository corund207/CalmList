<div align="center">

# CalmList.

**Plan less. Finish more.**

A calm, keyboard-first task manager inspired by Todoist.<br />
Local-first in the browser, with an optional sync server you host yourself.

[**Open the app**](https://corund207.github.io/CalmList/app/) · [**Website**](https://corund207.github.io/CalmList/) · [Self-host](#self-hosting) · [Shortcuts](#keyboard-shortcuts)

[![CI and Pages](https://github.com/corund207/CalmList/actions/workflows/pages.yml/badge.svg)](https://github.com/corund207/CalmList/actions/workflows/pages.yml)
![Node 24](https://img.shields.io/badge/node-24-000000?labelColor=1d1d1f)
![License MIT](https://img.shields.io/badge/license-MIT-0071e3?labelColor=1d1d1f)

<img src="site/assets/today.png" alt="CalmList's Today view in the dark theme" width="100%" />

</div>

## Features

| | |
| --- | --- |
| **Smart quick add** | Type `Call Sam tomorrow at 4pm p1 #Work @phone` and the date, time, priority, project and label are picked out and highlighted as you type. |
| **Today & Upcoming** | Overdue tasks up top with one-click reschedule, a week strip, and day-by-day planning. |
| **Repeating tasks** | `every day`, `every weekday`, `every other week`, `every mon, fri at 9am`, `every! 3 days` (counts from completion). |
| **Projects, sections, boards** | Any project can be a list or a kanban board. Drag tasks to reorder or move them between sections. |
| **Sub-tasks, notes, comments** | A full task view with descriptions, deadlines, sub-tasks and a comment thread. |
| **Labels & filters** | Saved filters in a Todoist-style query language, validated live with a match count. |
| **Command palette** | Press <kbd>/</kbd> to find any task, project, label or filter, or run a query on the spot. |
| **Undo** | Completing, deleting and bulk rescheduling all come with an Undo toast. |
| **Progress** | Daily goal, streak, a 14-day chart and an activity log of what you finished. |
| **Local-first sync** | Works offline in the browser. Sign in to a CalmList server and devices stay in step; offline edits queue and send on reconnect. |
| **Yours** | Export and import JSON at any time. Dark, light and system themes. MIT licensed. |

<table>
  <tr>
    <td width="50%"><img src="site/assets/quick-add.png" alt="Quick add with highlighted tokens" /></td>
    <td width="50%"><img src="site/assets/board.png" alt="A project as a board" /></td>
  </tr>
</table>

## Quick start

Requires **Node 24+**.

```bash
git clone https://github.com/corund207/CalmList.git
cd CalmList
npm install
npm run dev            # web app on http://localhost:5173 (local mode)
npm run dev:server     # sync server on http://localhost:8787 (optional, proxied at /api)
```

With both running, open **Settings → Account & Sync**, leave *Server* blank and create an account.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the web app |
| `npm run dev:server` | Sync server with file watching |
| `npm run build` | Production build of the web app (`web/dist`) and server typecheck |
| `npm start` | Runs the server, which also serves `web/dist` on the same port |
| `npm test` | Web unit tests (Vitest) and API tests (`node:test`) |
| `npm run typecheck` | TypeScript across both workspaces |

## Quick add syntax

| Type | Example | Result |
| --- | --- | --- |
| Date | `today` `tomorrow` `friday` `next week` `in 3 days` `oct 5` `12/31` `2026-11-02` | Due date |
| Time | `at 4pm` `9:30am` `17:00` `at noon` | Due time (a bare time means today, or tomorrow if it has passed) |
| Repeat | `every day` `every weekday` `every other week` `every mon, fri` `monthly` `every! 3 days` | Recurrence |
| Priority | `p1` `p2` `p3` `p4` | Priority (P1 is most urgent) |
| Project | `#Work` `#Home Renovation` | Project (created if new) |
| Section | `/Q4 Plans` | Section in the chosen project |
| Label | `@phone` | Label (created if new) |
| Deadline | `{oct 30}` | Deadline, separate from the due date |

## Filter syntax

Combine terms with `&` (and), `|` or `,` (or), `!` (not) and parentheses.

| Term | Matches |
| --- | --- |
| `today` `tomorrow` `overdue` `no date` | By due date |
| `7 days` `next 14 days` | Due within the next N days |
| `due before: next week` `due after: oct 1` | Relative to any date phrase |
| `p1` … `p4` `no priority` | By priority |
| `#Work` `@phone` `@home*` `/Writing` | Project, label (with wildcard), section |
| `recurring` `subtask` `no labels` `deadline` | By shape |
| `search: invoice` | Text in the name or description |

Example: `(today | overdue) & #Work & !@waiting`

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| <kbd>Q</kbd> | Quick add |
| <kbd>/</kbd> | Search and commands |
| <kbd>G</kbd> then <kbd>I</kbd> / <kbd>T</kbd> / <kbd>U</kbd> / <kbd>F</kbd> / <kbd>C</kbd> | Inbox, Today, Upcoming, Filters & Labels, Completed |
| <kbd>M</kbd> | Toggle the sidebar |
| <kbd>?</kbd> | Show all shortcuts |
| <kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Save a task |
| <kbd>Esc</kbd> | Close or cancel |

## Self-hosting

The sync server is one Node process with one SQLite file (`node:sqlite`, no native modules). It also serves the built web app, so a single container is the whole product.

**Docker**

```bash
docker build -t calmlist .
docker run -d -p 8787:8787 -v calmlist:/data --name calmlist calmlist
```

**From source**

```bash
npm install && npm run build
cp server/.env.example server/.env   # edit as needed
npm start                            # http://localhost:8787
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Port for the API and the bundled app |
| `DATABASE_PATH` | `calmlist.db` (`/data/calmlist.db` in Docker) | SQLite file; keep it on a persistent volume |
| `CORS_ORIGIN` | `*` | Comma-separated origins allowed to call the API, e.g. `https://corund207.github.io` |
| `STATIC_DIR` | `../../web/dist` | Built web app to serve, relative to `server/src` |

Put it behind HTTPS (Caddy, nginx, Fly.io, Railway, Render or any VPS) before using it for real accounts.

**Using the GitHub Pages app with your server:** open the app, go to **Settings → Account & Sync**, enter your server's URL (for example `https://calmlist.example.com`) and sign in. Set `CORS_ORIGIN=https://corund207.github.io` on the server first.

### API

| Method | Path | |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | `{ email, password, name? }` → `{ token, user }` |
| `POST` | `/api/auth/login` | `{ email, password }` → `{ token, user }` |
| `POST` | `/api/auth/logout` | Revokes the bearer token |
| `GET` | `/api/me` | The signed-in user |
| `GET` | `/api/sync?since=<rev>` | Changes after a revision, deletions as `data: null` |
| `POST` | `/api/sync` | `{ changes: [{ kind, id, data \| null }] }` → `{ rev }` |
| `GET` | `/api/export` | Everything the account owns |
| `DELETE` | `/api/account` | Deletes the account and its data |

Passwords are hashed with scrypt; sessions are random 256-bit bearer tokens stored only as SHA-256 hashes and expire after 90 days. Auth endpoints are rate-limited.

## How it works

```
web/                 React 19 + Vite + TypeScript
  src/lib/           pure logic: date parser, quick add, recurrence, filter language (unit tested)
  src/store/         Zustand store, local and cloud backends, actions with undo
  src/components/    task rows, editor, pickers, dialogs, drag and drop
  src/views/         Today, Upcoming, Project/Board, Filters & Labels, Completed, Search
server/              Hono on Node 24, node:sqlite, runs TypeScript natively
site/                GitHub Pages landing page
```

Every record (task, project, section, label, filter, comment, completion event) is a JSON document. The client applies changes locally first and computes their inverse for undo. The cloud backend keeps an offline cache and an outbox; the server gives each change a per-user revision number so clients pull only what they have not seen. Conflicts resolve last write wins.

The UI follows the [Jonah Chang design system](https://claude.ai/artifact/FcShiF9BeJoJ54daksaej8): pure black ground, graphite surfaces, one blue for action, pill buttons, hairline lists and the SF system stack. Priority is shown by ring weight rather than extra hues.

## What you still need to do

GitHub Pages is already enabled and deploys on every push to `main`. The hosted app runs in local mode, so these steps are only for cross-device sync:

1. **Host the sync server.** Deploy the Docker image (or `npm start`) somewhere with HTTPS and a persistent volume for `/data`.
2. **Allow the Pages origin.** Set `CORS_ORIGIN=https://corund207.github.io` on that server, or serve the app from the server itself and skip CORS entirely.
3. **Sign in.** In the app, open **Settings → Account & Sync**, enter the server URL and create an account. Tick *Bring the tasks on this device into the account* to keep what you already have.
4. **Back up** the SQLite file on your server, or use **Settings → Data → Export JSON** now and then.

## License

[MIT](LICENSE) © 2026 Jonah Chang
