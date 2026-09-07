# CRM-Time

A lightweight CRM for tracking contacts, deals, and follow-ups. Built as a small
full-stack TypeScript monorepo:

- **`server/`** — Express + `better-sqlite3` REST API (contacts CRUD, search/filter, stats).
- **`client/`** — React + Vite single-page app with a modern dashboard UI.

## Prerequisites

- Node.js >= 20 (developed against Node 22)
- A C toolchain for `better-sqlite3` native build (`build-essential` on Debian/Ubuntu)

## Getting started

```bash
npm install     # install all workspace dependencies
npm run dev      # start API (http://localhost:3001) + client (http://localhost:5173)
```

Open http://localhost:5173. The API is proxied under `/api`, and the database is
seeded with a few sample contacts on first run.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run the API and client together (via `concurrently`). |
| `npm run build` | Type-check and build both workspaces. |
| `npm start` | Run the compiled API server. |
| `npm run typecheck` | Type-check both workspaces. |
| `npm run lint` | Lint with ESLint (flat config). |
| `npm test` | Run the server API tests (Vitest + Supertest). |

## API

Base URL: `http://localhost:3001`

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `GET` | `/api/stats` | Totals, counts by status, pipeline value. |
| `GET` | `/api/contacts?search=&status=` | List contacts (optional search / status filter). |
| `GET` | `/api/contacts/:id` | Fetch one contact. |
| `POST` | `/api/contacts` | Create a contact. |
| `PATCH` | `/api/contacts/:id` | Update a contact. |
| `DELETE` | `/api/contacts/:id` | Delete a contact. |

A contact has: `name` (required), `email`, `company`, `phone`, `status`
(`lead` \| `active` \| `won` \| `churned`), `value`, `notes`, and timestamps.

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | API server port. |
| `CRM_DB_PATH` | `data/crm.db` | SQLite file path (`:memory:` for tests). |

## Project layout

```
.
├── client/          # React + Vite frontend
├── server/          # Express + SQLite API
├── .cursor/         # Cloud Agent environment config
└── package.json     # npm workspaces root
```
