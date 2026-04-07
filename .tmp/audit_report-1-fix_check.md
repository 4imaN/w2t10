# CineRide Recheck (Static) — Round 4

Date: 2026-04-07
Scope: recheck remaining items and challenge prior conclusion.

## Conclusion
- Prior defect list status: **all fixed except one partial**.
- Remaining partial item:
  - Recommendation fallback test still uses indirect assertion for trending fill.

## Evidence
- Indirect assertion still present:
  - `unit_tests/recommendations.test.js:98-103`
  - It checks `filledResult.movies.length >= catOnlyResult.movies.length` rather than asserting concrete fallback movie IDs/branch composition.

## What is now clearly fixed
- Extension date-policy widening via `from` is blocked with `max(policyOldest, requestedFrom)`:
  - `api/src/routes/extensions.routes.js:148-161`
- OpenAPI parity no longer depends on Express router internals and uses explicit manifest:
  - `unit_tests/openapi-parity.test.js:1-52`
  - `api/src/routes/manifest.js:1-96`

## Reviewer note
- If acceptance criteria are "code path fixed" only, this can be treated as complete.
- If acceptance criteria include "strong deterministic tests for high-risk branches," the recommendation fallback test remains partial.
