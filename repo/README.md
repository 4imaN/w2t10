# CineRide Media Operations Platform

Offline-first media operations platform unifying a local movie catalog, editorial content publishing, and ride-request order handling for small entertainment venues and community shuttles.

## Quick Start

```bash
docker compose up --build -d
open http://localhost:8080
```

That's it. Secrets (`JWT_SECRET`, `ENCRYPTION_KEY`) are generated automatically inside the
container on first start. No `.env` file or setup script required.

The platform is accessible at **http://localhost:8080**.

### Login Portals (each role has its own URL)

| Role | URL |
|------|-----|
| Administrator | http://localhost:8080/admin/login |
| Editor | http://localhost:8080/editor/login |
| Reviewer | http://localhost:8080/reviewer/login |
| Dispatcher | http://localhost:8080/dispatcher/login |
| Regular User | http://localhost:8080/login |

## Bootstrap Accounts

On first startup, the system creates one account per role with **random passwords**.
Credentials are written to a local file (not to logs) and must be saved immediately.

```bash
# Read bootstrap credentials (first startup only)
docker compose exec cineride-api cat /app/uploads/.bootstrap-credentials

# Then delete the file
docker compose exec cineride-api rm /app/uploads/.bootstrap-credentials
```

| Username | Role | Portal URL |
|----------|------|------------|
| admin | Administrator | /admin/login |
| editor1 | Editor | /editor/login |
| reviewer1 | Reviewer | /reviewer/login |
| reviewer2 | Reviewer | /reviewer/login |
| dispatcher1 | Dispatcher | /dispatcher/login |
| user1 | Regular User | /login |

All bootstrap accounts require a **password change on first login**.

## Architecture

```
┌────────────────────────────────────┐
│  Browser (LAN)  →  :80 Nginx      │
│                     ↓ /api/*       │
│  React SPA     →  Express :3000   │
│                     ↓              │
│                  MongoDB :27017    │
└────────────────────────────────────┘
```

Three Docker containers:
- **cineride-frontend** — Nginx serving React SPA + reverse proxy for `/api/*`
- **cineride-api** — Express REST API (internal only)
- **cineride-db** — MongoDB 7 (internal only)

## Features

### Movie Catalog
- CRUD with revision snapshots and version history
- Poster/still uploads (JPG/PNG, max 10 MB)
- Categories, tags, MPAA ratings (G, PG, PG-13, R, NC-17, NR)
- Import from JSON/CSV with field-by-field merge tool
- Publish/unpublish workflow

### Content Publishing
- Articles, galleries, videos, events
- Two-step review chain (different reviewers required)
- Sensitive word warning banner before submission
- Scheduled publishing with automatic cron-based activation
- Rejection requires documented reasons

### Ride Requests
- Pickup/drop-off, rider count (1-6), time window (max 4 hours)
- Vehicle type preference (sedan, SUV, van, shuttle)
- Cancellation: free within 5 min, dispatcher approval after
- Auto-cancel unmatched requests after 30 min
- Immutable state transition logs
- Dispute resolution by dispatchers

### Environmental Sensors
- High-frequency data ingest (up to 1 sample/second)
- Deduplication by device + timestamp
- Outlier detection (range, spike, drift)
- 180-day retention with automatic cleanup

### Funds Ledger
- Cash and card-on-file payment recording
- Idempotent duplicate prevention
- End-of-day close makes records immutable
- Failed entries retry with exponential backoff

### Search & Recommendations
- Unified search across movies, content, and users
- Typo-tolerant matching (Fuse.js)
- Query suggestions
- Personalized recommendations with cold-start defaults

### Security
- Local username/password login with bcrypt
- Role-based access control (5 roles)
- AES-256 encryption for sensitive fields
- Phone number masking: (415) ***-**21

## Running Tests

### Unit tests (no external dependencies)

```bash
npm install
npm run test:unit       # 188 tests — no MongoDB needed
```

### API integration tests (no Docker needed)

Uses `mongodb-memory-server` for an in-process MongoDB instance:

```bash
npm install
npm run test:setup-db   # one-time: downloads mongod binary (~90MB, cached)
npm run test:api:mem    # 21 tests: auth, password change, RBAC
```

### API integration tests (full suite, requires MongoDB)

```bash
docker compose up -d cineride-db
./run_tests.sh          # unit + full API integration suite
```

### Frontend tests

```bash
cd frontend && npm test  # 124 tests (vitest + RTL)
```

### All commands

```bash
npm run test:unit       # unit only (no DB)
npm run test:api:mem    # API with in-memory MongoDB (no Docker)
npm run test:api        # API with external MongoDB (needs localhost:27017)
npm run test:setup-db   # pre-download mongod binary for test:api:mem
```

### E2E smoke tests (Playwright)

Requires the full Docker stack running. Portal rendering tests run without credentials.
Authenticated tests require `E2E_ADMIN_PASSWORD` (the bootstrap admin password):

```bash
docker compose up --build -d
cd e2e && npm install && npx playwright install chromium

# Portal rendering only (no credentials needed)
npm test

# Full suite with authenticated flows
E2E_ADMIN_PASSWORD=<admin-bootstrap-password> npm test
```

## API Documentation

- Interactive Swagger UI: `http://localhost:8080/api/docs`
- Raw OpenApi JSON :'GET /api/docs.json'
## Configuration

Runtime configuration is managed through the Config Center (Admin → Config). Changes take effect within 60 seconds without server restart.

Key configuration values:
- `auto_cancel_minutes` — Time before unmatched rides auto-cancel (default: 30)
- `free_cancel_window_minutes` — Free cancellation window (default: 5)
- `dispute_escalation_hours` — Dispute escalation deadline (default: 24)
- `sensor_retention_days` — Sensor data retention (default: 180)
- `sensitive_words` — Words triggering content warnings
- `featured_tags` — Editor-curated tags for cold-start recommendations

## Project Structure

```
repo/
├── api/                    # Express backend
│   └── src/
│       ├── models/         # 15 Mongoose schemas
│       ├── middleware/      # Auth, RBAC, validation, errors
│       ├── routes/          # 15 route modules
│       ├── services/        # Business logic layer
│       ├── utils/           # Crypto, masking, state machine
│       ├── jobs/            # Scheduled cron jobs
│       └── app.js           # Express bootstrap
├── frontend/               # React SPA
│   └── src/
│       ├── components/     # Shared UI (layout, status, toast)
│       ├── features/       # Feature pages (10 modules)
│       ├── store/          # Zustand auth store
│       ├── services/       # API client
│       └── App.jsx         # Root with routing
├── unit_tests/             # Unit tests (crypto, masking, state machine)
├── API_tests/              # Integration tests (auth, movies, rides, content, ledger, sensors)
├── docker-compose.yml      # 3-container orchestration
├── Dockerfile.api          # API container build
├── Dockerfile.frontend     # Frontend multi-stage build
├── nginx.conf              # Nginx reverse proxy + SPA
└── run_tests.sh            # Unified test runner
```
