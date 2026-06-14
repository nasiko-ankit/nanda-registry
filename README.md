# NANDA Registry

A self-hosted agent catalog that organizations run on their own infrastructure. It stores `CatalogEntry` records — one per agent — and serves them in the [AI Catalog](https://spec.aicatalog.org) format (`application/ai-catalog+json`).

Clone this repo, deploy it, point your NANDA Index record at it, and your agents are discoverable.

## How it fits in the resolution flow

```
Caller  →  NANDA Index          GET /api/v1/resolve?locator=urn:ai:nasiko.com:ankit
        ←  { registry_url }     "agents for nasiko.com live at https://registry.nasiko.com"

Caller  →  NANDA Registry       GET https://registry.nasiko.com/agents/ankit   ← this server
        ←  { url }              "ankit's facts document is at https://nasiko.com/agents/ankit.json"

Caller  →  Facts URL            GET https://nasiko.com/agents/ankit.json
        ←  Agent capability document  (A2A card or equivalent)
```

The registry handles hop 2. Public reads, authenticated writes.

---

## Quick start

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET to a strong random value (at least 32 chars).
# The compose stack runs the server as NODE_ENV=production, so it will refuse
# to boot while JWT_SECRET is left at the example default. Generate one with:
#   openssl rand -hex 64
docker compose up --build
```

| Service    | URL                    |
|------------|------------------------|
| API        | http://localhost:3002  |
| Web UI     | http://localhost:3003  |
| API Docs   | http://localhost:3002/docs |

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Postgres connection string |
| `POSTGRES_PASSWORD` | yes | `registry-local` in dev | Postgres password (used to build `DATABASE_URL` in the compose stack) |
| `JWT_SECRET` | yes (prod) | dev default | Must be at least 32 chars in production. The compose stack runs as production, so it must be set even for local `docker compose up`. |
| `JWT_EXPIRES_IN` | no | `7d` | Token lifetime |
| `PORT` | no | `3002` | API server port |
| `DB_MAX_CONNECTIONS` | no | `10` | Postgres connection pool size |

### Production-only (see `.env.prod.example` + `docker-compose.prod.yml`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `HOST` | yes (prod) | (none) | Public domain (gets free HTTPS) or bare IP as `http://<ip>`. Drives the Caddy site address. |
| `NEXT_PUBLIC_REGISTRY_API_URL` | yes (prod) | (none) | API base URL baked into the web bundle at build time. Must match `HOST` with an `/api` suffix, e.g. `https://registry.example.com/api`. |

---

## API reference

### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | — | Create account with email + password |
| `POST` | `/auth/login` | — | Sign in, returns JWT |
| `GET` | `/auth/me` | JWT | Current user profile |

### Catalog (public reads)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/agents` | — | All active agents as a `CatalogDocument` |
| `GET` | `/agents/:agent_id` | — | Single agent as a `CatalogEntry` |
| `GET` | `/agents/search` | — | Search by keyword or URN (`?q=`) |
| `GET` | `/.well-known/ai-catalog.json` | — | AI Catalog discovery endpoint |

### Catalog (protected writes)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/agents` | JWT | Register a new agent |
| `PUT` | `/agents/:agent_id` | JWT | Update agent fields |
| `DELETE` | `/agents/:agent_id` | JWT | Remove an agent |

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe — `{ status, db }` |

#### Search

```
GET /agents/search?q=weather
  → searches identifier, display_name, description, tags (case-insensitive)

GET /agents/search?q=urn:ai:nasiko.com:ankit
  → URN fast-path: extracts "ankit" and does a direct identifier lookup
```

#### Response formats

`CatalogDocument` (list endpoints):
```json
{
  "specVersion": "1.0",
  "entries": [ ...CatalogEntry ]
}
```

`CatalogEntry` (single agent):
```json
{
  "identifier": "ankit",
  "displayName": "Ankit Agent",
  "url": "https://nasiko.com/agents/ankit.json",
  "mediaType": "application/a2a-agent-card+json",
  "description": "...",
  "tags": ["search", "qa"],
  "version": "1.0.0",
  "updatedAt": "2026-06-09T00:00:00Z",
  "metadata": { "ttlSeconds": 3600, "status": "active" }
}
```

#### Error shape

All errors return:
```json
{ "error": "ERROR_CODE", "detail": "human-readable message" }
```

---

## Database schema

### `agents`
One row per registered agent.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `agent_id` | VARCHAR(64) | Unique slug, e.g. `ankit`. Lowercase, hyphens only. |
| `display_name` | VARCHAR(255) | Human-readable name |
| `description` | TEXT | Optional |
| `url` | VARCHAR(512) | Agent facts document URL (hop 3 target) |
| `media_type` | VARCHAR(255) | Default `application/a2a-agent-card+json` |
| `version` | VARCHAR(64) | Optional semver |
| `tags` | TEXT[] | Searchable labels |
| `ttl_seconds` | INTEGER | Cache hint. Default 3600 (1h) |
| `status` | VARCHAR(20) | `active` or `inactive` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `users`
Accounts for org members who manage this registry.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Unique |
| `display_name` | VARCHAR(255) | Optional |
| `password_hash` | VARCHAR(255) | bcrypt, 10 rounds |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

---

## Local development (without Docker)

```bash
# 1. Start Postgres
docker compose up db -d

# 2. Install dependencies
cd server && npm install

# 3. Create server/.env
cat > .env <<EOF
DATABASE_URL=postgresql://registry:registry-local@localhost:5434/nanda_registry
PORT=3002
NODE_ENV=development
EOF

# 4. Run migrations + start
npm run migrate
npm run dev
```

```bash
# Web (separate terminal)
cd web && npm install && npm run dev
```

### Running tests

```bash
cd server && npm test
```

Tests use `fastify.inject()` against a real database — ensure Postgres is running before running tests.

---

## Registering your first agent

```bash
# 1. Create an account
curl -X POST http://localhost:3002/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}'

# 2. Sign in
TOKEN=$(curl -s -X POST http://localhost:3002/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpassword"}' | jq -r .token)

# 3. Register an agent
curl -X POST http://localhost:3002/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "my-agent",
    "display_name": "My Agent",
    "url": "https://example.com/agents/my-agent.json",
    "tags": ["search"]
  }'
```

---

## Tech stack

| Concern | Technology |
|---|---|
| Runtime | Node.js 20, TypeScript |
| Framework | Fastify 5 |
| Database | PostgreSQL 16, postgres.js (no ORM) |
| Auth | @fastify/jwt, bcryptjs |
| Tests | Vitest + fastify.inject() |
| Frontend | Next.js 15, Tailwind CSS 4 |
