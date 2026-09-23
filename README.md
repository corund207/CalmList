<div align="center">

# CalmList.

**Plan less. Finish more.**

A calm, keyboard-first task manager inspired by Todoist.<br />
Local-first in the browser, with free on-device AI, 48 themes, Claude and ChatGPT connectors,<br />
Google Calendar sync, and sync through Supabase or a server you host yourself.

[**Open the app**](https://corund207.github.io/CalmList/app/) · [**Website**](https://corund207.github.io/CalmList/) · [AI](#ai-free-by-default) · [Assistants](#ai-assistants-mcp) · [Sync](#sync-options) · [Vercel](#hosting-on-vercel) · [Status](#service-status) · [Privacy](#privacy-licenses-and-compliance)

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
| **Command palette** | Press <kbd>/</kbd> to find any task, project, label, filter or theme, or run a query on the spot. |
| **Undo** | Completing, deleting and bulk rescheduling all come with an Undo toast. |
| **Progress** | Daily goal, streak, a 14-day chart and an activity log of what you finished. |
| **48 themes** | Dark, light, dynamic (follows the clock or the seasons), animated (aurora, starfield, synthwave, rain…) and niche (Nord, Dracula, Terminal, Pocket…), plus a custom accent colour. |
| **Free AI** | Ramble, Task Assist and Filter Assist, running on-device at no cost, or with your own Claude, ChatGPT, Gemini or Grok key. |
| **AI assistants** | Connect Claude, ChatGPT or any MCP client to read, add and complete tasks, with per-assistant tokens you can revoke. |
| **Sync your way** | Works offline in the browser. Connect Supabase Cloud, a self-hosted Supabase, or the bundled CalmList server; offline edits queue and send on reconnect. |
| **Integrations** | Live sync of dated tasks to a dedicated *CalmList* Google Calendar, .ics export for Apple and Outlook, and Todoist import (CSV). |
| **Yours** | Export, import or delete everything at any time. No telemetry. GDPR-ready. MIT licensed. |

<table>
  <tr>
    <td width="50%"><img src="site/assets/quick-add.png" alt="Quick add with highlighted tokens" /></td>
    <td width="50%"><img src="site/assets/board.png" alt="A project as a board" /></td>
  </tr>
</table>

## Themes

Settings → **Appearance** has a gallery of 48 themes. Pick one, or choose **Match system** and assign a light and a dark theme. CI checks every palette for text contrast (4.5:1 for body text) and legible button labels.

| Group | Themes |
| --- | --- |
| **Dark** | Calm Dark (the design system default), Midnight, Graphite, OLED Mono, Forest Night, Plum, Ember |
| **Light** | Calm Light, Paper, Sky, Sage, Sand, Lilac |
| **Dynamic** | Daylight (dawn, day, golden hour, dusk, night), Night Shift (warm dark after 8 pm), Seasons, Daily Mix |
| **Animated** | Aurora, Starfield, Synthwave, Rainy Window, Lava Lamp, Digital Rain, Fireflies, Snowfall, Clouds, Ocean, Sakura, Dreamy |
| **Niche** | Terminal, Amber CRT, Pocket, Blueprint, Nord, Dracula, Gruvbox, Solarized Dark and Light, Catppuccin Mocha and Latte, Rosé Pine, Tokyo Night, Vaporwave, Coffee, E-Ink, Newsprint, Bubblegum, High Contrast |

Animated backdrops pause when the tab is hidden, cap the pixel ratio, and switch off entirely under *reduced motion* or with the **Animate theme backdrops** toggle. Type `theme` in the command palette to switch without opening settings.

<table>
  <tr>
    <td width="50%"><img src="site/assets/theme-aurora.png" alt="Aurora theme" /></td>
    <td width="50%"><img src="site/assets/theme-terminal.png" alt="Terminal theme" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="site/assets/theme-synthwave.png" alt="Synthwave theme" /></td>
    <td width="50%"><img src="site/assets/theme-paper.png" alt="Paper theme" /></td>
  </tr>
</table>

## AI, free by default

CalmList has Todoist's AI features, and none of them need a paid service.

| Feature | What it does |
| --- | --- |
| **Ramble** | Talk or type freely ("I need to call the dentist tomorrow, and finish the report by Friday, p1") and review the tasks it pulls out before adding them. Dates always come from the Quick Add parser, never from a model. |
| **Task Assist** | Break a task into sub-tasks, make it more actionable, or suggest a date and priority. |
| **Filter Assist** | Describe a view in words ("urgent work stuff this week") and get a filter query. |

Pick the engine in **Settings → AI**:

| Engine | Cost | Where your text goes |
| --- | --- | --- |
| Built-in rules (default) | Free | Nowhere. Same parser as Quick Add. |
| In-browser model (Qwen 2.5, Llama 3.2 via WebGPU) | Free | Nowhere. The model downloads once, then runs offline. |
| Ollama / LM Studio / any OpenAI-compatible server | Free if you run it | Your own machine or server |
| Claude, ChatGPT, Gemini, Grok | Your own API key | That provider, only after you agree to it |

Speech uses the browser's recognizer or a private on-device Whisper model. Keys stay in the browser. Tasks proposed by AI carry an "AI" marker, to meet the EU AI Act's transparency duty.

## AI assistants (MCP)

Claude, ChatGPT and any other [MCP](https://modelcontextprotocol.io) client can use your CalmList: "what's on today?", "add *renew passport* next Monday", "move everything tagged @errands to Saturday".

1. Sign in with Supabase sync on a Vercel deployment (see [Hosting on Vercel](#hosting-on-vercel)).
2. Open **Settings → Integrations → AI assistants**, pick your assistant and press **Connect**.
3. Follow the instructions shown with the token:

| Assistant | Where |
| --- | --- |
| **Claude** (web, desktop, mobile) | Settings → Connectors → *Add custom connector*, paste the URL |
| **Claude Code** | `claude mcp add --transport http calmlist https://<app>/api/mcp --header "Authorization: Bearer <token>"` |
| **ChatGPT** | Settings → Apps & Connectors → Advanced → Developer mode → *Create*, paste the URL, no authentication |
| **Others** | Streamable HTTP at `/api/mcp`, with `Authorization: Bearer <token>` or `/api/mcp/<token>` |

Gemini and Grok support is planned.

Tools: `list_tasks` (any filter query), `add_task` (with Quick Add syntax), `update_task`, `complete_task` (recurring tasks roll forward), `reopen_task`, `delete_task`, `list_projects`, `add_project`, plus `search` and `fetch` for ChatGPT's connector format.

Each assistant gets its own token. Only a SHA-256 hash is stored, and you can revoke it at any time. The endpoint has no admin key: it passes the token to two Postgres functions, `calmlist_agent_read` and `calmlist_agent_write`, which resolve it to one user and touch only that user's rows. The database tests prove a token can never reach another account.

## Sync options

Open **Settings → Account & Sync** and pick where your tasks live.

| Option | Best for | Set up |
| --- | --- | --- |
| **This device** | Privacy, offline use, trying it out | Nothing. It's the default. |
| **Supabase Cloud** | Syncing with no servers to run | Create a project, apply the schema, paste the URL and anon key |
| **Self-hosted Supabase** | Owning everything, with Supabase's auth and realtime | `npm run supabase:selfhost` |
| **CalmList server** | The smallest possible footprint | `docker run` or `npm start` |

### Supabase Cloud

1. Create a project at [supabase.com](https://supabase.com/dashboard/new).
2. Apply the schema, either way:
   - **SQL editor:** paste [`supabase/migrations/20260923000000_calmlist.sql`](supabase/migrations/20260923000000_calmlist.sql) and run it. The app's *Copy Setup SQL* button copies it for you.
   - **CLI:** `npm run supabase:link -- --project-ref <ref>`, then `npm run supabase:push`.
3. In CalmList, open **Settings → Account & Sync → Supabase**, paste the project URL and the **anon public** key (Project Settings → API), press *Test Connection*, then create an account.

The schema is one table, `calmlist_items`, with row-level security (people only see their own rows), a revision trigger for incremental sync, and a realtime publication so devices update live. Hosted Supabase asks new users to confirm their email by default; you can turn that off under Authentication → Providers → Email.

### Self-hosted Supabase

Needs Docker (with the compose plugin) and git.

```bash
npm run supabase:selfhost -- --url https://tasks.example.com --app-url https://you.github.io/CalmList/app/
```

The script:

- fetches Supabase's official Docker setup into `supabase-selfhost/`
- generates every secret: Postgres password, JWT secret, signed anon and service-role keys, dashboard login, and encryption keys
- turns on email auto-confirm, since there's no SMTP by default (pass `--smtp` to keep confirmations)
- starts the stack and applies the CalmList schema
- prints the URL and anon key to paste into the app

Re-running keeps the existing secrets. `--no-start` only writes the configuration. Put HTTPS in front of port 8000 (Caddy, nginx or a Cloudflare Tunnel) before exposing it.

### Pointing the hosted app at your Supabase

In the repo's **Settings → Secrets and variables → Actions → Variables**, set `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The Pages build then pre-fills the Supabase option. Also set the `SUPABASE_PROJECT_REF` variable and the `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` secrets, and CI will run `supabase db push` on every push to `main`.

### CalmList server

The bundled server is one Node process with one SQLite file (`node:sqlite`, no native modules). It also serves the built web app, so a single container is the whole product.

```bash
docker build -t calmlist .
docker run -d -p 8787:8787 -v calmlist:/data --name calmlist calmlist
```

Or from source: `npm install && npm run build && npm start` (copy `server/.env.example` to `server/.env` first to change settings).

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | Port for the API and the bundled app |
| `DATABASE_PATH` | `calmlist.db` (`/data/calmlist.db` in Docker) | SQLite file; keep it on a persistent volume |
| `CORS_ORIGIN` | `*` | Comma-separated origins allowed to call the API, e.g. `https://corund207.github.io` |
| `STATIC_DIR` | `../../web/dist` | Built web app to serve, relative to `server/src` |

Put it behind HTTPS before using it for real accounts. To use it from the GitHub Pages app, set `CORS_ORIGIN=https://corund207.github.io`, then choose **Settings → Account & Sync → CalmList server** and enter its URL.

<details>
<summary>API reference</summary>

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

</details>

## Integrations

Under Settings → **Integrations**:

- **AI assistants:** connect Claude, ChatGPT and other MCP clients ([details](#ai-assistants-mcp)).
- **Google Calendar:** keeps a *CalmList* calendar in step with your dated tasks ([setup](#google-calendar)).
- **Apple, Outlook and other calendars:** download every open, dated task as an `.ics` file, with repeats written as `RRULE`s, and import it into your calendar.
- **Todoist:** in Todoist, choose a project's *Export as a template → CSV*, then import one or many files. Sections, sub-tasks (from indentation), labels, priorities, dates and comments come across.
- **JSON:** Settings → Data & Privacy exports and imports everything.

## Hosting on Vercel

Vercel runs the website, the app and the three small functions (`/api/mcp`, `/api/stats`, `/api/status-check`) from one project. The free Hobby plan is enough.

1. Import the repo at [vercel.com/new](https://vercel.com/new). `vercel.json` sets everything: `npm run build:site` writes Vercel's Build Output (static site, pre-bundled functions, security headers, a daily cron).
2. Add the environment variables below, then deploy.
3. In Supabase → Authentication → URL Configuration, set the Site URL to `https://<app>/app/` and add `https://<app>/app/**` to the redirect URLs, so confirmation and password-reset emails land in the app.

| Variable | Needed for | Where it comes from |
| --- | --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Sync, accounts, MCP | Supabase → Project Settings → API (the **anon public** key) |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/stats` and `/api/status-check` only | Same page. Server-side only; never prefix it with `VITE_` |
| `CRON_SECRET` | Status checks | Any long random string, e.g. `openssl rand -hex 32` |
| `VITE_GOOGLE_CLIENT_ID` | Google Calendar | See below |

**Every account is separate.** All accounts share one database, but row-level security scopes every row to its owner, both for the app (the signed-in user's JWT) and for assistants (the token resolves to one user inside Postgres). `npm run test:db` runs the migrations against an in-memory Postgres and checks that no account can read, change or delete another's data.

**Security headers.** HSTS, `nosniff`, a strict referrer policy, a permissions policy and a Content-Security-Policy with no inline scripts. `connect-src` stays open because you can point the app at your own Supabase, Ollama or AI server.

### Google Calendar

The connector creates a calendar called **CalmList** in the person's Google account and keeps it in step with every open task that has a date or time. Tasks with just a date become all-day events; tasks with a time become 30-minute events. Repeats become RRULEs, and completed, deleted or undated tasks are removed. It runs in the browser with the `calendar.app.created` scope, so it can only touch calendars it created, and stores no refresh token. Access lasts an hour, so sync pauses after that until a click resumes it.

To turn it on:

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable the **Google Calendar API**.
2. Set up the OAuth consent screen (External). Add the scope `.../auth/calendar.app.created` and link the Privacy Policy (`https://<app>/legal.html#privacy`).
3. Create an **OAuth client ID** of type *Web application*, with your site (and `http://localhost:5173` for development) as authorized JavaScript origins.
4. Set `VITE_GOOGLE_CLIENT_ID` in Vercel (and as the `GOOGLE_CLIENT_ID` Actions variable for Pages), then redeploy.

While the app is in Google's *Testing* mode, only test users you add can connect. Publishing it for everyone requires Google's verification of the scope.

## Service status

Live numbers from the hosted service. They are aggregate counts only; no one is identified.

![Status](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.status&label=status&labelColor=1d1d1f&color=0071e3)
![Uptime 30 days](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.uptime_30d_label&label=uptime%2030d&labelColor=1d1d1f&color=0071e3)
![Uptime 7 days](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.uptime_7d_label&label=uptime%207d&labelColor=1d1d1f&color=0071e3)
![Accounts](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.users_total&label=accounts&labelColor=1d1d1f&color=0071e3)
![Active 30 days](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.active_30d&label=active%2030d&labelColor=1d1d1f&color=0071e3)
![Syncing 7 days](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.syncing_7d&label=syncing%207d&labelColor=1d1d1f&color=0071e3)
![Latency p50](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fcalmlist-steel.vercel.app%2Fapi%2Fstats&query=%24.latency_p50&label=latency%20p50&suffix=%20ms&labelColor=1d1d1f&color=0071e3)

| Measure | Source |
| --- | --- |
| Status, uptime (24 h, 7 d, 30 d), median latency | `/api/status-check` probes the Supabase REST API, Supabase Auth and the app, every 30 minutes from GitHub Actions ([`status.yml`](.github/workflows/status.yml)) and daily from Vercel Cron. Results are kept 90 days. |
| Accounts, active in 1 / 7 / 30 days | Counts of `auth.users` and their last sign-in |
| Syncing in 7 days | Accounts that changed any item in the last week |
| Compute | Supabase Free plan: shared CPU and 500 MB RAM (Nano), 500 MB database, 5 GB egress; pauses after a week without traffic. Vercel Hobby for the site and functions. |
| Database version | `db_version` in the JSON |

All of it is at [`/api/stats`](https://calmlist-steel.vercel.app/api/stats) as JSON, cached for five minutes. The numbers come from `calmlist_service_stats()`, which only the service role can call.

For the status checks, set the Actions variable `STATUS_URL` to `https://<app>/api/status-check` and the secret `CRON_SECRET` to the same value as in Vercel.

## Privacy, licenses and compliance

- **No telemetry.** No analytics, error-reporting, ads or tracking SDKs, and no cookies beyond sign-in. Don't enable Vercel Web Analytics or Speed Insights without updating the privacy policy first.
- **What leaves the device, and when.** The [Terms & Privacy page](site/legal.html) lists every destination: the sync service, AI providers you consent to, model downloads, Google Calendar and connected assistants. Settings → Data & Privacy repeats the summary in the app.
- **GDPR.** Legal bases, recipients, transfers, retention and rights are documented. People can export everything (Art. 15/20), correct it (Art. 16) and delete their account instantly (Art. 17) in the app. Sign-up records the accepted policy version, when it was accepted, and age confirmation (16+).
- **ePrivacy.** Only strictly necessary local storage, so no cookie banner is needed.
- **EU AI Act.** Cloud AI needs explicit consent per provider; AI-made tasks, including those added by assistants, are labelled.
- **Licenses.** CalmList is MIT. `npm run build:site` writes `licenses.txt` with every shipped dependency and its license text, linked from the site footer and the app.


## Quick start

Requires **Node 24+**.

```bash
git clone https://github.com/corund207/CalmList.git
cd CalmList
npm install
npm run dev            # web app on http://localhost:5173 (local mode)
npm run dev:server     # CalmList server on http://localhost:8787 (optional, proxied at /api)
```

With both running, open **Settings → Account & Sync → CalmList server**, leave *Server* blank and create an account.

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server for the web app |
| `npm run dev:server` | CalmList server with file watching |
| `npm run build` | Production build of the web app (`web/dist`) and server typecheck |
| `npm run build:site` | The deployable site in `_site/` (landing page, app at `/app/`, `licenses.txt`); on Vercel also `.vercel/output` |
| `npm start` | Runs the server, which also serves `web/dist` on the same port |
| `npm test` | Web unit tests (Vitest), API tests and database isolation tests (`node:test`, PGlite) |
| `npm run typecheck` | TypeScript across the workspaces and the Vercel functions |
| `npm run supabase:selfhost` | Sets up and starts a self-hosted Supabase for CalmList |
| `npm run supabase:link` / `supabase:push` | Links a hosted Supabase project and applies the schema |

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
| <kbd>/</kbd> | Search, commands and themes |
| <kbd>G</kbd> then <kbd>I</kbd> / <kbd>T</kbd> / <kbd>U</kbd> / <kbd>F</kbd> / <kbd>C</kbd> | Inbox, Today, Upcoming, Filters & Labels, Completed |
| <kbd>M</kbd> | Toggle the sidebar |
| <kbd>?</kbd> | Show all shortcuts |
| <kbd>Enter</kbd> / <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Save a task |
| <kbd>Esc</kbd> | Close or cancel |

## How it works

```
web/                 React 19 + Vite + TypeScript
  src/lib/           pure logic: date parser, quick add, recurrence, filters, .ics, Google Calendar, Todoist CSV (unit tested)
  src/ai/            Ramble, Task Assist, Filter Assist; rules, WebGPU, Ollama and cloud engines; speech
  src/agent/         the MCP server: tools and JSON-RPC, shared by the Vercel function and tests
  src/store/         Zustand store, sync providers (local, CalmList, Supabase), actions with undo
  src/themes/        48 themes, the palette → token engine, animated backdrops, the gallery
  src/components/    task rows, editor, pickers, dialogs, drag and drop, settings
  src/views/         Today, Upcoming, Project/Board, Filters & Labels, Completed, Search
server/              Hono on Node 24, node:sqlite, runs TypeScript natively
functions/           Vercel functions: /api/mcp, /api/stats, /api/status-check
supabase/            Supabase CLI config, migrations, and the user-isolation tests
scripts/             build-site.mjs (site, licenses, Vercel output), supabase-selfhost.mjs
site/                landing page, Terms & Privacy
```

Every record (task, project, section, label, filter, comment, completion event) is a JSON document. The client applies changes locally first and computes their inverse for undo. Remote providers share one backend, with an offline cache and an outbox, and differ only in transport. The CalmList server and Supabase both stamp each write with an increasing revision, so clients pull only what they have not seen, and Supabase also pushes changes over realtime. Conflicts resolve last write wins.

The UI follows the [Jonah Chang design system](https://claude.ai/artifact/FcShiF9BeJoJ54daksaej8): pure black ground, graphite surfaces, one blue for action, pill buttons, hairline lists and the SF system stack. Priority is shown by ring weight rather than extra hues. Other themes swap the palette through the same tokens.

## Deployment status

| Piece | Where | State |
| --- | --- | --- |
| Website and app | [corund207.github.io/CalmList](https://corund207.github.io/CalmList/) | Deploys on every push to `main` |
| Supabase project | `calmlist` in the PersonalProgects org, us-east-2 (`ddvtufcbrvzjislojlqp`) | Schema applied, row-level security and realtime on |
| Hosted app → Supabase | Actions variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Set: the Sync tab comes pre-filled |
| Vercel (site, app, MCP, stats) | [calmlist-steel.vercel.app](https://calmlist-steel.vercel.app/) | Deploys on every push to `main`; Supabase URL and anon key set |
| Migrations | `supabase/migrations/` | All applied to the hosted project |

## What you still need to do

**For the new features:**

- **Vercel secrets:** in the [project settings](https://vercel.com/jonahchang207s-projects/calmlist/settings/environment-variables), add `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Project Settings → API) and `CRON_SECRET` (a random string), then redeploy. Add the same `CRON_SECRET` as a GitHub Actions secret. Until then `/api/stats` answers 503 and the badges show nothing.
- **Supabase redirect URLs:** in [Authentication → URL Configuration](https://supabase.com/dashboard/project/ddvtufcbrvzjislojlqp/auth/url-configuration), add `https://calmlist-steel.vercel.app/app/**`, so confirmation and reset emails work from the Vercel app.
- **Google Calendar:** create the OAuth client and set `VITE_GOOGLE_CLIENT_ID` ([steps](#google-calendar)).
- **Privacy contact:** the GDPR needs a way to reach you privately. Add a contact email to `site/legal.html` (it currently points to GitHub issues). If you target Germany or Austria, also add an Impressum with a postal address.
- **EU data residency (optional):** the Supabase project is in us-east-2. For EU users, a project in an EU region (e.g. Frankfurt) avoids the transfer to the US entirely.

**From before:**

1. **Create your account.** Open the [app](https://corund207.github.io/CalmList/app/) → **Settings → Account & Sync → Supabase** → *Create account*. New accounts get a confirmation email; after clicking it, come back and sign in.
2. **Optional: skip email confirmation.** Supabase's built-in email sender is rate-limited, so for a personal instance you may prefer turning off *Confirm email* under Authentication → Providers → Email in the [dashboard](https://supabase.com/dashboard/project/ddvtufcbrvzjislojlqp/auth/providers).
3. **Optional: automatic migrations.** Add the Actions variable `SUPABASE_PROJECT_REF=ddvtufcbrvzjislojlqp` and the secrets `SUPABASE_ACCESS_TOKEN` (from [account tokens](https://supabase.com/dashboard/account/tokens)) and `SUPABASE_DB_PASSWORD` (in your local, gitignored `supabase/.env.local`). CI will then push new migrations on every merge to `main`.

**Self-hosting instead:** install Docker, run `npm run supabase:selfhost -- --url https://your-domain`, put HTTPS in front of port 8000, and paste the printed URL and anon key into the app. Or deploy the CalmList server image with a volume for `/data`, set `CORS_ORIGIN=https://corund207.github.io`, and choose **Settings → Account & Sync → CalmList server**.

## License

[MIT](LICENSE) © 2026 Jonah Chang
