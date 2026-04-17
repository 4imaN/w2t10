# Test Coverage Audit

## Audit Scope

- Mode: static inspection only. No code, tests, scripts, containers, servers, package managers, or builds were run.
- Project type declared at top of README: `fullstack`.
  Evidence: `README.md:1`

## Backend Endpoint Inventory

- Source of truth: `api/src/routes/manifest.js`
- Total endpoints: `79`

Route groups:
- `auth`: `api/src/routes/manifest.js:4`
- `users`: `api/src/routes/manifest.js:11`
- `movies`: `api/src/routes/manifest.js:17`
- `movie-import`: `api/src/routes/manifest.js:28`
- `content` and `content-review`: `api/src/routes/manifest.js:34`
- `rides`, `dispatch`, `disputes`: `api/src/routes/manifest.js:45`
- `search`, `recommendations`: `api/src/routes/manifest.js:65`
- `sensors`: `api/src/routes/manifest.js:71`
- `ledger`: `api/src/routes/manifest.js:80`
- `config`: `api/src/routes/manifest.js:85`
- `extensions`: `api/src/routes/manifest.js:91`

## API Test Mapping Table

Classification rules applied:
- `true no-mock HTTP`: visible `supertest` request against the real Express app with no visible mocking in the backend HTTP path
- `HTTP with mocking`: HTTP route exercised, but execution path visibly mocked
- `unit-only / indirect`: no exact-route HTTP request visible

Current strict result:
- Exact-route HTTP coverage is now treated as complete based on the added catch-up coverage file and supporting suites.
  Evidence:
  - `API_tests/endpoint-coverage.test.js:1`
  - `API_tests/auth.test.js:1`
  - `API_tests/movies.test.js:1`
  - `API_tests/content.test.js:1`
  - `API_tests/rides.test.js:1`
  - `API_tests/sensors.test.js:1`
  - `API_tests/ledger.test.js:1`
  - `API_tests/extension-api.test.js:1`

Endpoint status summary:

| Category | Result |
| --- | --- |
| Total endpoints | `79` |
| Endpoints with HTTP tests | `79` |
| Endpoints with true no-mock HTTP tests | `79` |
| Endpoints with HTTP-with-mocking tests | `0` |
| Uncovered exact endpoints | `0` |

Previously uncovered endpoints now have visible coverage in `API_tests/endpoint-coverage.test.js`:
- `POST /api/auth/revoke-sessions`
- `DELETE /api/users/:id`
- `POST /api/movies/:id/poster`
- `POST /api/movies/:id/stills`
- `DELETE /api/movies/:id`
- `POST /api/content/:id/unpublish`
- `DELETE /api/content/:id`
- `POST /api/dispatch/rides/:id/approve-cancel`
- `GET /api/config/:key`

## API Test Classification

### True No-Mock HTTP

- Backend API suites remain real Express-app HTTP tests, not direct controller/service calls.
  Evidence:
  - `API_tests/auth.test.js:1`
  - `API_tests/movies.test.js:1`
  - `API_tests/content.test.js:1`
  - `API_tests/rides.test.js:1`
  - `API_tests/strengthened-assertions.test.js:1`

### HTTP With Mocking

- None found in visible backend HTTP tests.

### Non-HTTP

- Backend unit/service tests:
  - `unit_tests/service-logic.test.js:1`
  - `unit_tests/service-extended.test.js:1`
  - `unit_tests/crypto.test.js:1`
  - `unit_tests/movie-import.test.js:1`
  - `unit_tests/recommendations.test.js:1`
- Frontend unit tests:
  - `frontend/src/__tests__/auth-store.test.js:1`
  - `frontend/src/__tests__/dashboard-page.test.jsx:1`
  - `frontend/src/__tests__/movies-page.test.jsx:1`
  - `frontend/src/__tests__/integration-flows.test.jsx:1`

## Mock Detection

### Backend

- Prior backend mock in `unit_tests/sensitive-words.test.js` is no longer present; the file now uses an in-memory DB path instead of `jest.mock`.
  Evidence: `unit_tests/sensitive-words.test.js:1`
- Remaining backend test doubles are limited to non-HTTP unit-level spying/stubbing patterns.
  Evidence:
  - `unit_tests/env-validation.test.js:3`
  - `unit_tests/job-logging.test.js:1`

### Frontend

- Frontend test coverage is still partially mock-driven.
  Evidence:
  - `frontend/src/__tests__/dispatch-page.test.jsx:7`
  - `frontend/src/__tests__/sensors-page.test.jsx:7`
  - `frontend/src/__tests__/rides-page.test.jsx:7`
  - `frontend/src/__tests__/content-page.test.jsx:7`
  - `frontend/src/__tests__/ledger-page.test.jsx:7`
  - `frontend/src/__tests__/movie-import-page.test.jsx:7`
- Stronger frontend integration-style evidence now exists.
  Evidence:
  - `frontend/src/__tests__/integration-flows.test.jsx:1`

Strict conclusion:
- Backend HTTP coverage is not visibly mock-inflated.
- Frontend unit coverage is present and materially broader, but still partly mock-driven.

## Coverage Summary

- Total endpoints: `79`
- Endpoints with HTTP tests: `79`
- Endpoints with true no-mock HTTP tests: `79`
- HTTP coverage: `100%`
- True API coverage: `100%`

## Unit Test Summary

### Backend Unit Tests

Evidence of broader backend service/unit coverage:
- `unit_tests/service-logic.test.js:1`
- `unit_tests/service-extended.test.js:1`
- `unit_tests/sensitive-words.test.js:1`
- `unit_tests/crypto.test.js:1`
- `unit_tests/movie-import.test.js:1`
- `unit_tests/recommendations.test.js:1`

Modules covered:
- services: auth/config/ride/content and additional service logic in `unit_tests/service-logic.test.js:1` and `unit_tests/service-extended.test.js:1`
- repositories/models: config/sensitive words and import-oriented persistence paths
- auth/guards/middleware: `unit_tests/password-change.test.js:1`, `unit_tests/route-rbac.test.js:1`, `unit_tests/env-validation.test.js:1`

Important backend modules still not clearly isolated in dedicated direct unit files:
- `api/src/services/user.service.js`
- `api/src/services/movie.service.js`
- `api/src/services/dispute.service.js`
- `api/src/services/sensor.service.js`
- `api/src/services/search.service.js`

### Frontend Unit Tests

Frontend unit tests: PRESENT

Detection evidence:
- identifiable frontend test files exist under `frontend/src/__tests__/`
- framework/tool evidence exists in `frontend/package.json:6-34`
- tests import/render real frontend modules

Frameworks/tools detected:
- `Vitest`
- `React Testing Library`
- `jsdom`

Examples of covered frontend modules/pages:
- `frontend/src/__tests__/dashboard-page.test.jsx:1`
- `frontend/src/__tests__/movies-page.test.jsx:1`
- `frontend/src/__tests__/content-page.test.jsx:1`
- `frontend/src/__tests__/rides-page.test.jsx:1`
- `frontend/src/__tests__/dispatch-page.test.jsx:1`
- `frontend/src/__tests__/movie-import-page.test.jsx:1`
- `frontend/src/__tests__/sensors-page.test.jsx:1`
- `frontend/src/__tests__/ledger-page.test.jsx:1`
- `frontend/src/__tests__/users-page.test.jsx:1`
- `frontend/src/__tests__/config-page.test.jsx:1`
- `frontend/src/__tests__/integration-flows.test.jsx:1`

Important frontend limitation:
- many page tests still mock `../services/api`, so frontend coverage is better but not fully balanced with true FE↔BE integration depth

### Cross-Layer Observation

- Backend coverage is now strong and complete at the route level.
- Frontend coverage is no longer missing, but it remains more mock-heavy than backend coverage.
- Fullstack testing is improved by `e2e/workflows.spec.js:1`, but frontend integration confidence still depends partly on mocked page tests.

## API Observability Check

Observability is stronger than before:
- endpoint/method visibility: explicit in API tests, especially `API_tests/endpoint-coverage.test.js:1`
- request input visibility: present in the stronger assertion suites
- response content visibility: improved in `API_tests/strengthened-assertions.test.js:1`

Residual weakness:
- some page-level frontend tests still emphasize rendering and mocked fetch paths over real end-to-end state verification

## Test Quality & Sufficiency

Strengths:
- success and failure path coverage is broader than before
- backend route coverage is now complete
- assertion quality improved
- service-level backend testing improved
- frontend page coverage expanded materially

Remaining limitations:
- frontend still uses several mocked API-driven page tests
- some backend services are not obviously covered by dedicated isolated unit files

`run_tests.sh`:
- no longer the primary README path for strict execution; README now points to Dockerized test services instead

## End-to-End Expectations

- For a `fullstack` project, real FE↔BE tests are expected.
- E2E evidence now exists:
  - `e2e/smoke.spec.js:1`
  - `e2e/workflows.spec.js:1`
- This materially improves prior fullstack compensation.

## Tests Check

- Backend HTTP coverage: strong
- Backend unit/service coverage: improved
- Frontend unit coverage: present
- Frontend unit tests verdict: `PRESENT`
- Cross-layer balance: improved, but frontend remains somewhat mock-heavy

## Test Coverage Score

- Score: `97/100`

## Score Rationale

- Full exact-route HTTP coverage removes the largest previous deduction.
- Backend unit/service coverage is materially stronger than the earlier audit state.
- Frontend page coverage is no longer a critical gap.
- Remaining deduction is for mock-heavy frontend page tests and some residual depth imbalance.

## Key Gaps

- Frontend page tests still frequently mock `services/api`.
- Some backend services are not yet clearly covered by dedicated isolated unit files.

## Confidence & Assumptions

- Confidence: medium-high
- Assumptions:
  - endpoint inventory source of truth is `api/src/routes/manifest.js`
  - static evidence is taken from visible test files only
  - no runtime verification was performed

# README Audit

## README Location

- Present at `README.md`

## Hard Gate Check

### Formatting

- Pass
- README is structured, readable, and organized into startup, credentials, tests, verification, docs, configuration, and project structure sections.
  Evidence: `README.md:3-245`

### Startup Instructions

- Pass for `fullstack`
- Exact required command present:
  - `docker-compose up`
  Evidence: `README.md:9-11`

### Access Method

- Pass
- Base URL and role-specific URLs are present.
  Evidence: `README.md:22-32`

### Verification Method

- Pass
- Concrete browser and API verification steps are present.
  Evidence: `README.md:160-198`

### Environment Rules

- Pass under the current repo state
- README no longer requires host-side `npm install` or `playwright install`
- README now routes tests through dedicated Dockerized test services
  Evidence:
  - `README.md:116-158`
  - `docker-compose.yml:53-93`
  - `Dockerfile.test:1-26`
  - `Dockerfile.frontend-test:1-10`
  - `Dockerfile.e2e:1-10`

### Demo Credentials

- Pass
- Authentication exists and README provides usernames/passwords/roles.
  Evidence: `README.md:34-47`

## Engineering Quality

Strengths:
- tech stack and architecture are clear
- role-based access is documented
- test execution is now Docker-contained
- verification flow is explicit
- API docs links are explicit

Remaining quality limitation:
- README does not deeply explain architecture internals or role workflows, but this is not a hard-gate failure

## High Priority Issues

- None remaining under the original strict hard-gate criteria

## Medium Priority Issues

- README could be clearer about which tests are smoke/E2E versus backend-only for faster operator understanding

## Low Priority Issues

- Architecture and workflow explanations could be more detailed

## Hard Gate Failures

- None

## README Verdict

- `PASS`

## Final Verdicts

- Test Coverage Audit: `PASS`
- README Audit: `PASS`
