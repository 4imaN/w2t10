You are fixing a full-stack project called CineRide Media Operations Platform. The current acceptance verdict is `Partial Pass`.

Your job is to remediate every `Partial Pass` area and every `High`-severity finding from the audit below, without weakening any existing implemented functionality.

Constraints:
- Do not remove core features that already exist.
- Preserve offline-first behavior.
- Preserve React frontend + Express backend + MongoDB architecture.
- Keep role-based portals and workspaces intact.
- Prefer production-safe fixes over demo shortcuts.
- Add or update tests for every changed security-critical or requirement-critical path.
- Update README/setup instructions if behavior changes.

Remediation scope:

1. High-severity finding: committed runtime secrets
- The repo currently ships a committed `.env` containing a real JWT secret and encryption key.
- Docker Compose consumes that file directly for the API container.
- Fix this by removing committed runtime secrets from version control, using a safe bootstrap flow, and ensuring startup requires runtime-generated secrets.
- Keep `.env.example`, but do not keep live secrets in the repo.
- Rotate any exposed secrets in docs/examples if relevant.

Evidence from audit:
- `.env` contains `JWT_SECRET` and `ENCRYPTION_KEY`
- `docker-compose.yml` uses `env_file: .env`

Required outcome:
- No committed live secrets.
- Startup remains documented and reproducible.
- Secret handling is minimally professional for local offline deployment.

2. High-severity finding: predictable seeded privileged credentials
- The seed flow creates fixed credentials for administrator, editor, reviewer, dispatcher, and user accounts.
- The README publishes those credentials.
- This is not acceptable for a LAN-accessible workstation deployment.
- Replace permanent seeded passwords with a safer bootstrap approach.

Required outcome:
- No permanent shared default privileged passwords.
- Use one-time bootstrap credentials, forced password reset, install-time credential generation, or equivalent.
- Update README so it no longer advertises long-lived privileged credentials.
- Add tests for the new credential/bootstrap behavior where practical.

3. High-severity finding: movie import merge logic is not requirement-complete
- The prompt requires a visible merge tool with field-by-field conflict handling while preserving version history.
- Current import matching uses title-only matching even though the code comment says title + release year.
- Current conflict generation omits important managed fields such as `release_date`.
- This can merge into the wrong movie and misses required conflict surfaces.

Required outcome:
- Matching must use a safer strategy than title-only.
- Conflict detection must include `release_date` and any other prompt-critical movie fields that can legitimately differ.
- Field-by-field resolution must still work.
- Version history must still be preserved after import merges.
- Add automated coverage for parse, conflict detection, merge execution, and revision preservation.

4. Partial Pass area: authentication
- Authentication is partially acceptable because bcrypt hashing and session-backed JWT auth exist.
- But acceptance is still blocked by weak bootstrap security: committed secrets and predictable seeded credentials.

Required outcome:
- After fixes, authentication should be defensible for local offline deployment.
- Validate password-related flows with tests.
- Ensure no regression to login/logout/session behavior.

5. Partial Pass area: route authorization
- Route-level RBAC appears broadly present, but full runtime confidence is limited.
- Strengthen confidence where security-sensitive endpoints lack coverage.

Required outcome:
- Keep existing route authorization intact.
- Add or extend tests for sensitive protected endpoints, especially if you touch them.
- Verify no unauthorized role can access admin/dispatch/security-sensitive surfaces introduced or modified by your changes.

6. Partial Pass area: object-level authorization
- Some object ownership controls exist for rides/disputes, but coverage is incomplete.
- Do not regress these protections while fixing other issues.

Required outcome:
- Preserve current ride/dispute object-level restrictions.
- If import/admin/security changes touch object access, add negative tests for cross-user access.

7. Partial Pass area: tenant/user isolation
- This is a single-facility system, not a multi-tenant app, but user-level isolation still matters.
- Keep role and ownership boundaries intact.

Required outcome:
- No cross-user data exposure should be introduced.
- Preserve masking and encrypted-field handling where already implemented.

8. Partial Pass area: test sufficiency
- Unit tests and frontend tests passed, but API integration confidence is incomplete.
- Major gaps identified by the audit:
  - movie import parsing/conflict-resolution/execute/version-history behavior
  - extension endpoint auth/permission/rate-limiting coverage
  - password-change validation coverage

Required outcome:
- Add the minimum high-value API/integration tests needed to close these gaps.
- At minimum, cover:
  - import parsing and conflict generation
  - import merge execution and revision history preservation
  - password change validation success/failure cases
  - extension auth rejection and permission enforcement

Specific implementation notes from audit:
- `POST /api/auth/change-password` currently lacks explicit request validation for `new_password`.
- The CSV import parser is naive and uses simple comma splitting.
- Import-related automated coverage is currently too shallow.

Definition of done:
- All three high-severity findings above are remediated.
- All listed partial-pass areas are addressed enough to improve acceptance confidence.
- Tests are added/updated for every critical fix.
- README and setup flow reflect the new secure bootstrap path.
- Provide a short change summary and a verification summary listing exactly what was tested.
