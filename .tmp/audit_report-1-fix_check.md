# CineRide Recheck (Static) — Round 4

Date: 2026-04-07
Scope: recheck remaining items and challenge prior conclusion.

## Conclusion
- Prior defect list status: **all fixed**.
- Remaining partial item:
  - None. Recommendation fallback test now uses concrete assertions for trending fill.

## Evidence
- Recommendation fallback test now asserts concrete fallback composition in active source:
  - `w2t10/repo/unit_tests/recommendations.test.js:110`
  - `w2t10/repo/unit_tests/recommendations.test.js:111`
  - `w2t10/repo/unit_tests/recommendations.test.js:112`
- The indirect length-only assertion (`filledResult.movies.length >= catOnlyResult.movies.length`) is no longer present in active test files.

## What is now clearly fixed
- Extension date-policy widening via `from` is blocked with `max(policyOldest, requestedFrom)`:
  - `api/src/routes/extensions.routes.js:148-161`
- OpenAPI parity no longer depends on Express router internals and uses explicit manifest:
  - `unit_tests/openapi-parity.test.js:1-52`
  - `api/src/routes/manifest.js:1-96`

## Reviewer note
- If acceptance criteria are "code path fixed" only, this is complete.
- If acceptance criteria include "strong deterministic tests for high-risk branches," this is also complete.
