# ContractSphere

**Enterprise Contract Lifecycle Intelligence Platform**

ContractSphere is a multi-tenant contract lifecycle management (CLM) platform for creating, reviewing, approving, executing, monitoring, and analyzing business agreements.

> Status: foundation and authentication milestone in progress. Core capabilities are being delivered incrementally.

## Product vision

Give legal, procurement, finance, and business teams one secure system of record for agreements, approvals, obligations, renewals, and contract intelligence.

## Planned capabilities

- Secure organization workspaces with tenant isolation and role-based access control.
- Contract repository, metadata, document versions, and controlled document access.
- Reusable templates and clause library.
- Configurable multi-stage approval workflows, delegation, and SLA escalation.
- Obligation tracking, renewal calendars, and counterparty management.
- AI-assisted summaries, clause extraction, risk signals, and comparisons with source-grounded evidence and human review.
- Append-oriented audit events, operational analytics, notifications, and exports.

## Architecture

The initial implementation is a **TypeScript modular monolith** in an npm-workspaces monorepo.

```text
apps/
  api/       Express + TypeScript REST API
  web/       Vue 3 + TypeScript application
packages/
  shared/    Shared contracts and types (planned)
infra/       Local development and deployment assets
```

### Technology

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Composition API, TypeScript, Vite, Pinia, Vue Router |
| Backend | Node.js, Express, TypeScript, Zod |
| Data | MongoDB, Mongoose |
| Quality | Vitest, Supertest (planned), TypeScript |
| Operations | Docker Compose, GitHub Actions (planned) |

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB 7+ (local or Atlas)

### Install and run

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

The API health endpoint is `http://localhost:4000/api/v1/health`. The web app runs at `http://localhost:5173`. Authentication and tenant onboarding require MongoDB to be reachable.

## Authentication API

All routes are prefixed with `/api/v1`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an organization and its first OWNER account |
| POST | `/auth/login` | Sign in using organization slug, email, and password |
| POST | `/auth/refresh` | Rotate the HttpOnly refresh-token cookie |
| POST | `/auth/logout` | Revoke the current refresh session |
| GET | `/auth/me` | Return the authenticated user and organization |

Registration requires `organizationName`, `organizationSlug`, `name`, `email`, and a password of at least 12 characters containing lowercase, uppercase, and numeric characters. Login requires `organizationSlug`, `email`, and `password`.

The API returns a short-lived JWT access token in the response body. The opaque refresh token is stored only as a SHA-256 hash in MongoDB and delivered through an HttpOnly cookie. Refresh rotates the token; logout revokes the current session. Refresh and logout requests must include the configured frontend `Origin`.

Roles currently defined are `OWNER`, `ADMIN`, and `MEMBER`. The reusable `requireRoles(...)` middleware is available for protected administrative routes. Tenant IDs are carried in verified access-token claims; future tenant-owned resource modules must scope every database query by that tenant ID.

## Contract repository API

All routes require `Authorization: Bearer <accessToken>` and are prefixed with `/api/v1`.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/contracts` | Create a contract record |
| GET | `/contracts` | Search/filter contracts with pagination |
| GET | `/contracts/:contractId` | Retrieve metadata and version history |
| PATCH | `/contracts/:contractId` | Update contract metadata/status |
| POST | `/contracts/:contractId/uploads` | Request a short-lived private object-storage upload URL |
| POST | `/contracts/uploads/:uploadId/complete` | Verify the stored object and register a new version |
| GET | `/contracts/:contractId/versions/:fileId/download` | Generate a short-lived download URL |

Contract search supports `q`, `status`, `type`, `counterparty`, `page`, `limit`, `sort`, and `order`. Search is always constrained by the authenticated tenant. Contract numbers are unique within an organization.

### Document storage setup

Document bytes are stored in a **private S3-compatible bucket**; MongoDB stores metadata, version records, and upload intents. Configure all four required storage settings in `apps/api/.env`: `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`. Optionally set `S3_ENDPOINT` for MinIO or another S3-compatible provider. The bucket must remain private and should have lifecycle, encryption, and access logging policies configured.

The API issues five-minute, server-generated PUT URLs for PDF and DOCX files up to 25 MiB. After upload, the client calls the completion endpoint; the API checks object size and declared content type before creating a version record. Download URLs expire after 60 seconds. Configure bucket CORS to allow the web origin to PUT with the signed `Content-Type` header. For production, add malware scanning, file-signature inspection, retention policies, and a managed secrets provider before accepting sensitive agreements.

## Engineering principles

1. Enforce tenant scope on the server for every tenant-owned resource.
2. Deny access by default and authorize each resource operation, not only each route.
3. Validate untrusted input at API boundaries.
4. Keep document bytes in private object storage; persist metadata and access policies in MongoDB.
5. Treat AI output as assistance, not legal advice or an autonomous approval/signature.
6. Record security-sensitive actions and workflow transitions for auditability.
7. Test critical authorization, workflow, and concurrency paths.

## Delivery roadmap

- [x] Initial monorepo and API/web application scaffold
- [x] Authentication, tenant onboarding, and organization context
- [x] Initial users, roles, and role-based route guard
- [x] Contract repository API, metadata, tenant-scoped search, and document versioning
- [x] Private S3-compatible upload/download URL workflow
- [ ] Templates, clauses, and approval workflow engine
- [ ] Obligations, renewals, vendors, and notifications
- [ ] AI-assisted contract intelligence with evidence references
- [ ] Audit, analytics, exports, integrations, and production hardening

## Development commands

```bash
npm run dev
npm run build
npm run typecheck
npm run test --workspace @contractsphere/api
```

## Environment and security

See `apps/api/.env.example`. Set a unique random `JWT_ACCESS_SECRET` (at least 32 characters) before production deployment. Never commit real credentials, private keys, production connection strings, or uploaded contract documents.

The current refresh-session store uses MongoDB TTL cleanup and an in-process rate limiter. For horizontally scaled production deployment, configure a shared rate-limit store and operational session revocation/monitoring.

## Security disclosure

Do not open public issues containing credentials, personal data, confidential contracts, or exploitable vulnerability details. Report security concerns privately to the repository maintainer.

## License

License to be selected before public distribution. Until then, all rights are reserved.
