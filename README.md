# NANDA AI Catalog

A self-hosted agent catalog that organizations run on their own infrastructure. It stores one `CatalogEntry` per agent and serves them in the [AI Catalog](https://ai-catalog.io/#top-level-structure) format.

In the resolution chain, NANDA AI Catalog is **hop 2**:

```
Requester → NANDA Index → NANDA AI Catalog → Agent Runtime
```

NANDA Index tells you which registry to call. NANDA AI Catalog tells you where the specific agent card lives.

---

## What it does

- Stores agent entries (identifier, display name, facts URL, media type, tags)
- Serves `GET /agents/:agent_id` for single-agent lookups
- Serves `GET /.well-known/ai-catalog.json` as the AI Catalog discovery endpoint
- Provides a web UI for managing agents
- Requires JWT auth for write operations; all reads are public

---

## Stack

- **API:** Fastify 5, TypeScript, Node.js 20
- **Database:** PostgreSQL 16, postgres.js v3
- **Frontend:** Next.js 15, TailwindCSS v4
- **Auth:** Email/password, JWT
- **Proxy:** Caddy 2 (TLS auto-provisioned)

---

## Local Development

```bash
git clone https://github.com/your-org/nanda-registry
cd nanda-registry
cp .env.example .env
docker compose up --build
```

| Service | URL |
|---------|-----|
| Web UI  | http://localhost:3003 |
| API     | http://localhost:3002 |
| API Docs | http://localhost:3002/docs |
| DB      | localhost:5434 |

---

## Production Deployment

### Prerequisites

- VPS with 2GB RAM (add swap on 1GB servers)
- Docker and Docker Compose installed
- DNS A records:
  - `registry.yourdomain.com` → server IP
  - `api.registry.yourdomain.com` → server IP (or use path-based routing)

### Steps

```bash
# 1. Clone
git clone https://github.com/your-org/nanda-registry
cd nanda-registry

# 2. Configure
cp .env.example .env.prod
# Edit .env.prod

# 3. Build and start
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build -d

# 4. Verify
curl https://api.registry.yourdomain.com/health
curl https://api.registry.yourdomain.com/.well-known/ai-catalog.json
```

### Environment Variables

```env
# Database
POSTGRES_PASSWORD=          # strong random password

# JWT — generate with: openssl rand -hex 64
JWT_SECRET=
JWT_EXPIRES_IN=7d

DB_MAX_CONNECTIONS=10
```

---

## Registering Agents

### Step 1: Create an admin account

```bash
curl -X POST https://api.registry.yourdomain.com/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"yourpassword"}'
# Returns: { "token": "eyJ..." }
```

### Step 2: Create an agent

```bash
TOKEN="eyJ..."

curl -X POST https://api.registry.yourdomain.com/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "agent_id": "support",
    "display_name": "Customer Support Agent",
    "url": "https://agents.yourdomain.com/support/card.json",
    "media_type": "application/a2a-agent-card+json",
    "description": "Handles customer queries, ticket creation, and escalation.",
    "tags": ["support", "customer-service"],
    "version": "1.0"
  }'
```

### Step 3: Register your registry in NANDA Index

```bash
curl -X POST https://api.nandaindex.org/api/v1/orgs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <nanda-index-token>" \
  -d '{
    "org_id": "yourdomain",
    "display_name": "Your Org",
    "hosting_path": "registry",
    "domain": "yourdomain.com",
    "contact_email": "agents@yourdomain.com",
    "registry_url": "https://api.registry.yourdomain.com",
    "identifier": "urn:ai:domain:yourdomain.com",
    "media_type": "application/ai-catalog+json",
    "publisher": {
      "identifier": "urn:ai:domain:yourdomain.com",
      "displayName": "Your Org",
      "identityType": "dns"
    },
    "catalog_metadata": {
      "org.projectnanda.preferredDiscovery": "ai-catalog",
      "org.projectnanda.resolutionRole": "nested-ai-catalog"
    }
  }'
```

Now `urn:ai:domain:yourdomain.com:agent:support` resolves end-to-end.

---

## Schema

### CatalogEntry (API response)

```typescript
interface CatalogEntry {
  identifier:   string;   // e.g. "support" — the agent_id
  displayName:  string;
  mediaType:    string;   // e.g. "application/a2a-agent-card+json"
  url:          string;   // the A2A Agent Card URL (facts URL)
  description:  string | null;
  tags:         string[];
  version:      string | null;
  updatedAt:    string;
}

interface CatalogDocument {
  specVersion: "1.0";
  entries:     CatalogEntry[];
}
```

### Database tables

```sql
-- Agent entries
CREATE TABLE agents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     VARCHAR(64) UNIQUE NOT NULL,  -- slug, e.g. "support"
  display_name VARCHAR(255) NOT NULL,
  description  TEXT,
  url          VARCHAR(512) NOT NULL,         -- A2A card / facts URL
  media_type   VARCHAR(255) NOT NULL DEFAULT 'application/a2a-agent-card+json',
  version      VARCHAR(64),
  tags         TEXT[] NOT NULL DEFAULT '{}',
  status       VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin accounts
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  display_name  VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## API Reference

### Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| `POST` | `/auth/register` | `{ email, password, display_name? }` | `{ token }` |
| `POST` | `/auth/login` | `{ email, password }` | `{ token }` |
| `GET`  | `/auth/me` | — | User profile |

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/ai-catalog.json` | Full catalog as CatalogDocument |
| `GET` | `/agents` | All active agents as CatalogDocument |
| `GET` | `/agents/search?q=<query>` | Keyword or URN search |
| `GET` | `/agents/:agent_id` | Single CatalogEntry |
| `GET` | `/health` | `{ "status": "ok", "db": "ok" }` |

### Protected (JWT required)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST`   | `/agents` | CatalogEntry fields | Create agent |
| `PUT`    | `/agents/:agent_id` | Partial CatalogEntry | Update agent |
| `DELETE` | `/agents/:agent_id` | — | Delete agent |

### Create Agent payload

```json
{
  "agent_id":     "support",
  "display_name": "Customer Support Agent",
  "url":          "https://agents.yourdomain.com/support/card.json",
  "media_type":   "application/a2a-agent-card+json",
  "description":  "Handles customer queries and ticket creation.",
  "tags":         ["support", "customer-service"],
  "version":      "1.0"
}
```

### Search

```bash
# Keyword search
curl "https://api.registry.yourdomain.com/agents/search?q=support"

# URN fast-path (extracts agent_id and does direct lookup)
curl "https://api.registry.yourdomain.com/agents/search?q=urn:ai:yourdomain.com:support"
```

---

## Health Check

```bash
curl https://api.registry.yourdomain.com/health
# { "status": "ok", "db": "ok" }
```
