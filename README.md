# ContractSphere

**Enterprise Contract Lifecycle Intelligence Platform**

ContractSphere is a multi-tenant contract lifecycle management (CLM) platform for creating, reviewing, approving, executing, monitoring, and analyzing business agreements.

> Status: foundation in progress. This repository currently contains the initial architecture and application scaffold; production capabilities will be delivered incrementally.

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

The initial implementation is a **TypeScript modular monolith** in an npm-workspaces monorepo. This keeps local development and deployment practical while preserving clear module boundaries for future extraction if scale requires it.

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
| Data | MongoDB, Mongoose (introduced with domain modules) |
| Quality | Vitest, Supertest, ESLint, Prettier (to be expanded) |
| Operations | Docker Compose, GitHub Actions (planned) |

## Getting started

### Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+
- MongoDB 7+ (local or Atlas) for database-backed modules

### Install

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run dev
```

The API health endpoint is `http://localhost:4000/api/v1/health`. The web app runs at `http://localhost:5173`.

The initial health endpoint does not require MongoDB. Database connectivity will be enabled as domain modules are introduced.

## Environment

See `apps/api/.env.example`. Never commit real credentials, private keys, production connection strings, or uploaded contract documents.

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
- [ ] Authentication, tenant onboarding, and organization context
- [ ] Users, roles, permissions, and resource-level authorization
- [ ] Contract repository, document upload, metadata, and versioning
- [ ] Templates, clauses, and approval workflow engine
- [ ] Obligations, renewals, vendors, and notifications
- [ ] AI-assisted contract intelligence with evidence references
- [ ] Audit, analytics, exports, integrations, and production hardening

## Development commands

```bash
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Security disclosure

Do not open public issues containing credentials, personal data, confidential contracts, or exploitable vulnerability details. Report security concerns privately to the repository maintainer.

## License

License to be selected before public distribution. Until then, all rights are reserved.
