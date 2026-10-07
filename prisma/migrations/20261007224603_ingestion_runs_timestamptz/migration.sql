-- AlterTable
-- export.ingestion_runs 的兩個「時間點」欄位改成 TIMESTAMPTZ，對齊生態系其他後台的握手表。
--
-- analysis-ts 用同一套邏輯讀五個後台的 ingestion_runs，而 completed_at 的實際 DDL 是：
--   twse-ts   TIMESTAMPTZ
--   tpex-ts   TIMESTAMPTZ
--   mops-ts   TIMESTAMPTZ
--   gov-ts    TIMESTAMP(3)   ← 原本唯一的例外
-- （2026-10-08 逐一核對各 repo 的 migration 原文，不是看 analysis-ts 的宣告。）
--
-- 目前沒有 bug：Prisma 寫的是 UTC、所有 session 都是 GMT、Prisma 兩種型別都讀成 Date。但只要有
-- 讀者把 session TimeZone 設成 Asia/Taipei，或用原生 pg client 讀（pg 預設把 timestamp 當本地
-- 時間），這些時間點就會偏 8 小時。
--
-- ⚠️ USING 子句是手動加的，Prisma 產生的原文沒有。沒有 USING 時，PostgreSQL 的隱含轉型會用
-- 「當下 session 的 TimeZone」解讀既有值——現在剛好是 GMT 所以結果正確，但依賴 session 時區正是
-- 這次要拿掉的脆弱點。既有值都是 Prisma 以 UTC 寫入的，所以明確指定 AT TIME ZONE 'UTC'。
--
-- 這張表沒有任何 view 或 rule 依賴它（2026-10-08 查 pg_depend 確認），ALTER TYPE 不會被擋。
-- 正式環境 103 列，重寫是瞬間的事。
ALTER TABLE "export"."ingestion_runs"
  ALTER COLUMN "completed_at" SET DATA TYPE TIMESTAMPTZ(6) USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "source_last_modified" SET DATA TYPE TIMESTAMPTZ(6) USING "source_last_modified" AT TIME ZONE 'UTC';
