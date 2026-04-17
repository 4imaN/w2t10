fullstack

# CineRide Media Operations Platform

Offline-first media operations platform unifying a local movie catalog, editorial content publishing, and ride-request order handling for small entertainment venues and community shuttles.

## Quick Start

```bash
docker-compose up
```

Or using the modern Docker Compose V2 CLI with a build step:

```bash
docker compose up --build -d
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

## Demo Credentials

The following accounts are pre-seeded on first startup with fixed passwords for demo and testing purposes:

| Username | Password | Role | Portal URL |
|----------|----------|------|------------|
| admin | DemoAdmin123! | Administrator | /admin/login |
| editor1 | DemoEditor123! | Editor | /editor/login |
| reviewer1 | DemoReviewer123! | Reviewer | /reviewer/login |
| reviewer2 | DemoReviewer123! | Reviewer | /reviewer/login |
| dispatcher1 | DemoDispatch123! | Dispatcher | /dispatcher/login |
| user1 | DemoUser123! | Regular User | /login |

All demo accounts require a **password change on first login**.

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

All tests run inside dedicated Docker containers. No local `npm install` is needed.
Test containers are defined in the `test` and `e2e` compose profiles and include
all required devDependencies (jest, supertest, vitest, Playwright, etc.).

### Unit tests (no external dependencies)

```bash
docker compose --profile test run --rm cineride-test \
  npx jest unit_tests/ --forceExit --detectOpenHandles --verbose
```

### API integration tests (requires MongoDB)

```bash
docker compose --profile test run --rm cineride-test \
  npx jest API_tests/ --forceExit --detectOpenHandles --verbose --runInBand
```

### Full backend test suite (unit + API)

```bash
docker compose --profile test run --rm cineride-test
```

### Frontend tests

```bash
docker compose --profile test run --rm cineride-frontend-test
```

### E2E tests (Playwright)

E2E tests run inside a dedicated container that includes Playwright and
Chromium. The container connects to the app stack via the Docker network.

```bash
# Start the stack, then run E2E tests
docker compose up --build -d
docker compose --profile e2e run --rm cineride-e2e

# Override the admin password if needed
E2E_ADMIN_PASSWORD=DemoAdmin123! docker compose --profile e2e run --rm cineride-e2e
```

## Verification

After running `docker-compose up`, verify the system is working:

1. **Health check** — confirm the API is running:
   ```bash
   curl http://localhost:8080/api/health
   # Expected: {"status":"ok", ...}
   ```

2. **Open the login page** — navigate to http://localhost:8080/login in your browser.

3. **Sign in as admin** — go to http://localhost:8080/admin/login and log in with:
   - Username: `admin`
   - Password: `DemoAdmin123!`
   - Complete the forced password change on first login.

4. **Create a movie** — from the dashboard, navigate to Movies → + Add Movie, fill in the title and details, then submit.

5. **Confirm the movie appears** — the new movie should be visible in the Movies list at http://localhost:8080/movies.

6. **Verify API directly** (optional):
   ```bash
   # Login via API
   curl -X POST http://localhost:8080/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"DemoAdmin123!","portal":"admin"}'

   # List movies (use the token from login response)
   curl http://localhost:8080/api/movies \
     -H "Authorization: Bearer <token>"
   ```

## API Documentation

- Swagger UI: http://localhost:8080/api/docs
- OpenAPI JSON: http://localhost:8080/api/docs.json

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
│       ├── routes/          # 16 route modules + manifest
│       ├── services/        # 12 business logic services
│       ├── utils/           # Crypto, masking, state machine
│       ├── jobs/            # Scheduled cron jobs
│       └── app.js           # Express bootstrap
├── frontend/               # React SPA
│   └── src/
│       ├── components/     # Shared UI (layout, status, toast)
│       ├── features/       # Feature pages (13 modules)
│       ├── store/          # Zustand auth store
│       ├── services/       # API client
│       ├── __tests__/      # Frontend unit tests (vitest + RTL)
│       └── App.jsx         # Root with routing
├── unit_tests/             # Backend unit tests (crypto, masking, state machine)
├── API_tests/              # API integration tests (auth, movies, rides, content, ledger, sensors)
├── e2e/                    # End-to-end smoke tests (Playwright)
├── scripts/                # Utility scripts (DB setup, health checks)
├── docker-compose.yml      # 3-container orchestration
├── Dockerfile.api          # API container build
├── Dockerfile.e2e          # Playwright E2E test runner
├── Dockerfile.frontend     # Frontend multi-stage build
├── Dockerfile.frontend-test # Frontend test runner (vitest)
├── Dockerfile.test         # Backend test runner (jest + supertest)
├── nginx.conf              # Nginx reverse proxy + SPA
└── run_tests.sh            # Docker-based test runner
```
