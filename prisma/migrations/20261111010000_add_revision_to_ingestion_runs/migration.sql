-- 每筆匯入紀錄記是哪個 Cloud Run revision 寫的（K_REVISION），程式改壞時用來圈出壞版本跑過的匯入（2026-11-11 PRD 上線策略）。
-- 可為 null：之前的紀錄沒有這個資訊，本機跑也沒有 K_REVISION。只加欄位，上一版程式照常能寫，退版不受影響。
-- 讀者只有 gov 自己的查詢；data-rust 不讀 gov 的 ingestion_runs。
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE "export"."ingestion_runs" ADD COLUMN "revision" TEXT;

COMMIT;
