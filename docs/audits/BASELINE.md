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


## Verification update — post-PR #12 (2026-11-21)

### Confirmed CI and browser evidence

- Main CI run [44930340521](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44930340521) completed with conclusion **success** on merge commit `c8fb942284bc4f2de24322316d7396be1be083e5`.
- Dashboard screenshot run [44930340356](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44930340356) completed with conclusion **success** on the same merge commit.
- This verifies that the main CI workflow and configured dashboard screenshot workflow passed for this revision. It does not constitute a production-like end-to-end test or prove every browser flow.

### F-06 follow-up — workflow/contract consistency

- **Status:** Source-level concern remains open; no runtime failure has been reproduced.
- The current workflow service still writes a terminal state to `WorkflowInstance` and then separately attempts to update the associated `Contract`. The contract update result is not checked. A failure between these writes can leave workflow and contract state inconsistent.
- The workflow instance and definition schemas have a unique partial index for one active workflow per tenant/contract and a tenant/name unique index for definitions. These indexes protect duplicate active instances and duplicate definition names, but do not make the workflow/contract state transition atomic.
- **Next verification:** replica-set-backed integration tests should force contract-write failure after the workflow transition. Remediation should use a transaction where supported, or a durable recoverable transition/outbox plus reconciliation. Do not mark this risk resolved based only on the green CI run.

### F-07/F-08 follow-up — authentication/session behavior

- The access middleware validates JWT signature and required claims but does not re-check current user/tenant status on every request. Account deactivation therefore does not immediately invalidate already-issued access tokens; the effective window is bounded by access-token expiry unless another revocation control exists.
- Refresh rotation atomically consumes an unrevoked, unexpired token and checks that both user and tenant remain active before issuing a replacement. Reuse of the consumed token is rejected. The inspected refresh-session schema has no token-family identifier, so family-wide revocation on replay is not implemented in the reviewed code.
- These are explicit session-policy decisions requiring threat-model and integration-test coverage, not evidence that authentication is bypassable.

### F-09 — Document worker lease expiry can permit duplicate processing side effects

- **Severity:** Medium; operational risk requiring database-backed reproduction.
- **Evidence:** The worker claims a job with a five-minute lease and reclaims expired `PROCESSING` jobs. Successful analysis writes a report before the worker conditionally marks the job `SUCCEEDED` using its worker ID.
- **Risk:** If analysis runs longer than the lease, another worker may reclaim the same job while the original analysis is still running. The old worker's final job update is fenced by `lockedBy`, but any report or other side effect created before that update may already have occurred. This can produce duplicate analysis side effects even though only one worker ultimately owns the job record.
- **Recommended action:** Add an integration test with a deliberately delayed analysis exceeding the lease. Consider lease renewal/heartbeat and idempotency keys or a unique report/job relationship so side effects are safe under retries and lease takeover. Verify shutdown and retry behavior as well.
- **Status:** Risk identified from source inspection; no duplicate side effect has been reproduced.

### Current evidence and remaining limitations

- PRs #2–#12 are merged to `main`; PR #1 remains stale/open and is not treated as an accepted fix.
- Main CI and dashboard screenshot workflows passed for merge commit `c8fb942284bc4f2de24322316d7396be1be083e5`.
- The current test suite includes validation-focused auth/workflow tests and basic document-job lifecycle/OCR helper tests. It does not yet provide the database-backed concurrency and authorization matrix described above.
- The root workspace still has no committed `package-lock.json`; CI continues to use `npm install`. Reproducible dependency installation remains outstanding.
- No local clean install, local test/build execution, replica-set integration suite, production cloud configuration review, penetration test, or deployment has been performed as part of this remote review.


## Verification update — PRs #14 and #15 (2026-11-21)

### Merged test coverage

- PR #14 added unit tests for authentication middleware: missing bearer credentials, malformed/expired JWTs, missing required claims, unsupported roles, verified claim attachment, and role-guard behavior. Its GitHub Actions verification passed before merge. Merge commit: `c2d196df3ae12f97efddfcab4c276aed205059b3`.
- PR #15 added deterministic unit tests for contract-intelligence rule analysis: Unicode normalization, critical uncapped-liability findings, evidence offsets, broad indemnity wording, missing clause flags, renewal-notice handling, severity ordering, and risk counters. Its GitHub Actions verification passed before merge. Merge commit: `d151024a970d5f6fc66eccd2c79c8d7731dfa18c`.
- These tests improve middleware and pure analysis-function coverage. They do **not** constitute database-backed authorization, tenant-isolation, workflow-transition, upload-concurrency, or worker-lease integration tests.

### Current CI and verification limitations

- PR #14 verification run [44930804855](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44930804855) completed successfully.
- PR #15 verification run [44930993839](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44930993839) completed successfully.
- The CI workflow currently runs `npm install`, production dependency audit, workspace typecheck/build, and API Vitest tests. It does not provision MongoDB or a replica set, so it cannot verify database transaction semantics, unique-index races, worker lease takeover, or tenant isolation against a real database.
- The root `package-lock.json` remains absent. Do not claim deterministic dependency resolution until a lockfile is generated and `npm ci` succeeds in CI.
- The upload completion path still has no atomic processing claim before storage inspection/scanning. The compound contract-file version index and optimistic contract update mitigate some races, but concurrent requests can repeat scanning and failure/retry behavior between file creation, job enqueue, and intent completion remains unverified.
- F-06 workflow/contract non-atomic transition and F-09 worker lease/idempotency risks remain open as described above.

**Scope note:** This is a remote source and GitHub Actions review. No local clean install, local build/test, replica-set-backed integration run, production cloud configuration review, penetration test, or deployment is claimed.


## Verification update — MongoDB-backed workflow tests (2026-11-21)

### CI infrastructure and test evidence

- PR #17 provisions a MongoDB service in GitHub Actions and runs workflow service tests against an actual MongoDB database rather than only validating request schemas.
- The integration suite covers: ALL-mode multi-approver progression; contract transition from DRAFT to IN_REVIEW to APPROVED; rejection returning the contract to DRAFT; MEMBER submission restrictions for contracts owned by another user; cross-tenant workflow-instance lookup rejection; and concurrent duplicate decisions by the same approver.
- PR #17 verification run [44931551989](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44931551989) completed successfully, including dependency audit, typecheck, build, and API tests with the MongoDB service.
- PR #17 merged to main as `e1cd8e42d1c3d7e7d03b6b8a420a9f2e4be0e7fd`.

### Remaining workflow consistency risk

- The integration tests verify normal approval/rejection paths and concurrent duplicate decisions. They do not simulate a database/network failure between the terminal WorkflowInstance write and the separate Contract update.
- F-06 remains open: workflow and contract state transitions are still separate writes, and the Contract update result is not checked. A transaction or durable recoverable reconciliation design is still required to close this risk. MongoDB was provisioned as a standalone service for this test suite; transaction semantics have not been tested.
- The CI job currently runs with a MongoDB service but the workflow service integration suite does not test document upload, storage scanning, worker lease takeover, or report idempotency.
- No production-like cloud configuration, penetration test, production deployment, or full end-to-end operational test is claimed.


## Verification update — transactional workflow state (2026-11-21)

### F-06 remediation

- PR #19 merged as `fc453f21673f3c620bcbb3597423a1b99952fb6b`.
- Workflow submission now creates the active WorkflowInstance and transitions its Contract from DRAFT to IN_REVIEW inside one MongoDB transaction.
- Approval and rejection decisions now update the WorkflowInstance and the corresponding Contract inside one transaction. The service checks the contract update's `matchedCount`; if the contract is no longer IN_REVIEW, it raises a conflict and aborts the transaction instead of leaving a terminal workflow with a stale contract.
- A replica-set-backed regression test changes the contract state after submission, attempts final approval, and verifies the transaction rolls back the workflow decision while preserving the independently changed contract state.
- CI run [44932068127](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44932068127) completed successfully, including typecheck, build, and API integration tests against a MongoDB 7 replica set.
- MongoDB must now run as a replica set or sharded cluster for workflow submission/decision transactions. A standalone local `mongod` is insufficient. README and `docs/operations/MONGODB.md` document the local single-node replica-set setup.

### Residual limitations

- The transaction change covers workflow instance and contract status consistency. It does not make external notification or audit writes part of the same transaction; routes still perform those actions after the workflow service returns. A failure in post-commit audit/notification delivery can therefore leave a committed decision without the corresponding side effect. Durable outbox delivery remains a future hardening task.
- Upload completion and document worker lease/idempotency risks F-02 and F-09 remain open. No S3/ClamAV integration or worker lease-takeover integration test is claimed.
- The root npm lockfile remains absent and CI still uses `npm install`; deterministic dependency resolution remains outstanding.
- This remains a source review with CI evidence, not a production-readiness certification, penetration test, production cloud review, or deployment.


## Verification update — upload completion idempotency (2026-11-21)

### F-02 remediation

- PR #21 merged as `2f8bd7cb9683be621697d3248e542e5855331146`.
- Upload intents now use an atomic processing claim with a ten-minute lease. Concurrent completion requests receive `UPLOAD_COMPLETION_IN_PROGRESS` rather than repeating storage inspection and malware scanning.
- A successful completion commits the ContractFile version, optimistic contract latest-version update, one DocumentProcessingJob, and UploadIntent completion in a single MongoDB transaction.
- A unique `(tenantId, fileId)` index prevents more than one analysis job for a stored document version.
- A client retry after a committed completion returns the existing file and job. Retryable scanner/queue errors release the claim; malware and invalid-signature quarantine outcomes are recorded as terminal.
- The MongoDB integration tests use isolated databases for workflow and upload suites. They cover clean completion, replay idempotency, concurrent completion (one scan), queue-write rollback/retry, and scanner failure/retry.
- PR #21 verification run [44932878666](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44932878666) completed successfully, including dependency audit, typecheck, build and replica-set-backed API tests.

### Scope and remaining limitations

- The integration tests mock S3 and ClamAV network calls. They verify MongoDB transaction and upload orchestration behavior, not real bucket policy, signed URL enforcement, malware daemon behavior, object quarantine permissions, or S3 failure recovery.
- The ten-minute upload processing lease is a crash-recovery boundary. Operational monitoring for repeatedly reclaimed intents and reconciliation of objects uploaded but never completed remain useful future hardening.
- F-09 document-worker lease expiry/idempotent report side effects remains open; the new unique job-per-file index prevents duplicate queue rows for the same file but does not itself fence all worker side effects.
- The root npm lockfile remains absent; CI continues to use `npm install`.
- No live production storage/scanner test, cloud review, penetration test, or deployment is claimed.


## Verification update — document worker lease and report idempotency (2026-11-21)

### F-09 remediation

- PR #23 merged as `8852cb6201153d1f28d27a7b30a7c16999f80aff`.
- The document worker now renews its five-minute processing lease periodically while analysis is running, reducing the chance that a healthy long-running analysis is reclaimed by another worker.
- Worker-triggered stored-document analysis carries the originating job ID into its intelligence report. A unique partial index on report `jobId` and duplicate-key recovery ensure that retrying after a report commit returns the existing report rather than creating a second report for that job.
- Replica-set-backed integration tests cover sequential retries and concurrent report creation for one job ID.
- CI run [44933210999](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44933210999) completed successfully, including dependency audit, typecheck, build and the API test suite.

### Remaining worker limitations

- The lease heartbeat is best-effort. A stalled process or event loop can still miss renewals and lose its lease; the final job status write remains fenced by `lockedBy`.
- The report idempotency key prevents duplicate persisted reports, but two workers can still perform duplicate extraction or external AI-provider calls if a lease expires while the first worker is processing. Provider billing/side effects are not made exactly-once.
- The integration suite validates report deduplication and other service behavior on MongoDB, but does not yet run a multi-process stress test with deliberately delayed analysis crossing the lease boundary.
- F-09 is therefore **mitigated for persisted report duplication**, not fully closed for duplicate processing cost or every possible external side effect.
- No real ClamAV/S3 infrastructure test, production worker load test, penetration test, or deployment is claimed.


## Verification update — avoid repeated provider calls after report commit (2026-11-21)

- PR #25 merged as `bde4d129d00dfeca649fcb22ef49a595896bf64f`.
- The worker's job-keyed report lookup now occurs before invoking the deterministic or AI analysis engine. A retry after a report has committed therefore reuses that report without re-running analysis or calling the external AI provider again.
- A MongoDB integration test uses a mocked AI provider and confirms two sequential calls for the same job ID create one report and invoke the provider once.
- PR #25 verification run [44933542603](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44933542603) completed successfully, including dependency audit, typecheck, build and API integration tests.
- F-09 remains partially mitigated, not fully closed: if two workers both begin analysis before either has committed a report, external provider calls can still overlap. The lease heartbeat reduces this window; report persistence remains idempotent.


## Verification update — tenant-scoped contract and document access tests (2026-11-21)

- PR #27 merged as `3f3699597055759e3da4455e55575c3034d0b146`.
- Added MongoDB-backed tests proving tenant scoping for contract detail and document-version reads.
- Verified a cross-tenant file identifier cannot generate a signed download URL.
- Verified document-job status access enforces tenant scope and MEMBER owner/creator authorization.
- Verified MEMBER job lists are limited to contracts they own or created, while OWNER job lists include the tenant queue.
- PR #27 verification run [44933918772](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44933918772) completed successfully, including dependency audit, typecheck, build and MongoDB integration tests.
- Storage URL creation was mocked in these tests. Actual S3 credentials, bucket policy, signed URL constraints and cross-tenant object-storage access have not been tested against a live bucket.


## Verification update — refresh-token family replay protection (2026-11-21)

### F-08 remediation

- PR #30 merged as `e3d844736fa637d1ca175297e2918246d2809d06`.
- Refresh sessions now carry a family identifier across each rotation chain.
- Token consumption and successor creation are performed in one MongoDB transaction.
- Reuse of a revoked token triggers revocation of every session in its family, including a successor already issued by a successful rotation.
- Concurrent refresh attempts are serialized by transactional writes; the losing replay revokes the winning successor.
- MongoDB integration tests cover sequential replay and concurrent refresh races.
- PR #30 verification run [44934234586](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44934234586) completed successfully, including dependency audit, typecheck, build and API integration tests.

### Residual authentication limitations

- Existing refresh sessions created before this change do not have a family ID until they are successfully rotated; a legacy revoked token without a family ID cannot revoke any successor created before family tracking existed.
- Access JWTs are still validated by signature and claims in middleware without a per-request user/tenant status lookup. Deactivation/revocation of an already-issued access token remains bounded by its short expiry.
- Refresh-family revocation does not revoke access JWTs already issued; the accepted access-token revocation window still needs an explicit policy decision or a session-version/revocation check if immediate invalidation is required.


## Verification update — reproducible npm install and full dependency audit (2026-11-21)

### F-01 remediation and F-03 improvement

- PR #32 merged as `59ec0a77c356ced1a77282cd86b5720bdf819c78`.
- Added the root npm workspace `package-lock.json`, generated by npm in the Node 22 GitHub Actions environment. The lockfile covers both API and web workspaces.
- CI now uses `npm ci` rather than `npm install`, so dependency installation is reproducible against the committed lockfile.
- The full dependency audit exposed critical vulnerabilities in the previous Vitest/tinypool dependency chain and moderate advisories in the Vue type-checking toolchain. Updated API Vitest to `^5.1.1` and web `vue-tsc` to `^3.3.14`, then regenerated the lockfile.
- CI now runs `npm audit --audit-level=high` across production and development dependencies. The check passed with the updated lockfile.
- PR #32 verification run [44935207230](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44935207230) completed successfully: clean `npm ci`, full dependency audit, typecheck, build, and MongoDB-backed API integration tests.

### Remaining supply-chain work

- CI still references GitHub Actions by major-version tags (`actions/checkout@v4`, `actions/setup-node@v4`). Pin verified immutable commit SHAs and automate action updates before treating F-03 as fully closed.
- The lockfile makes npm dependency resolution reproducible, but does not itself guarantee deterministic OS/browser binaries or cloud infrastructure.
- No production dependency install on the deployment host, SBOM publication, provenance attestation, or production rollout validation is claimed.


## Current readiness snapshot — 2026-11-21

| Finding | Current status |
|---|---|
| F-01 — npm dependency lockfile | **Resolved.** Root workspace lockfile committed; CI uses `npm ci`. |
| F-02 — upload completion concurrency | **Resolved for MongoDB state.** Atomic intent claim, ten-minute lease, transactional file/contract/job/intent writes, idempotent retries, and database integration tests. Real S3/ClamAV behavior remains untested. |
| F-03 — CI supply-chain controls | **Substantially improved.** Full dependency audit, immutable action SHA pins, MongoDB image digest pin, and weekly Dependabot for npm/actions. SBOM/provenance attestations remain future work. |
| F-04 — authorization matrix | **Partially covered.** Auth middleware, workflow role/tenant checks, contract/document download/job-list tenant scoping have integration/unit coverage. Audit routes, every module, and a full route-level negative matrix still need review. |
| F-06 — workflow/contract consistency | **Resolved for workflow submit/decision writes.** Both records update in one MongoDB transaction with rollback tests. Post-commit notifications/audit side effects are not yet outbox-backed. |
| F-07 — access-token revocation | **Open policy limitation.** Already-issued access JWTs remain valid until expiry after user/tenant deactivation unless a future revocation/session-version check is added. |
| F-08 — refresh-token replay | **Resolved for new rotation families.** Replay revokes family successors transactionally. Legacy pre-family sessions and access JWTs already issued remain bounded by token expiry. |
| F-09 — worker lease/idempotency | **Partially mitigated.** Lease heartbeat, job-keyed unique reports, and provider-call avoidance on sequential retries. Concurrent takeover can still duplicate extraction/provider calls before a report commits. |

### CI and operational evidence

- CI now provisions an ephemeral MongoDB replica set and runs the full API integration suite against isolated test databases.
- CI installs from the committed lockfile using `npm ci` and runs a full `npm audit --audit-level=high`.
- GitHub Actions references are pinned to immutable commit SHAs; Dependabot weekly update checks are enabled for npm and GitHub Actions.
- The MongoDB transaction requirement is documented in README and `docs/operations/MONGODB.md`.
- The dashboard screenshot workflow uses `npm ci` and pinned action references. Post-merge dashboard screenshot run [44935502507](https://github.com/matiur25580/ContractSphere-Enterprise-Contract-Lifecycle-Intelligence-Platform/actions/runs/44935502507) completed successfully on commit `b698ce4e90528c3f16edd625252ceb3c78fe77f5`.

### Not performed

No local checkout-based manual test run, live S3/ClamAV test, production cloud configuration review, penetration test, SBOM/provenance publication, disaster-recovery exercise, or production deployment has been performed. The repository has received substantial source and CI hardening, but this is not a production-readiness certification.
