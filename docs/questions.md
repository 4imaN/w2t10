# CineRide — Business Logic Questions Log

This document records all ambiguities, gaps, and edge cases identified in the original Prompt that required interpretation or resolution before implementation.

---

## 1. "Two-Step Review Chain" — Same Reviewer or Different?

**Question:** The prompt says content publishing uses "a two-step review chain with required rejection reasons." It does not specify whether the same reviewer can perform both steps, or if two different reviewers are required.

**My Understanding:** Two separate reviewers are required for the chain to be meaningful as a quality gate. If the same person could approve both steps, the second review adds no independent judgment.

**Solution:** Step 1 and Step 2 reviewers must be different users (both with the `reviewer` role). The system enforces that `review.step_2.reviewer_id !== review.step_1.reviewer_id`. If only one reviewer exists in the system, the content remains in `in_review_2` until a different reviewer is available or an administrator overrides.

---

## 2. "Sensitive-Word Warning Banner" — Block or Allow Submission?

**Question:** The prompt says the UI provides "a sensitive-word warning banner before submission." It does not say whether the warning blocks submission or merely alerts the user. Also unclear: is the word list configurable, and who manages it?

**My Understanding:** The warning is advisory, not blocking. Editors should be able to acknowledge the warning and submit anyway — otherwise legitimate content containing flagged words (e.g., a movie review discussing violence) would be permanently blocked.

**Solution:**
- Before submission, content body is scanned against a configurable local word list stored in the config center
- If matches found: a yellow warning banner displays the flagged words
- Editor can click "Submit Anyway" (acknowledged flag stored on the content item) or revise
- The word list is managed by administrators through the config center
- Reviewer sees a note if the editor submitted with acknowledged warnings

---

## 3. Ride Request "Matching" — Manual or Automatic?

**Question:** The prompt describes ride request states including `pending_match` and `accepted`, but does not define how matching works. Is there an automatic matching algorithm (matching riders with drivers), or is this manual (dispatcher assigns)?

**My Understanding:** This is a community shuttle/venue context, not a rideshare marketplace. The prompt describes a Dispatcher role who "oversees trip requests." Matching is manual — dispatchers review pending requests and accept/match them to available vehicles or drivers.

**Solution:** Matching is dispatcher-driven:
1. Regular user posts ride request → enters `pending_match`
2. Dispatcher views queue of pending requests
3. Dispatcher clicks "Accept" → request moves to `accepted`
4. Dispatcher can add driver/vehicle assignment notes
5. If no dispatcher acts within 30 minutes → auto-canceled by scheduled job
- No automatic matching algorithm is implemented (the prompt describes no driver pool or matching criteria)

---

## 4. "Vehicle Type Preference" — What Types Exist?

**Question:** The prompt says ride requests include "vehicle type preference" but doesn't define the available vehicle types.

**My Understanding:** For a community shuttle context, reasonable vehicle types would be a small enum: sedan, SUV, van, shuttle/bus. This should be configurable through the config center.

**Solution:** `vehicle_type` is a string enum field on `RideRequest`, defaulting to `['sedan', 'suv', 'van', 'shuttle']`. The list is stored in the config center (`vehicle_types` key) and editable by administrators. The ride request form renders this as a dropdown.

---

## 5. "Media Fingerprints" — What Are They and How Generated?

**Question:** The prompt says movie models include "media fingerprints" but does not define what a fingerprint is or how it's computed.

**My Understanding:** Media fingerprints are content-based hashes of uploaded poster/still files, used for deduplication and integrity verification. This is similar to file checksums.

**Solution:** When a poster or still is uploaded, the server computes a SHA-256 hash of the file content and stores it as the `fingerprint` field on the media reference. This enables:
- Deduplication: if two uploads have the same fingerprint, reuse the existing file
- Integrity verification: re-compute hash on retrieval to detect corruption
- Import matching: fingerprints help identify whether an imported movie's media already exists locally

---

## 6. "Revision Snapshots" — Full Document or Diff?

**Question:** The prompt says movies preserve "revision snapshots" and the merge tool should preserve "a visible version history." It does not specify whether snapshots are full document copies or diffs.

**My Understanding:** Full document snapshots are simpler and more reliable for a merge/comparison tool. Diffs are compact but harder to reconstruct for display. Given this is a local MongoDB system (no storage pressure from cloud costs), full snapshots are practical.

**Solution:** Each revision snapshot is a full copy of the movie document at that point in time, embedded in a `revisions` array on the movie document. Each snapshot includes:
- `snapshot`: complete movie fields at that version
- `timestamp`: when the snapshot was created
- `changed_by`: user who made the change
- `change_type`: `create`, `edit`, `import_merge`, `unpublish`
The UI's version history view shows a timeline of snapshots with side-by-side diff highlighting between any two versions.

---

## 7. "Unpublish" — Soft Delete or Status Change?

**Question:** The prompt says staff can "unpublish titles." It does not clarify whether unpublishing is a soft delete (hidden from all users) or a status change where the movie still exists internally but is not shown to regular users.

**My Understanding:** Unpublish is a status change, not a delete. The movie remains in the system (for revision history, administrative views, potential re-publishing) but is hidden from regular user browsing and search.

**Solution:** Movies have an `is_published` boolean (default `true` on creation). Unpublishing sets `is_published = false`:
- Regular users: unpublished movies excluded from browse/search results
- Staff (editors, admins): unpublished movies visible with an "Unpublished" badge
- Unpublished movies retain all revision history
- Staff can re-publish by toggling `is_published` back to `true`
- A revision snapshot is created on unpublish/republish

---

## 8. "Scheduled Publishing" — Timezone Handling

**Question:** The prompt mentions "scheduled publishing" for content items but doesn't specify timezone handling. In an offline system, should scheduled times be relative to the server clock, the user's browser, or a configurable facility timezone?

**My Understanding:** Since this is an offline single-facility system, a configurable facility timezone stored in the config center is the most practical. The server clock (in UTC) handles all comparisons, but display formatting uses the facility timezone.

**Solution:**
- Config center has a `facility_timezone` key (e.g., `America/New_York`)
- Scheduled publish times are stored as UTC in MongoDB
- The frontend displays and accepts scheduled times in the facility timezone
- The cron job compares current UTC time against stored UTC schedule times — no timezone confusion in the comparison logic

---

## 9. "Environmental Sensor Data" — Relationship to Core Business

**Question:** The prompt adds environmental data collection as a feature, but doesn't explain its relationship to the movies, content, or ride-request domains. Why does a media operations platform need sensor data?

**My Understanding:** The prompt describes "small entertainment venues and community shuttles." Environmental sensors likely monitor venue conditions (temperature, humidity, air quality) or shuttle conditions (engine temp, fuel). It's a facility operations concern, separate from the media/ride domains. The prompt treats it as a standalone subsystem.

**Solution:** Implemented as an independent module with:
- No foreign keys to movies, content, or rides
- Its own dashboard section visible to administrators and dispatchers (facility management)
- Standalone REST endpoints under `/api/sensors/*`
- The module is self-contained and can be disabled via config center flag if a facility doesn't have sensors

---

## 10. "Config Center" — Runtime or Restart-Required?

**Question:** The prompt describes a "local config center" managing statuses, tags, priority values, auto-cancel minutes, dispute escalation windows, and reminder thresholds. It does not say whether config changes take effect immediately or require a server restart.

**My Understanding:** For operational flexibility (especially offline, where restarting services is disruptive), config changes should take effect at runtime without restart.

**Solution:** Config values are loaded from MongoDB on each relevant API call (with a lightweight in-memory cache that refreshes every 60 seconds). When an admin updates a config value:
- The change is written to MongoDB immediately
- The in-memory cache refreshes on the next cycle (within 60 seconds)
- Critical configs (like auto-cancel minutes) are used by scheduled jobs that re-read config on each run cycle
- No server restart required

---

## 11. "Extension Endpoints" — Scope and Security

**Question:** The prompt mentions "extension endpoints available for optional third-party integration strictly within the same offline environment." It does not define what these endpoints expose or how they're secured beyond RBAC.

**My Understanding:** These are generic integration hooks that external on-prem systems can use to read/write data. They should expose a controlled subset of the API (not the full internal API) with distinct authentication.

**Solution:**
- Extension endpoints live under `/api/extensions/*`
- Authenticated via API keys (generated by admin, stored in `extension_clients` collection)
- Each key has scoped permissions (read-only, or read-write on specific resource types)
- Rate-limited (configurable, default 120 req/min per client)
- All access logged for audit


---

## 12. "Reconciliation Records Cannot Be Edited After End-of-Day Close" — What Triggers Close?

**Question:** The prompt says reconciliation records cannot be edited after end-of-day close, but does not say who triggers the close, whether it's automatic, or what time "end of day" means.

**My Understanding:** End-of-day close should be a manual action taken by an authorized user (administrator or dispatcher), not automatic. "End of day" is facility-specific and varies.

**Solution:**
- Authorized users (admin, dispatcher) can trigger a "Close Day" action for a specific date
- On close: all ledger entries and reconciliation for that date become immutable (API rejects any update/delete)
- The close action itself is logged with timestamp and user
- A "closed" badge shows on the date's reconciliation view
- Reopening a closed day is not allowed (immutability is absolute)
- If there's an error in a closed day: a correcting entry must be created on a new day's ledger

---

## 13. "Typo-Tolerant Matching" — Implementation Approach Without Internet

**Question:** The prompt requires "typo-tolerant matching" for search, but standard approaches (Elasticsearch, Algolia) require either external services or significant memory footprint. MongoDB text search gives basic tokenized search but not true fuzzy matching.

**My Understanding:** For an offline system without Elasticsearch, a hybrid approach is needed: MongoDB text indexes for basic search + Fuse.js for client-side fuzzy matching on the result set.

**Solution:**
- **MongoDB text indexes** on movies (title, description, tags), content (title, body), and users (username, display name) for fast server-side full-text search
- **Fuse.js** (lightweight, ~6KB gzipped, runs in Node.js) for fuzzy/typo-tolerant re-ranking of MongoDB results
- **Query suggestions:** pre-computed from frequently searched terms, popular movie titles, and tag names — stored in a `search_suggestions` collection, updated by a nightly job
- **Filters** (popularity, rating, newest) applied as MongoDB query modifiers before Fuse.js re-ranking

---

## 14. "Recommendations Using Local Behavior Signals" — What Signals?

**Question:** The prompt says recommendations use "local behavior signals with a cold-start default of trending movies and editor-curated tags." It does not define what behavior signals are collected or how "trending" is measured.

**My Understanding:** Behavior signals are local interactions: movie views, search queries, content reads, ride request patterns. "Trending" is measured by recent view/interaction volume.

**Solution:**
- **Behavior tracking:** `user_interactions` collection stores `{ user_id, entity_type, entity_id, action_type, timestamp }` for movie views, content reads, searches
- **Trending:** computed by counting interactions in the last 7 days, sorted by count descending
- **Personalization:** weighted combination of user's recent interactions (content-based: recommend movies with similar categories/tags to viewed movies)
- **Cold-start:** for new users with no interaction history, show trending movies + items tagged with editor-curated "featured" tags
- **Editor-curated tags:** config center has a `featured_tags` key, managed by editors/admins

---

## 15. "MPAA-Style Rating" — Exact Values?

**Question:** The prompt says movies maintain "MPAA-style rating" but doesn't list the specific values.

**My Understanding:** Standard MPAA ratings apply: G, PG, PG-13, R, NC-17. Since this is described as "MPAA-style" (not "MPAA"), a "Not Rated" option should also exist.

**Solution:** Rating is a string enum: `['G', 'PG', 'PG-13', 'R', 'NC-17', 'NR']` where `NR` = Not Rated. Managed in config center for potential future modification. Displayed as colored badges (green for G, yellow for PG, orange for PG-13, red for R/NC-17, gray for NR).

---

## 16. "Rider Count 1–6" and "Time Window Up to 4 Hours" — Validation Details

**Question:** The prompt specifies rider count (1–6) and time window (up to 4 hours), but doesn't say whether overrides are possible or what happens at the boundaries.

**My Understanding:** These are hard limits enforced by both frontend validation and backend validation. No overrides — these represent physical constraints (vehicle capacity, operational window).

**Solution:**
- `rider_count`: integer, min 1, max 6 — validated at both frontend (number input with min/max) and backend (Joi/express-validator). Requests outside range rejected with 422.
- `time_window`: the difference between `time_window_start` and `time_window_end` must be ≤ 4 hours. Backend validates the span on creation and update. Frontend time picker prevents selecting a span > 4 hours.
- `time_window_start` must be in the future (at least 5 minutes from now, configurable in config center)

---

## 17. "Dispute" — Who Can Initiate and What Happens?

**Question:** The prompt says orders can move to "in dispute" status and that dispatchers "resolve disputes," but doesn't say who can initiate a dispute, what constitutes one, or what resolution options exist.

**My Understanding:** Either the rider (regular user) or the dispatcher can initiate a dispute. Disputes arise from issues like no-show, wrong route, fare disagreement, or service complaints.

**Solution:**
- **Who can initiate:** the ride requester (regular user) or any dispatcher
- **Dispute reasons:** enum of `['no_show', 'wrong_route', 'fare_dispute', 'service_complaint', 'other']` with free-text detail
- **Resolution options:** `['resolved_in_favor_of_rider', 'resolved_in_favor_of_driver', 'partial_refund', 'no_action', 'escalated']`
- **Workflow:** dispute created → assigned to dispatcher → investigation (notes encrypted at rest) → resolution selected → dispute closed
- **Escalation window:** configurable in config center (default 24 hours). If unresolved within the window, flagged as "escalation needed" for admin attention

---

## 18. RBAC Permission Matrix — Five Roles

**Question:** The prompt names five roles (Administrator, Editor, Reviewer, Dispatcher, Regular User) with brief descriptions, but does not provide a complete permission matrix.

**My Understanding:** Permissions must be inferred from the role descriptions and business context. Least-privilege principle applies.

**Solution:**

| Capability | Admin | Editor | Reviewer | Dispatcher | Regular User |
|---|---|---|---|---|---|
| User management | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| System config | ✅ Full | ❌ | ❌ | ❌ | ❌ |
| Movie CRUD | ✅ | ✅ | ❌ | ❌ | ❌ |
| Movie import/merge | ✅ | ✅ | ❌ | ❌ | ❌ |
| Upload posters/stills | ✅ | ✅ | ❌ | ❌ | ❌ |
| Unpublish movies | ✅ | ✅ | ❌ | ❌ | ❌ |
| Browse movies | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create content | ✅ | ✅ | ❌ | ❌ | ❌ |
| Review content (step 1 & 2) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Publish/schedule content | ✅ | ✅ (after review) | ❌ | ❌ | ❌ |
| Browse published content | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit ride request | ✅ | ✅ | ✅ | ✅ | ✅ |
| Cancel own ride | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approve cancellation | ✅ | ❌ | ❌ | ✅ | ❌ |
| Accept/match rides | ✅ | ❌ | ❌ | ✅ | ❌ |
| Resolve disputes | ✅ | ❌ | ❌ | ✅ | ❌ |
| Initiate dispute | ✅ | ✅ | ✅ | ✅ | ✅ |
| View sensor dashboard | ✅ | ❌ | ❌ | ✅ | ❌ |
| Manage sensor devices | ✅ | ❌ | ❌ | ❌ | ❌ |
| Record ledger entries | ✅ | ❌ | ❌ | ✅ | ❌ |
| Close-day reconciliation | ✅ | ❌ | ❌ | ✅ | ❌ |
| View ledger (read-only) | ✅ | ❌ | ❌ | ✅ | ❌ |
| Use search | ✅ | ✅ | ✅ | ✅ | ✅ |
| View recommendations | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage extension API keys | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage sensitive word list | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 19. "Payment Recording" vs. "Actual Payment Processing"

**Question:** The prompt describes an offline "payment" system as a "local funds ledger" with cash/card-on-file entries. It's unclear whether the system actually processes payments or merely records that a payment occurred externally.

**My Understanding:** This is a **recording/bookkeeping** system, not a payment processor. Cash is handled physically. Card-on-file means a pre-authorized card number is on file for the customer, and the venue charges separately. The ledger tracks that these transactions happened.

**Solution:**
- The system records that a payment of amount X was made via method Y with receipt number Z
- No actual card charging, no payment gateway integration
- "Card-on-file" is a label, not an action — the venue handles the actual charge externally
- The ledger's job: track amounts, ensure consistency, prevent double-entries (idempotency), and produce reconciliation reports
- This interpretation is consistent with "offline-first" — no internet means no payment processor

---

## 20. Data Deletion Strategy — Physical vs. Logical Delete

**Question:** The prompt does not specify whether deleting entities (users, movies, content, rides) should be a hard delete or soft delete.

**My Understanding:** Given the audit trail requirements (immutable state transition logs for rides, revision history for movies, review audit trails for content), soft delete is necessary. Hard deleting a movie that has revision snapshots or a ride with transition logs would break traceability.

**Solution:** All domain entities use soft delete via a `deleted_at` timestamp field:
- Soft-deleted records excluded from normal queries
- Remain visible in audit/revision/transition references
- Can be restored by an administrator
- Never physically purged

---

## 21. "Offline Cache and Resumable Transfer" for Sensors — Server or Client Responsibility?

**Question:** The prompt says sensor data collection supports "an offline cache and resumable transfer." It's unclear whether this caching happens on the sensor device side, the server side, or a middleware layer.

**My Understanding:** The prompt says "for on-prem sensors via high-frequency sampling." The cache is on the sensor/device side (or its local gateway). When the sensor can't reach the server, it queues readings locally. When connectivity resumes, it batch-sends with original timestamps. The server's responsibility is to accept the batch, deduplicate, and process.

**Solution:**
- **Sensor/device side** (out of scope for this system): assumed to cache readings when server is unreachable
- **Server side:** accepts batch ingest endpoint (`POST /api/sensors/ingest/batch`) with array of readings, each with device_id + timestamp
- Deduplication: rejects readings where `(device_id, timestamp)` already exists
- Time synchronization: server compares device timestamps against server clock, flags readings with >5-minute drift for review
- Processing: each batch reading goes through the same outlier detection pipeline as single readings

---

## 22. "Query Suggestions" — Pre-computed or Real-time?

**Question:** The prompt says search provides "query suggestions." It does not specify whether suggestions are computed in real-time as the user types, or pre-computed from popular queries.

**My Understanding:** Hybrid approach: pre-computed popular suggestions augmented with real-time prefix matching against known entities (movie titles, usernames, content titles).

**Solution:**
- **Pre-computed:** a `search_suggestions` collection stores popular search terms, frequently viewed movie titles, and active content titles — refreshed by a nightly job
- **Real-time prefix:** as the user types ≥2 characters, the frontend queries `GET /api/search/suggest?q=<partial>` which does prefix matching against the pre-computed suggestions and entity titles
- Suggestions displayed as a dropdown below the search input, grouped by type (Movies, Content, Users)
- Maximum 10 suggestions returned per request for UI simplicity
