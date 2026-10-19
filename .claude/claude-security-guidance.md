<!-- socle AEF : début -->
# Security guidance

Security rules for this project (from the AEF socle checklist; IDs in brackets refer to it). Flag any change that breaks one.

## Data and secrets
- No secret in code, tests, fixtures, logs or `NEXT_PUBLIC_*` variables; secrets come from the environment only, read through the project's config module [DEV-05, SEC-09].
- No personal data (names, birth dates, addresses, social security numbers, health data, bank details, payslips) in logs, error messages, Sentry events, seeds or tests; use invented or pseudonymised data [IA-01, RGPD-07, SEC-13].
- Sensitive columns go through the project's encryption layer; never store them in clear [RGPD-03].
- No `console.*` in production code: use the project's logger [SEC-13].

## Access control
- Every Server Action, route handler and export checks the session AND the role server-side before any read or write; never trust a client-supplied role, user id or establishment id [IAM-02, IAM-08, SEC-06].
- In a multi-company or multi-tenant app, every query on business data is filtered by the company/tenant key; a missing filter is a critical finding [ARC-10, BDD-01].

## Input and output
- Every external input is validated with zod, with a maximum length on every string and a bounded body size [DEV-01, SEC-11].
- Uploaded files: size checked before parsing the body, file count capped, type checked by magic bytes, server-generated name, stored outside the public folder [SEC-11].
- Redirects after login or an action only follow an internal relative path (starts with `/`, not `//`) [SEC-19].
- CSV and spreadsheet exports neutralise cells starting with `=`, `+`, `-`, `@`, tab or carriage return [SEC-20].
- No `dangerouslySetInnerHTML` with data that is not static; HTML for PDFs is escaped [DEV-03].
- Raw SQL only as Prisma tagged templates; never `$queryRawUnsafe` / `$executeRawUnsafe` with input [DEV-02].

## Authentication
- Login, magic link, reset and invitation answer with one generic message whether the account exists or not, and never e-mail an address without an active account [SEC-14].
- Rate limiting uses a trusted client IP (last trusted proxy, `CF-Connecting-IP` when the origin only accepts Cloudflare), never the first `X-Forwarded-For` value; the limiter fails closed [API-02, API-04, SEC-22].
- Sessions: 15 minutes of inactivity, absolute cap; passwords at least 12 characters (14 for administrators), hashed with argon2id [IAM-10, IAM-12, DEV-04].

## Integrations
- Incoming webhooks: rejected when the verification secret is missing, HMAC compared with `timingSafeEqual`, signed timestamp within 5 minutes, idempotency key; a static token alone is not enough [API-01, SEC-15].
- In production the app refuses to start if a mandatory secret or security service is missing; empty defaults are for development only [SEC-21].
- No CORS header unless an explicit allow-list was decided [SEC-12].
- No call to an AI model or AI API from the application without a written decision (the AI perimeter test must stay green) [IA-11, IA-12].
- Any new third-party service receiving personal data is a subprocessor: record it in the processing register first.
<!-- socle AEF : fin -->
