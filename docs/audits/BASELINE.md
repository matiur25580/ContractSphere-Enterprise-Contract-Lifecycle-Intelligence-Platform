# ContractSphere — Initial Engineering Audit

**Audit branch:** `audit/contractsphere-baseline`  
**Baseline:** `main` at `bef5bf867ea643dff7b8f4287420b33fbd0452da`  
**Date:** 2026-11-21  
**Status:** Initial source review; not a production-readiness certification.

## Scope reviewed

The initial review inspected the repository README, root and workspace package manifests, API startup and Express composition, environment validation, database connection handling, authentication routes and service, contract validation and service, intelligence routes, audit routes, template routes, workflow routes, TypeScript configuration, Git ignore rules, and the CI workflow.

This was a remote source review. No local dependency installation, test execution, build, live API exercise, penetration test, or cloud-configuration review has been performed yet. Do not interpret this report as evidence that those checks passed.

## Positive controls observed

- TypeScript strict mode is enabled, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Express security headers are enabled through Helmet; the API disables `x-powered-by`.
- Request payloads are bounded and domain inputs use Zod validation.
- Authentication uses bcrypt password hashes, short-lived JWT access tokens, opaque random refresh tokens, SHA-256 token hashes in persistence, HttpOnly refresh cookies, and refresh-session rotation.
- Tenant IDs are derived from verified access-token claims in the API middleware; inspected contract and audit queries include tenant scoping.
- Contract uploads use short-lived presigned URLs, file signature checks, bounded reads, malware scanning, and quarantine paths.
- The production environment schema requires a non-local HTTPS web origin, MongoDB, S3-compatible storage credentials, a JWT secret supplied by the operator, and a ClamAV host.
- The API exposes separate liveness and database-readiness endpoints.
- The CI workflow includes dependency auditing, type checking, builds, and API tests.

## Findings and actions

### F-01 — Dependency installation is not locked

**Evidence:** No root `package-lock.json` was found at the reviewed default-branch path. The CI workflow runs `npm install`.

**Risk:** Dependency resolution can change between builds, reducing reproducibility and making dependency-audit results less stable.

**Recommended action:** Generate and commit a root npm lockfile using the supported Node/npm versions, then change CI to `npm ci`. Confirm the lockfile covers both npm workspaces and that clean installation succeeds before merging.

**Priority:** Medium.

### F-02 — Upload completion needs a concurrency and failure-recovery test

**Evidence:** `completeDocumentUpload` reads an upload intent with `completedAt: null`, performs storage inspection and malware scanning, creates a version, updates the contract with an optimistic `latestVersion` condition, enqueues analysis, and marks the upload intent complete at the end.

**Risk:** The contract version update has a concurrency guard, but the upload intent is not visibly claimed atomically before the expensive processing. Concurrent completion requests and failures between version creation, job enqueue, and intent completion need explicit tests to prove idempotency and recoverability.

**Recommended action:** Add integration tests for duplicate concurrent completion, scanner outage, queue outage, and process interruption. If tests expose a duplicate-processing or stuck-intent state, implement an atomic processing claim/lease and a recovery path.

**Priority:** High (verification required; not yet confirmed as an exploitable defect).

### F-03 — CI reproducibility and supply-chain controls need strengthening

**Evidence:** The workflow uses `actions/checkout@v4`, `actions/setup-node@v4`, and `npm install`. The workflow has read-only repository contents permission, which is a good baseline.

**Risk:** Without a committed lockfile and dependency caching keyed to it, CI is less deterministic. Action references are major-version tags rather than immutable commit SHAs.

**Recommended action:** After F-01, use `npm ci`, configure npm caching, and consider pinning third-party actions to verified full commit SHAs with Dependabot/Renovate maintenance.

**Priority:** Medium.

### F-04 — Authorization boundaries require systematic negative tests

**Evidence:** Inspected routes use authentication middleware and several administrative operations use role guards. Contract service operations are tenant-scoped. Some contract operations intentionally appear available to all authenticated tenant members.

**Risk:** A code inspection of selected routes is not sufficient to prove object-level authorization across every module and nested resource.

**Recommended action:** Build a tenant-isolation matrix covering OWNER, ADMIN, MEMBER, inactive users, cross-tenant identifiers, contract ownership, document downloads, approval decisions, template approval, and audit access. Verify both allowed and denied paths.

**Priority:** High.

## Verification plan

1. Establish a deterministic clean install and commit the lockfile.
2. Run API tests, web type checking, and production builds.
3. Add integration tests for refresh-token rotation/replay, tenant isolation, workflow decision races, document upload idempotency, and queue recovery.
4. Review every API route and service for tenant and role enforcement.
5. Review storage bucket policy, presigned URL constraints, ClamAV failure behavior, logging redaction, and production environment configuration.
6. Run browser smoke tests for onboarding, contract creation, uploads, approvals, obligations, templates, and intelligence.
7. Publish a final audit with verified test output and explicit residual risks.

## Merge policy

This audit branch is intentionally separate from `main`. Merge only after the implementation changes and verification evidence are reviewed. Production deployment is outside this work and remains the repository owner's manual step.


## Follow-up investigation: CI and screenshot automation

### Confirmed finding F-05 — dashboard screenshot workflow blocked by required form field

- **Severity:** Medium (developer-experience / release-evidence reliability)
- **Evidence:** GitHub Actions run [44924116730](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44924116730), job 136906334064, failed in the `Capture dashboard screens` step.
- **Root cause:** `scripts/capture-dashboard.mjs` selected a contract and filled the contract text, but did not populate the required `Source label` input in the intelligence form. The submit button's Vue validation remained disabled and Playwright timed out at line 95.
- **Correction committed on this audit branch:** populate the required source label before waiting for the Analyze button. Commit: `11788d0bf9de62e51f45a5e517fa0c5f67e23351`.
- **Verification status:** change is committed, but the screenshot workflow has not yet been rerun against this branch. Do not treat this as fixed until the capture job passes.

### CI status observed during audit

- The latest observed main-branch CI run for commit `bef5bf867ea643dff7b8f4287420b33fbd0452da` completed successfully.
- A pull-request CI run for `fix/dashboard-screenshot-vue-form-sync` also completed successfully, including production dependency audit, typecheck, build, and API validation tests.
- The screenshot workflow on that same main commit failed as described above. These checks are separate; a green CI run does not imply screenshot generation succeeded.

### Additional reliability review notes

- The document upload path has a unique compound index on `(tenantId, contractId, version)`, which prevents duplicate contract-version rows during concurrent completion attempts.
- Upload intent completion is not claimed with an atomic processing state before scanning. Concurrent requests may repeat storage inspection and malware scanning before the unique version constraint resolves the race. Consider adding an atomic claim/lease and explicit retry recovery if integration tests demonstrate operational impact.
- Current document-job tests validate the status enum and OCR-selection helper, but do not exercise worker lease expiry, concurrent job claims, retry limits, or upload-completion races. Add database-backed integration tests before changing the worker or upload transaction behavior.
- The CI workflow currently installs with `npm install` and the root repository has no committed lockfile. The observed CI run passed, but dependency resolution is not pinned to a reviewed lockfile. Add and commit the workspace lockfile after a reproducible install/test run.



## Follow-up findings — 2026-11-21

This section records findings confirmed during the subsequent PR and source review. The audit remains an engineering review, not a production-readiness certification.

### F-05 — Dashboard screenshot automation requires a reliable submit path

- **Severity:** Medium (release-evidence reliability).
- **Evidence:** Screenshot runs 44927560961, 44927872201, 44928155837, and 44928928105 failed after the earlier source-label correction. Diagnostics showed that the fixture values were present in Vue component state while the rendered submit button remained disabled. A later attempt to force a component update produced a separate render error because the dashboard's `documentJobSummary` shape was not initialized as expected.
- **Correction:** PR #8 replaces mutation of Vue private/public component internals with Playwright form interaction, explicit form-state checks, and a dispatched submit event that exercises the Vue form submit handler. PR #8 merged as `7c0113ff595c127eeccf987c084e5c779337ac9f`.
- **Verification:** PR CI passed and main CI run [44929216169](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44929216169) passed. Dashboard screenshot run [44929216174](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44929216174) was still running at the time of this update. Therefore the screenshot issue is **not yet verified resolved**.

### F-06 — Workflow terminal state and contract state are not committed atomically

- **Severity:** High (data consistency; failure scenario requires integration verification).
- **Evidence:** `decideOnWorkflow` first updates a workflow instance to REJECTED or APPROVED/terminal state, then separately calls `Contract.updateOne` to transition the contract from IN_REVIEW to DRAFT or APPROVED. The result of the contract update is not checked. The two writes are not enclosed in a database transaction.
- **Risk:** If the contract update fails because the contract was changed/deleted or a database error occurs, the workflow can be terminal while the contract remains IN_REVIEW. A retry may not repair the mismatch because the workflow is no longer active.
- **Recommended action:** Add replica-set-backed integration tests that force the second write to fail and verify the expected invariant. Prefer a MongoDB transaction for both state changes if the production topology supports transactions. Otherwise introduce an explicit recoverable transition/outbox design and reconciliation process. Do not simply ignore a failed contract update or mark the workflow terminal before the contract transition is durable.
- **Status:** Confirmed from source inspection; runtime failure reproduction and remediation remain outstanding.

### F-07 — Access-token revocation is bounded by token lifetime, not immediate

- **Severity:** Medium (account deactivation/revocation behavior).
- **Evidence:** `requireAuth` verifies JWT signature/claims and populates request auth context but does not query the current user or tenant status. The `/me` endpoint separately calls `getCurrentUser`, which checks that both are active. Other authenticated routes rely on the verified access token and route-level tenant/role checks.
- **Risk:** A user or tenant deactivated after token issuance may continue to use an already-issued access token until it expires, unless another global revocation mechanism is applied. Refresh-token rotation does check active user and tenant state, preventing a deactivated account from obtaining a new access token.
- **Recommended action:** Confirm and document the accepted access-token revocation window. If immediate deactivation is required, add a low-cost token/session version check or cache-backed revocation strategy, and test it across protected routes.
- **Status:** Confirmed design behavior; severity depends on the required revocation SLA.

### F-08 — Refresh-token reuse detection and session-family revocation need review

- **Severity:** Medium (session security hardening).
- **Evidence:** Refresh rotation atomically marks the matching unrevoked, unexpired token hash as revoked before issuing a replacement. A repeated use of the old token returns INVALID_REFRESH_TOKEN. The inspected service does not visibly associate rotated tokens into a family or revoke the replacement session when reuse of an older token is detected.
- **Risk:** A replay attempt is rejected, but the service does not appear to detect a compromised token family and revoke its active successor. The security impact depends on the threat model and whether the attacker also possesses the latest refresh token.
- **Recommended action:** Review the refresh-session schema and threat model. Consider token-family identifiers and replay-triggered family revocation, with tests for simultaneous refreshes, replay, logout, and inactive users.
- **Status:** Requires schema and integration-test review before implementation.

## Current verification snapshot

- PR #2 through PR #8 were merged to main after their respective PR CI checks passed.
- PR #6 added atomic conditional updates for draft template edits and template approval; broader database race tests are still outstanding.
- Main CI run 44929216169 for merge commit `7c0113ff595c127eeccf987c084e5c779337ac9f` completed successfully.
- Main dashboard screenshot run 44929216174 was in progress when this section was authored; no success is claimed.
- No production deployment, cloud configuration review, penetration test, or production-like database integration suite has been performed by this audit.
