# ContractSphere production-readiness checklist

This checklist prepares the application for an operator-managed deployment. It does not deploy, provision infrastructure, or create production credentials.

## 1. Build and release gate

- [ ] Confirm the intended commit is on `main` and all required GitHub Actions checks are green.
- [ ] Run from the repository root:

  ```bash
  npm ci
  npm run typecheck
  npm run build
  npm run test --workspace @contractsphere/api
  ```

- [ ] Build and test the exact commit that will be deployed; do not deploy from an uncommitted working tree.
- [ ] Keep a rollback reference to the previously deployed commit and artifact.

## 2. API environment

Set the following in the API runtime's secret/configuration manager. Do not commit a populated `.env` file.

- [ ] `NODE_ENV=production`
- [ ] `PORT` to the platform-assigned listening port.
- [ ] `WEB_ORIGIN` to the exact HTTPS browser origin (no wildcard).
- [ ] `MONGODB_URI` to a production MongoDB connection using TLS and a least-privilege application user.
- [ ] `JWT_ACCESS_SECRET` to a unique random secret of at least 32 characters; never reuse the example value.
- [ ] `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` as a complete set.
- [ ] `CLAMAV_HOST` and, if needed, `CLAMAV_PORT` / `CLAMAV_TIMEOUT_MS`.
- [ ] If using an S3-compatible custom endpoint, set `S3_ENDPOINT` to HTTPS.
- [ ] If using an external AI provider, configure `AI_API_KEY`, `AI_BASE_URL` (HTTPS), and `AI_MODEL` only after legal/security approval of its data-processing terms.
- [ ] Confirm production startup fails on missing required configuration rather than silently using development defaults.

## 3. Infrastructure dependencies

### MongoDB

- [ ] Use a managed/replicated production cluster with TLS enabled and network access restricted to the API.
- [ ] Configure automated backups and test a restore before launch.
- [ ] Confirm the application database user has only the permissions needed by this service.
- [ ] Confirm MongoDB is reachable from every API instance.

### Private object storage

- [ ] Keep the bucket private; block public ACLs and public bucket access.
- [ ] Restrict credentials to the required bucket/object operations and rotate them through the secret manager.
- [ ] Configure bucket CORS for the exact `WEB_ORIGIN`, `PUT` uploads, and the signed `Content-Type` header.
- [ ] Confirm lifecycle/retention rules do not delete active contract versions or quarantine evidence.
- [ ] Verify signed upload and download URLs work from the deployed browser origin.

### Malware scanning and OCR

- [ ] Run a maintained ClamAV daemon reachable from the API on TCP 3310; wait for signature database initialization before accepting uploads.
- [ ] Confirm upload completion fails closed if ClamAV is unavailable.
- [ ] Install Poppler (`pdftoppm`) and Tesseract with English language data on every API instance that processes scanned PDFs.
- [ ] OCR currently handles up to the first 10 pages in English; page-level evidence provenance and multilingual OCR are not implemented.
- [ ] Verify the runtime allows private temporary-file creation and cleanup.

## 4. Network and browser security

- [ ] Terminate TLS at a trusted load balancer/reverse proxy.
- [ ] Route browser requests to the web app and API consistently; the web client calls the API at the `/api/v1` path.
- [ ] Keep the browser origin aligned exactly with `WEB_ORIGIN`.
- [ ] If web and API are on separate subdomains, confirm they remain same-site for the refresh cookie policy; do not put them on unrelated sites without implementing and testing an explicit cross-site cookie/CSRF design.
- [ ] Restrict inbound API access to the intended proxy/network and do not expose MongoDB, S3 administration, or ClamAV ports publicly.
- [ ] Review CSP, CORS, cookie, proxy, and security-header behavior against the final domain topology.

## 5. Worker and scaling considerations

- [ ] MongoDB is required for durable document jobs; the API starts a document worker after connecting.
- [ ] Each API instance starts one worker loop; MongoDB atomic claims and expiring leases coordinate multiple instances.
- [ ] A single worker processes one document at a time. Capacity planning should account for PDF parsing, OCR CPU/memory, and ClamAV scanning.
- [ ] Monitor queued/processing/failed job counts in the dashboard and investigate terminal failures.
- [ ] The job status API and dashboard show recent jobs; they are not a full metrics/alerting platform.
- [ ] Configure external monitoring/alerts for API availability, MongoDB, storage, ClamAV, job backlog, CPU, memory, and disk.

## 6. Smoke tests after your manual deployment

- [ ] `GET /api/v1/health` returns HTTP 200.
- [ ] `GET /api/v1/health/live` returns HTTP 200.
- [ ] `GET /api/v1/health/ready` returns HTTP 200 only after MongoDB is connected; HTTP 503 while disconnected.
- [ ] Register/login/refresh/logout work from the exact deployed browser origin.
- [ ] Tenant A cannot read or mutate Tenant B's contract, document, job, vendor, obligation, notification, or audit data.
- [ ] Upload a clean PDF and DOCX; verify ClamAV clean results, private storage, and successful processing.
- [ ] Test the EICAR antivirus test file in a controlled non-production environment and confirm quarantine/block behavior.
- [ ] Test a scanned PDF and confirm OCR output is usable; test a text PDF and DOCX to verify ordinary extraction still works.
- [ ] Verify unauthorized users cannot access another contract's processing job or report.
- [ ] Verify an intentionally unavailable ClamAV service blocks uploads.
- [ ] Verify the processing dashboard updates through queued, processing, and terminal states.

## 7. Operational and governance decisions still required

- [ ] Decide retention, deletion, legal hold, and backup policies for contract documents and audit events.
- [ ] Decide whether to enable external AI analysis and complete provider privacy/security review.
- [ ] Add shared rate-limit storage before relying on per-process rate limits across many API replicas.
- [ ] Add scheduled obligation/renewal reminders and outbound email/push delivery if required by operations.
- [ ] Add tamper-evident/database-enforced audit retention if immutable audit evidence is a regulatory requirement.
- [ ] Run end-to-end tenant-isolation, concurrency, performance, and disaster-recovery exercises.
- [ ] Define incident response, key rotation, vulnerability remediation, and on-call ownership.

## 8. Go/no-go

Do not treat a successful TypeScript build or CI run as a production security certification. Proceed only after the operator has checked infrastructure configuration, smoke tests, backup/restore, access isolation, monitoring, and organizational approvals.
