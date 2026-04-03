# CineRide Media Operations Platform — Technical Design Document

## Architecture

Three-container Docker Compose topology:
- **cineride-frontend** (Nginx) — serves React SPA, reverse-proxies `/api/*` to API container
- **cineride-api** (Express/Node 18) — REST API on port 3000 (internal only)
- **cineride-db** (MongoDB 7) — data persistence on port 27017 (internal only)

Single entry point: users access `http://<server-ip>:8080`. Nginx handles SPA routing and API proxying. No CORS needed.

## Domain Models

### Users & Auth
- Local username/password only. Passwords salted with bcrypt (cost 12).
- JWT tokens with configurable expiry. Server-side session records for revocation.
- 5 roles: administrator, editor, reviewer, dispatcher, regular_user.

### Movies
- CRUD with revision snapshots (full document copies). Media fingerprints (SHA-256) for deduplication.
- Poster/still uploads: JPG/PNG only, 10 MB max. Stored on local disk.
- MPAA-style ratings: G, PG, PG-13, R, NC-17, NR.
- Import/merge tool: file upload → conflict detection → field-by-field resolution → merge with version history.

### Content Publishing
- Types: article, gallery, video, event.
- State machine: draft → in_review_1 → in_review_2 → scheduled/published.
- Two-step review chain: step 1 and step 2 reviewers must be different users.
- Sensitive word scanning: configurable word list, advisory warning (not blocking).
- Scheduled publishing: cron job checks every minute.

### Ride Requests
- Rider count: 1–6. Time window: max 4 hours.
- Vehicle types: sedan, suv, van, shuttle (configurable).
- State machine: pending_match → accepted → in_progress → completed.
- Cancellation: free within 5 min, requires dispatcher approval after.
- Auto-cancel: 30 min for unmatched requests (configurable).
- Immutable state transition log.

### Disputes
- Initiated by any user. Resolved by dispatchers.
- Reasons: no_show, wrong_route, fare_dispute, service_complaint, other.
- Resolution notes encrypted at rest (AES-256).
- Escalation deadline: configurable (default 24h).

### Environmental Sensors
- High-frequency ingest: up to 1 sample/second/device.
- **Authentication:** per-device secret (bcrypt-hashed). Headers: `X-Device-Id` + `X-Device-Secret`. Body device_id must match header (anti-spoofing).
- Deduplication by (device_id, timestamp, is_raw).
- **Outlier detection:** range check, spike detection, value drift detection, **time drift detection**.
- **Time synchronization:** readings with timestamp drift > configurable threshold (default 300s/5min) are flagged with `outlier_flags.time_drift = true` and excluded from the cleaned dataset. Drift is measured as `|reading_timestamp - server_now|`.
- **Dual retention:** every ingest stores a raw reading. Clean readings (no outlier flags) also get a separate cleaned copy. Unique index includes `is_raw` to allow coexistence.
- **Resumable batch transfer:** batch sessions persisted in MongoDB (BatchSession model) with TTL auto-cleanup. Clients pass `X-Batch-Session` header to resume interrupted uploads.
- **Secret rotation:** admin can rotate device secret via POST `/api/sensors/devices/:id/rotate-secret`.
- 180-day retention with MongoDB TTL index.

### Funds Ledger
- Recording-only system (no payment processing).
- Payment methods: cash, card_on_file.
- Idempotency key prevents duplicate entries.
- Failed entries retry 3× with exponential backoff.
- End-of-day close makes reconciliation records immutable.

## Security

- Local-only authentication (no OAuth, no external providers).
- Salted bcrypt hashing (cost factor 12).
- AES-256-CBC encryption for sensitive fields (dispute notes, ledger references).
- Phone number masking: `(415) ***-**21` format for non-admin roles.
- Role-based access control at route level.
- Extension API: separate API key auth with scoped permissions and rate limiting.

## Config Center

Runtime-configurable values stored in MongoDB. In-memory cache refreshes every 60 seconds. No server restart needed for config changes.

## Search & Recommendations

- **Typo-tolerant search:** MongoDB `$text` indexes provide stemmed matching. When text search returns no results (e.g., for typos like "Godfathr"), the service loads a broader candidate pool and applies Fuse.js fuzzy matching as the primary filter, not just a re-ranker. This ensures typos produce meaningful results instead of empty sets.
- **Fuzzy suggestions:** When prefix matching returns fewer than 3 suggestions, the full suggestion pool is fuzzy-matched against the partial query (Fuse.js, threshold 0.5).
- **Filters:** popularity, rating (MPAA order), newest. Applied after fuzzy ranking.
- **User search restriction:** user directory search is intentionally limited to administrator and dispatcher roles. Other roles see only movie and content results. This is a privacy design decision to prevent user enumeration by non-operational staff.
- Query suggestions from pre-computed popular terms (nightly refresh).
- Personalized recommendations: content-based (similar categories/tags to viewed movies).
- Cold-start: trending movies (7-day interaction count) + editor-curated featured tags.

## Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Auto-cancel | Every minute | Cancel unmatched rides after 30 min |
| Scheduled publish | Every minute | Publish content with past scheduled dates |
| Sensor cleanup | Daily 3 AM | Remove readings older than 180 days |
| Ledger retry | Every 5 min | Retry failed ledger postings (3× max) |
| Suggestions refresh | Daily 2 AM | Rebuild search suggestion index |

## Soft Delete

All domain entities use `deleted_at` timestamp for soft delete. Records remain for audit trails and references.
