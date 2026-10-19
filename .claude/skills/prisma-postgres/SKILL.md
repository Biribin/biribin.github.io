---
name: prisma-postgres
description: Prisma 7 and PostgreSQL rules for AEF projects — schema changes, migrations that never break production (expand-contract, concurrent indexes, batched backfills), queries and transactions, and Prisma traps (updateMany returns a count, migrate dev can reset a database, @updatedAt skipped on bulk writes, interactive transaction timeout). Use when editing schema.prisma, writing or reviewing a migration, writing a Prisma query or transaction, or debugging one.
---

> **Provenance** : fusion de `affaan-m/ECC@76aaa77` (`skills/database-migrations/SKILL.md` et `skills/prisma-patterns/SKILL.md`), licence MIT © 2026 Affaan Mustafa (voir `THIRD_PARTY_NOTICES.md` du socle).
> **Adapté pour le socle AEF le 19/10/2026** : réduit à notre pile (Prisma 7, PostgreSQL 16, Next.js), outils que nous n'utilisons pas retirés (Drizzle, Kysely, Django, Go), règles du socle ajoutées (production, données personnelles, cloisonnement par établissement, suppressions).

# Prisma 7 and PostgreSQL

Read the project's `package.json` and `prisma.config.ts` first: Prisma 7 uses `prisma.config.ts` for the datasource and a driver adapter (`@prisma/adapter-pg`). When an API is in doubt, check the official Prisma docs for the installed version (skill `source-driven-development`).

## AEF rules that come first

- **Production is never touched by the assistant.** No `migrate deploy`, `db push`, `db execute` or raw SQL against production from a session (IA-04). Migrations reach production through the deployment pipeline, after review.
- **Count, don't display.** To understand production data, ask for the shape (schema, `EXPLAIN`, row counts), never rows. No real personal data in seeds, fixtures or tests (IA-01).
- **Every query on client data is filtered by establishment** (`tenantId` or the project's equivalent), and the project's isolation test covers new models (ARC-10, BDD-01).
- **Sensitive columns stay encrypted** through the project's encryption layer; a new personal-data column is declared in the processing register (RGPD-02).
- **Deletions follow the product rules**: undoable deletion with « Annuler » for ordinary data, confirmation for sensitive data (PRD rules, `05-regles-produit.md`).

## Migrations

Core rules:

1. **Every schema change is a migration file**, committed with the code that needs it. Never alter a shared database by hand.
2. **Forward-only.** Prisma has no down migrations: a rollback is a new migration. A migration already applied anywhere is **never edited** (Prisma checksums it: `P3006` on every environment where it ran).
3. **`migrate dev` only on your own local database.** It can detect drift and offer to **reset the database**. Shared dev, test, staging and production use `migrate deploy`.
4. **Schema and data changes are separate migrations.** Never mix DDL and a backfill in one file.
5. **The previous version of the app must keep working with the new schema** while it deploys (CONT-08): add first, remove later.

### Expand-contract (rename, make required, change type)

```
1. EXPAND    add the new column, nullable or with a default; deploy code that writes both
2. BACKFILL  separate data migration, in batches
3. SWITCH    deploy code that reads the new column only
4. CONTRACT  later release: drop the old column, or add NOT NULL
```

Never rename a column or add `NOT NULL` without a default to an existing table in one step: it locks the table or breaks the running version.

### Safe column additions

```sql
-- fine: nullable, no rewrite
ALTER TABLE "Session" ADD COLUMN "commentaire" TEXT;
-- fine on PostgreSQL 11+: constant default, no rewrite
ALTER TABLE "Session" ADD COLUMN "archive" BOOLEAN NOT NULL DEFAULT false;
-- dangerous on a populated table: NOT NULL without default
ALTER TABLE "Session" ADD COLUMN "statut" TEXT NOT NULL;
```

### Indexes on populated tables

Prisma cannot generate `CONCURRENTLY`. Create an empty migration and write it by hand:

```bash
npx prisma migrate dev --create-only --name index_session_date
```

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_date_idx" ON "Session" ("date");
```

`CONCURRENTLY` cannot run inside a transaction: keep it alone in its migration file.

### Batched backfill

Never `UPDATE` a whole large table in one statement. Batch it in a data migration or a one-off script reviewed like code:

```sql
UPDATE "Apprenant" SET "emailNormalise" = lower("email")
WHERE id IN (SELECT id FROM "Apprenant" WHERE "emailNormalise" IS NULL LIMIT 5000);
-- repeat until 0 rows
```

### Checklist before a migration is merged

- [ ] Forward-only, previous app version still works with it
- [ ] No `NOT NULL` without default, no rename in one step, no table lock on a populated table
- [ ] Indexes on populated tables created `CONCURRENTLY`, alone in their file
- [ ] Backfill separate and batched
- [ ] Applied on a test database with realistic volume (invented data)
- [ ] Every foreign key and every column used in `WHERE` or `ORDER BY` indexed
- [ ] New client data model covered by the establishment isolation test

## Queries

- **`select` over `include`** on hot paths and wide tables; never return a raw Prisma entity from an API or a Server Action: map to a DTO so internal fields (hashes, encrypted columns, `deletedAt`) never leak.
- **No N+1**: no query inside a loop over rows; load the relation in the parent query.
- **Cursor pagination** for long lists (`take: limit + 1`, `cursor`, secondary `orderBy` on `id`); offset only for small admin tables.
- **Raw SQL only as tagged templates** (`$queryRaw\`...\``, `Prisma.sql`, `Prisma.join`). Never `$queryRawUnsafe` or `$executeRawUnsafe` with input (DEV-02).

## Transactions

| Situation | Form |
|---|---|
| Independent writes | array form `prisma.$transaction([...])` |
| A step depends on an earlier result | interactive form, using **only** `tx` inside |
| An e-mail, HTTP call or file write is involved | **outside** the transaction |

The interactive form times out after **5 seconds** by default ("Transaction already closed"). Keep external calls out rather than raising the timeout.

## Traps

| Trap | What happens | Do instead |
|---|---|---|
| `updateMany` / `deleteMany` | returns `{ count }`, never the rows | select the ids first, then update, then read back by ids |
| `deleteMany()` without `where` | empties the table | always pass a `where`; tests cover it |
| `@updatedAt` on `updateMany` | not set on bulk writes | set `updatedAt: new Date()` explicitly |
| Soft delete + `findUniqueOrThrow` | returns soft-deleted rows | `findFirstOrThrow({ where: { id, deletedAt: null } })` |
| Prisma error codes | raw messages leak internals | catch at the service boundary: `P2002` unique, `P2025` not found, `P2003` foreign key; return the project's generic error (DEV-06) |
| Several `PrismaClient` instances | one pool each, connections exhausted | one shared client (`src/lib/prisma.ts`), `globalThis` cache in development |
