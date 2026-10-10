-- CreateView
-- analysis-ts 的 export 契約層新增台灣歷次景氣循環峰谷日期。日期欄位是年月粒度（存該月 1 日），
-- 月數是國發會原值。etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."business_cycle_reference_date" AS
SELECT
  "cycle_no", "trough_start", "peak", "trough_end",
  "expansion_months", "contraction_months", "total_months",
  "updated_at"
FROM "public"."business_cycle_reference_date";
