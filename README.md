# oingg-gov-ts

Ingests data from Taiwan government sources (the Central Bank's Statistical
Database API, the Ministry of Finance, and others as they come up) into
Postgres, in the same style as its sibling
[oingg-mops-ts](https://github.com/oingg-tw/oingg-mops-ts). Scope isn't
limited to any one agency — any Taiwan government data source is fair game.

**Status: early.** The server boots, connects to the DB, and serves
`/api-docs`. A few domains are implemented (10y government bond yield from
CBC, tax industry classification from the Ministry of Finance) — more are
added one at a time, from whichever agency has the data.

## The CBC API

CBC's Statistical Database API is the first and so far primary data source.
Other agencies get their own adapter under `src/adapters/` (see
`adapters/cbc/index.ts` for the pattern) since their API shape differs.

```
GET https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName={ItemCode}
```

Returns JSON with three parts: `header` (basic info), `dataset` (the actual
series), `structure` (dimensional info for the dataset). The exact shape of
each isn't documented and seems to vary by item — always fetch a real item
and look at the real response before writing a parser for it, rather than
guessing the shape.

See [CBC-ITEM-CODES.md](./CBC-ITEM-CODES.md) for the full catalog of item
codes (exchange rates, money supply, interest rates, foreign exchange,
balance of payments, etc.), transcribed from CBC's own API documentation.
It also flags two apparent typos in that source document — check there
before trusting a Month-period code.

## Architecture

Same domain-driven layout as oingg-mops-ts:

```
src/
  index.ts              # app bootstrap (middleware, routes, error handler, server start)
  routes.ts             # mounts ingest domains under /api/ingest, query domains under /api/query
  adapters/
    prisma/              # single shared PrismaClient instance
    swagger/              # swagger-jsdoc setup, reads @swagger comments from domains/**
    cbc/                  # fetchCbcItem(itemCode) — the one place that talks to the CBC API
    gcis/                 # fetchCompanyBusinessItems(no) — the one place that talks to the GCIS API
    <agency>/              # one folder per external data source, added as needed
  shared/
    config.ts            # env-derived config
    errorHandler.ts       # last-resort express error handler
    serverInfo.ts         # startup timing, exposed on GET /
  domains/
    system/root.ts        # health check (GET /)
    <domain>/              # one folder per data category, added as needed:
      route.ts              #   Express router + @swagger docs
      controller.ts          #   HTTP layer: parse request, call service, shape response
      service.ts              #   orchestrates: check DB → fetch from source → parse → persist
                               #   (query-type domains skip the DB/persist step, see companyBusinessItems)
      parser.ts                #   raw source data -> typed rows (ingest-type domains only)
      ingest.ts (optional)      #   DB upsert logic, if it's more than a one-liner in service.ts
      types.ts                  #   domain-specific types
prisma/
  schema.prisma          # models for ingested/reference data — see the comment block in each model
```

## Adding a new domain

Any Taiwan government data source is in scope, not just CBC — pick whatever
agency has the data you need.

1. Pick a data source. For CBC, pick an item from
   [CBC-ITEM-CODES.md](./CBC-ITEM-CODES.md). For another agency, find its API
   (or other structured export) and fetch a real response before writing
   anything — don't guess the schema from docs or the item name alone.
2. If the source isn't CBC, add an adapter for it under `src/adapters/`
   following the pattern in `adapters/cbc/index.ts` or `adapters/gcis/index.ts`.
3. Add a `src/domains/<domain>/` folder following the layout above.
4. Add a Prisma model in `prisma/schema.prisma` (field naming / `@map`
   conventions should match oingg-mops-ts's schema) and run
   `pnpm prisma migrate dev --name <description>`.
5. Wire the domain's router into `src/routes.ts`. Ingest-type domains
   mounted under `ingestRouter` automatically get `TASK_SECRET` +
   rate-limit protection (applied once at the router level) — no per-route
   setup needed. Query-type domains under `queryRouter` are unprotected by
   default; add protection explicitly if a specific query route turns out
   to need it.

## Setup

```
pnpm install
cp .env.example .env   # fill in DATABASE_URL / DIRECT_URL / TASK_SECRET
pnpm dev                # tsx watch src/index.ts
pnpm test                # vitest run — src/tests/
```

`pnpm dev` starts the API on `PORT` (default 8084) — part of the ecosystem's
shared port allocation maintained in oingg-conductor-ts's
[`docs/conventions.md`](../oingg-conductor-ts/docs/conventions.md), so it
doesn't collide with the other services when running side by side. Swagger
docs are served at `/api-docs`.

All `/api/ingest/*` routes require a `TASK_SECRET` (via the `X-Task-Secret`
header or `task_secret` query param) and are rate-limited to one trigger per
dataset per 60s — see `src/shared/middleware.ts` / `src/shared/rateLimiter.ts`.
Query routes under `/api/query/*` are unprotected (read-only, not
externally-triggered fetches).

## Cloud Scheduler

Ingest endpoints are triggered by Cloud Scheduler jobs, managed as code the
same way oingg-twse-ts / oingg-sitca-ts do it: `scripts/scheduler.config.ts`
is the single source of truth (job name / path / cron), and
`scripts/reconcileScheduler.ts` diffs it against what's actually on Cloud
Scheduler and applies the difference.

```
pnpm scheduler:check    # dry run — report drift, warn about same-minute collisions
pnpm scheduler:apply    # create missing jobs / update mismatched ones
```

Both need `gcloud auth login` and the active gcloud project set to gov-ts's
project. Jobs found on Cloud Scheduler but not in the config are only warned
about, never deleted. Rationale for the chosen time window and per-job
frequency lives in the config file's header comment.

## Alerting

`export.ingestion_runs` cannot tell you a job failed. It is written when an ingest
completes, and Cloud Scheduler retries failures (`maxRetryAttempts=3`) — so a first
attempt that OOMs, followed by a retry that succeeds in a fresh container, leaves only
a `success` row. oingg-sitca-ts OOMed daily for five days in September 2026 with a
table that looked clean throughout.

The one place a failed first attempt shows up is Cloud Run's 5xx request count. Since
every `/api/ingest/*` route is reachable only by Cloud Scheduler with an OIDC token,
any 5xx means a scheduled job failed.

`scripts/alert-policy-ingest-failures.json` holds that policy. To apply it:

```
# 1. Create an email notification channel (once per project)
gcloud beta monitoring channels create --project=oingg-gov \
  --display-name="gov-ts alerts" --type=email \
  --channel-labels=email_address=<your-email>

# 2. Note the returned channel name, then create the policy
gcloud alpha monitoring policies create --project=oingg-gov \
  --policy-from-file=scripts/alert-policy-ingest-failures.json \
  --notification-channels=<channel-name-from-step-1>

# Updating it later (get the policy id from `policies list`)
gcloud alpha monitoring policies update <policy-id> --project=oingg-gov \
  --policy-from-file=scripts/alert-policy-ingest-failures.json
```

Without `--notification-channels` the policy still fires but only into the Cloud
Monitoring console, which nobody looks at — that is the same blind spot in a new place.

Two gaps this does **not** cover:

- **A job that returns 200 while writing stale data.** The source can serve last
  month's file with a 200; nothing 5xxs. `export.ingestion_runs.data_date` is where
  that shows, but it needs a query, not a Cloud Monitoring metric.
- **A job that stopped being scheduled at all.** No requests means no 5xx. `pnpm
  scheduler:check` compares intent against Cloud Scheduler and is the thing to run.
