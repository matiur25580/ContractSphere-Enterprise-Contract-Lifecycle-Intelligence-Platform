# ContractSphere — Engineering Audit Baseline

**Audited ref:** `main`  
**Audited commit:** `b13c1aa196e7cf33883ee44343a03f153c9a612e`  
**Audit date:** 2026-11-22  
**Status:** Remote source review and CI-status inspection. This is not a production-readiness certification.

## Scope and evidence

Reviewed the repository tree (144 entries), root and workspace package manifests, lockfile presence, CI workflow, API startup and Express composition, environment validation, authentication middleware, document-signature and malware-scanning code, the README, and the production-readiness checklist. The latest visible CI run for commit `e08a10a609b179b2be83b6499b03a958a1d05e9b` completed successfully on 2026-11-21; the dashboard screenshot workflow also completed successfully.

This was a remote source review. No local dependency installation, fresh test/build execution, live deployment exercise, cloud configuration review, or penetration test was performed as part of this audit. A green CI run is useful evidence for that tested commit, but it does not certify production readiness or the current later documentation-only commit.

## Positive controls observed

- The repository is an npm workspace monorepo with separate API and web applications and a committed root `package-lock.json`.
- CI uses `npm ci`, Node.js 22, immutable commit-SHA references for checkout/setup-node, read-only contents permission, dependency audit at high severity, TypeScript type checking, builds, and API tests against a MongoDB replica set.
- TypeScript strictness is enabled in the API configuration; API inputs use Zod validation.
- Express uses Helmet, disables `x-powered-by`, applies a bounded JSON body parser, and has a centralized error handler.
- Authentication middleware verifies access tokens and reloads active user and tenant state from MongoDB before attaching the authenticated tenant/user context to the request.
- Production environment validation requires a supplied JWT secret, MongoDB, complete S3-compatible storage configuration, ClamAV, and a non-local HTTPS web origin.
- Document handling includes PDF/DOCX signature checks and a fail-closed ClamAV scan path.
- The repository includes API unit/integration tests across authentication, tenant access, uploads, workflows, templates, obligations, intelligence, and audit behavior.
- A production-readiness checklist explicitly leaves infrastructure provisioning, secrets, storage, malware scanning, OCR dependencies, TLS, backups, and release verification to the operator.

## Findings and recommended work

### F-01 — Frontend automated test coverage is not visible in the workspace scripts

**Evidence:** `apps/web/package.json` exposes build and typecheck scripts but no test script. The current CI workflow runs API tests and builds/typechecks the web application, but does not run frontend component, route, store, or browser-level tests.

**Risk:** UI regressions, broken navigation, and client-side authorization/state defects may pass CI if the frontend still typechecks and builds.

**Recommended action:** Add a focused frontend test setup (component/store/router tests) and a small browser smoke suite for authentication, contract listing, and key lifecycle flows. Run these in CI after keeping the suite deterministic.

**Priority:** High.

### F-02 — Production deployment remains operator-dependent

**Evidence:** The README states that production deployment requires infrastructure configuration and hardening. The production-readiness checklist still contains operator tasks for MongoDB, private object storage, ClamAV, OCR dependencies, TLS/network topology, backups, and release verification.

**Risk:** A passing source CI run does not prove the configured production environment can safely process confidential contract documents.

**Recommended action:** Keep deployment manual as an explicit release gate. Complete the checklist against the actual hosting topology, verify private storage and malware scanning, test backup restoration, and exercise the deployed application using non-sensitive test data before launch.

**Priority:** Critical before production use.

### F-03 — The existing audit baseline had become stale

**Evidence:** The previous baseline described a missing lockfile and `npm install` CI workflow. The current default branch contains `package-lock.json` and CI uses `npm ci`; the workflow also pins its GitHub Actions by commit SHA.

**Risk:** Outdated audit notes can misdirect engineering effort and undermine confidence in the repository's engineering records.

**Action:** Refreshed this baseline against the current default branch and retained only current, evidenced gaps.

**Priority:** Resolved for the audit-document drift.

### F-04 — Runtime security and lifecycle behavior still need deeper verification

**Evidence:** Source review confirms useful authentication, tenant-state, upload-signature, and fail-closed malware-scan controls. This pass did not execute adversarial tests or inspect every route/service and every tenant-scoped query.

**Risk:** Source-level spot checks cannot rule out authorization gaps, race conditions, upload lifecycle inconsistencies, or operational failure modes elsewhere in the codebase.

**Recommended action:** Continue route-by-route authorization review and add/execute adversarial integration tests for cross-tenant access, concurrent upload completion, scanner outage, queue failure, refresh-token reuse, and shutdown/recovery behavior.

**Priority:** High.

## Current assessment

The repository has a substantial engineering foundation and a meaningful CI gate. The most visible quality gap from this pass is missing frontend automated test coverage; production readiness is still dependent on infrastructure and operator verification. No numeric score is assigned from this limited remote review. A defensible score requires fresh CI execution and broader source/runtime verification.

## Next verification gate

- [ ] Run `npm ci` on the audited commit.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test --workspace @contractsphere/api`.
- [ ] Add frontend automated tests and include them in CI.
- [ ] Complete the production-readiness checklist against the actual deployment environment.
- [ ] Perform an authorization and upload-lifecycle security test pass.
