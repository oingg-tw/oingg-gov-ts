-- 失敗的匯入沒抓到資料，沒有「資料涵蓋到的最新業務日期」，data_date 改存 null（格式原則：缺值存 null）。
-- 之前補成執行當天，只看 max(data_date) 的新鮮度查詢會把一直失敗的來源當成新的。既有的失敗紀錄一起改：
-- 每條失敗路徑寫的都是 0 列，data_date 全是補的（2026-11-10 PRD 14 筆、DEV 1 筆）。
-- 讀者只有 gov 自己的查詢；data-rust 不讀 gov 的 ingestion_runs。
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE "export"."ingestion_runs" ALTER COLUMN "data_date" DROP NOT NULL;
UPDATE "export"."ingestion_runs" SET "data_date" = NULL WHERE "status" = 'failed';

COMMIT;
