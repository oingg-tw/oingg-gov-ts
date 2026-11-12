# oingg-gov-ts

Ingests data from Taiwan government sources (the Central Bank's Statistical
Database API, the Ministry of Finance, and others as they come up) into
Postgres, in the same style as its sibling
[oingg-mops-ts](https://github.com/oingg-tw/oingg-mops-ts). Scope isn't
limited to any one agency — any Taiwan government data source is fair game.

19 ingest domains are live, all of them scheduled, drawing on 8 sources
(CBC, DGBAS, NDC, the Ministry of Finance, the Ministry of Labor, SITCA,
plus FRED and the ECB for US and euro-area series). Interactive docs at
`/api-docs`. New domains get added one at a time, from whichever agency has
the data; `docs/資料來源合規對照表.md` records each source's licence and the
attribution it obliges.

Two interest-rate series exist and they are not interchangeable:
`monthly_gov_bond_yield_10y` is for CAPM and historical equity risk premium
(long holding period, long bond), while `monthly_five_major_bank_rate` is the
short rate for Sharpe / Sortino / Jensen α, where the risk-free rate has to
match the measurement window. See the `MonthlyFiveMajorBankRate` comment in
`prisma/schema.prisma` for why a deposit rate rather than a T-bill or the
overnight call loan rate.

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
  routes.ts             # mounts every ingest domain under /api/ingest; that is the only mount point
  adapters/
    prisma/              # single shared PrismaClient instance
    swagger/              # swagger-jsdoc setup, reads @swagger comments from domains/**
    cbc/                  # fetchCbcItem(itemCode) — the one place that talks to the CBC API
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
   following the pattern in `adapters/cbc/index.ts` (JSON API) or
   `adapters/fred/client.ts` (fixed-path CSV).
3. Add a `src/domains/<domain>/` folder following the layout above.
4. Add a Prisma model in `prisma/schema.prisma` (field naming / `@map`
   conventions should match oingg-mops-ts's schema) and run
   `pnpm prisma migrate dev --name <description>`.
5. Wire the domain's router into `src/routes.ts` under `ingestRouter`, which
   applies `TASK_SECRET` + rate limiting once at the router level — no
   per-route setup needed. `ingestRouter` is the only mount point; there is
   no query surface (see below).

## Setup

```
pnpm install
cp .env.example .env   # fill in DATABASE_URL / DIRECT_URL / TASK_SECRET
pnpm dev                # tsx watch src/index.ts
pnpm test                # vitest run — src/tests/
```

`pnpm dev` starts the API on `PORT` (default 8084), the port registered for
oingg-gov-ts in the ecosystem's local port table,
[oingg-admin-vue `docs/本機埠號.md`](https://github.com/oingg-tw/oingg-admin-vue/blob/main/docs/%E6%9C%AC%E6%A9%9F%E5%9F%A0%E8%99%9F.md),
so it doesn't collide with the other services when running side by side. To take
a new port, check that table and register it with the admin site first. Swagger
docs are served at `/api-docs`.

All `/api/ingest/*` routes require a `TASK_SECRET` (via the `X-Task-Secret`
header only; a query param would land in Cloud Run's request log) and are
rate-limited to one trigger per dataset per 60s after a success (10s after a failure) — see `src/shared/middleware.ts` / `src/shared/rateLimiter.ts`.
Every route in this service is an ingest route, and every one of them is
triggered by Cloud Scheduler; there is no unprotected surface and no endpoint
that takes a request body. Downstream reads go through the `export` schema
views, not HTTP.

Two rounds of removal got it to that shape: the `/api/query/*` routes went on
2026-10-02 (nothing in the ecosystem called them), and the company industry
classification group — the GCIS adapter, `POST /api/ingest/company-profile`
and its weekly refresh, three tables and their export view — went on
2026-10-07 after analysis-ts switched Altman Z''s manufacturing check to
exchange sectors and stopped reading it. Rebuild history is in git before
`7490e4d`.

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

A failed first attempt shows up in two places: Cloud Run's 5xx request count, and
Cloud Scheduler's own `AttemptFinished` log, which is `ERROR` for every attempt that
did not get a 2xx. Every `/api/ingest/*` route is reachable only by Cloud Scheduler
with an OIDC token, so any 5xx means a scheduled job failed — but a request turned away
with a 4xx never 5xxs: a 401 when the `x-task-secret` header and `TASK_SECRET`
disagree, a 403 when `gov-scheduler-invoker` loses `run.invoker`, a 429 from the rate
limiter (one `us-policy-rate` retry on 2026-10-21).

Three policies, all notifying `ian.chu@oingg.com` — the account this project deploys
under, and the address already in `OUTBOUND_USER_AGENT`:

- `scripts/alert-policy-ingest-failures.json` — `gov-ts ingest 5xx (Cloud Scheduler job
  failure)`, the Cloud Run 5xx count. Applied 2026-09-25.
- `scripts/alert-policy-scheduler-attempt-failures.json` — any Cloud Scheduler attempt
  that ends in an error, 4xx included. A 5xx sends both emails. Applied 2026-11-09.
- `scripts/alert-policy-fund-daily-nav-absent.json` — `fund-daily-nav-daily` has had no
  HTTP 200 attempt in 25 hours, so a missed 22:02 run alerts around 23:02 the next day.
  nav.csv holds two trading days, so this is the one job where "it never ran" loses
  data for good. It is PromQL because a metric-absence condition tops out at 23.5 hours,
  shorter than a daily job's gap; and 25 hours because PromQL alerts on log-based
  metrics cannot look back further than 1d1h. Applied 2026-11-09.

The commands below recreate or update them (the `create` command takes any of the three
files):

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

Two gaps these do **not** cover:

- **A job that returns 200 while writing stale data.** The source can serve last
  month's file with a 200; nothing 5xxs. `export.ingestion_runs.data_date` is where
  that shows, but it needs a query, not a Cloud Monitoring metric.
- **A job other than fund-daily-nav that stopped being scheduled at all.** No requests
  means nothing to alert on. Those sources can be re-run any time, so `pnpm
  scheduler:check`, which compares intent against Cloud Scheduler, is the thing to run.

## Raw responses (bronze layer)

Every upstream response, failed ones included, is stored as-is before it is parsed
(`src/shared/bronze.ts`), in the format the five upstream services share (bronze v1,
2026-11-11), unless it matches the last one stored for that URL (see below).
`BRONZE_BUCKET` picks the bucket:

- `gs://oingg-gov-bronze` for production. Objects are never overwritten or deleted and
  stay in Standard storage.
- `gs://oingg-gov-bronze-dev` for local runs that write DEV
  (`scripts/bronze-dev-lifecycle.json` deletes objects after 30 days). Locally, set
  `BRONZE_BUCKET=oingg-gov-bronze-dev` and `GCS_ACCESS_TOKEN=$(gcloud auth
  print-access-token)`. Without a bucket, a local run stores nothing and warns.

A local process connected to the production database refuses any ingest that would
fetch upstream. Such a run would need the production bucket, which local runs must not
write, while the DEV bucket deletes objects after 30 days. Run those ingests on Cloud
Run. Replays still work locally because they only read stored objects.

The format:

- Path: `<host>/<endpoint path>/<Taipei date>/<HHmmssSSS>_<first 12 hex of sha256>.<ext>`.
  The query string stays out of the path, so the six CBC datasets share
  `cpx.cbc.gov.tw/API/DataAPI/Get/`. Percent-encoded path characters are decoded,
  except wildcards and control characters.
- Metadata: `source_url` (full URL), `method`, `http_status`, `fetched_at` (ISO 8601,
  `+08:00`), `sha256`, `revision` (empty locally), plus `last_modified` and `etag`
  when the upstream sends them.
- `export.ingestion_runs.raw_objects` lists the `gs://` URLs a run used. This is the
  only link from a dataset to its objects.

Since 2026-11-12, a response is not stored again when the last object stored for the
same URL has the same `sha256` and `http_status`. The run lists that object in
`raw_objects` instead, so every run still points at its raw response. The status is part
of the check because a replay returns the stored status.

How the last object is found:

- The path leaves out the query string, so the lookup reads `source_url` from the objects
  used by this run and by the dataset's last 10 runs, newest first.
- Only the latest object for that URL is compared, so A → B → A stores the third
  response.
- Objects in another bucket don't count.
- If the lookup fails, the response is stored.
- CBC responses carry the time they were prepared (`meta.prepared`), so their hash
  differs on every request. For CBC only, the content is compared with that field
  removed (`withoutPreparedTime` in `src/adapters/cbc/index.ts`). The stored bytes and
  the `sha256` stay raw. When an object is reused, that run's own `prepared` time is
  not kept, but it is the same as the fetch time recorded in `completed_at`.

Duplicates stored before 2026-11-12 are kept.

Registered exception to the data layering standard (approved 2026-11-12): the
business-cycle reference dates carry three supplemented values and one correction taken
from NDC press releases, not from an upstream response.

- They are hand-checked constants in
  `src/domains/businessCycleReferenceDate/supplements.ts`, so there is no bronze object
  for them.
- Each row lists the affected fields in `supplemented_fields` and the press release in
  `supplement_source`.
- A replay applies the constants of the code it runs, and git keeps their history.

A failed store does not stop the ingest. It logs an ERROR starting with
`[bronze-write-failed]`, which the `bronze_write_failures` log metric counts per
`dataset` (`scripts/log-metric-bronze-write-failures.yaml`).
`scripts/alert-policy-bronze-write-failures.json` emails the same channel as the 5xx
alert.

Only one object was written before bronze v1, by revision 00042 for run 404. On
2026-11-12 it was copied to its v1 name and the old copy was deleted. Its fetch time is
known only to the second, so the milliseconds are stored as `000`. Replay reads v1
objects only.

POSTing an ingest route with `{ "replayRunId": <run_id>, "force": true }` re-runs that
run from its stored objects instead of the network, and records a new
`ingestion_runs` row pointing at the same objects. `scripts/replayIngest.ts <dataset>
--from YYYY-MM-DD --to YYYY-MM-DD` lists the runs it would replay and only writes with
`--apply`. It replays every run for the two SITCA snapshots, and only the latest run
for the other sources, whose files each hold the full history or the whole current
state.

The runtime identity holds only `objectCreator` and `objectViewer` on the production
bucket, and writes use `x-goog-if-generation-match: 0`, so nothing in the service can
replace a stored response.

## Post-deploy compare

Before pushing main, run `npx tsx --env-file=<env file> scripts/postDeployCompare.ts
capture`. Once the first scheduled runs after the deploy have finished, run the same
command with `diff`. It is the same method as oingg-data-rust's
`tools/post-deploy-compare.mjs`, adapted to views that keep one row per period:

- Every export view is compared row by row, by the natural key in
  `src/shared/postDeployCompare.ts`. Rows are counted as changed (same key and
  period, different values), removed or added.
- Each column is hashed separately. The diff names the columns that changed, and a
  column the deploy adds or drops does not count as a change.
- `diff` exits with 1 when a view has more changed or removed rows than max(5, 1% of
  its rows), or when a column's null rate rose by 2 points or more. The flagged views,
  columns, periods and keys are the impact scope to report.

It only reads, inside a read-only transaction. Snapshots stay in the OS temp
directory (`oingg-post-deploy/gov-ts-<endpoint>.json`), one per database, so DEV and
PRD never mix.

## Production memory headroom

Measured on revision 00018 (2Gi, `--max-old-space-size=768`, 500-row chunking), 2026-09-25:
`labor-broker-tax-registration` (17,844 rows behind a 322MB stream) and
`monthly-unemployment-rate` (12,055 rows) triggered back to back onto one warm instance —
deliberately heavier than any scheduled window — **peaked at 14.0%, about 287MB of 2Gi**.
Both returned 200 with no warning logged.

For contrast, the previous revision ran on Cloud Run's 512Mi default with no `NODE_OPTIONS`
(V8 old-space ceiling near 256MB) and peaked at **75.8%, about 388MB**, on a *single* job
per cold instance. So the fix cut the peak by ~100MB while carrying a heavier load, and
headroom went from roughly a quarter to roughly six sevenths.

Why the old config survived at all: the load was thinner than the schedule read. At the
time only two jobs ran daily, and the rest were aligned to release dates spread across the
month.

Since 2026-10-30 the small CBC/DGBAS/NDC/FRED jobs run every day between 03:02 and
03:57, five minutes apart, so they share a warm instance in sequence rather than in
parallel. A month-aligned job that hit a late file or a failed fetch waited a whole month
for its next try; see the header of `scripts/scheduler.config.ts`. The exception since
2026-11-12 is the business-cycle reference dates: NDC adds a turning point once every few
years, so that job runs on the 1st of each month. Most daily runs insert
nothing (`skipDuplicates`). The heaviest of them, unemployment rate at ~12,000 rows, is
below the ~30,000 rows of the 2026-09-25 test above.

`concurrency` is still Cloud Run's default of 80. In practice it is always 1 — jobs are
minutes apart and each ingest route holds a per-dataset in-flight lock — but that is
circumstance, not a guarantee. Setting it to 1 explicitly would be the prerequisite for
tuning the pg pool size, which is currently not worth doing (see
`src/shared/createManyChunked.ts`).
