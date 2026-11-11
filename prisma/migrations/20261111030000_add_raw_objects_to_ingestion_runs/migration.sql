-- 每筆匯入紀錄記這次用了哪些原始回應：GCS oingg-gov-bronze 裡的物件路徑（銅層，2026-11-11 使用者定的）。
-- 解析寫錯時，匯入端點帶 replayRunId 就改讀這幾個檔重跑。之前的紀錄沒有原始檔，是空陣列。
-- 有預設值，上一版程式不帶這欄照常能寫，退版不受影響。讀者只有 gov 自己；data-rust 不讀 gov 的 ingestion_runs。
BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE "export"."ingestion_runs" ADD COLUMN "raw_objects" TEXT[] DEFAULT ARRAY[]::TEXT[];

COMMIT;
