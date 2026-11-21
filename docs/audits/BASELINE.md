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
