-- AlterTable
ALTER TABLE "business_cycle_reference_date" ADD COLUMN     "supplement_source" TEXT,
ADD COLUMN     "supplemented_fields" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- 使用者 2026-10-10 裁定：開放資料（data.gov.tw 39486）落後國發會自己的公告時，可用原始公告補足。
-- 新增兩欄記錄出處，讓下游分得出資料集原值與公告補值；export view 跟著帶出（CREATE OR REPLACE
-- VIEW 允許在尾端加欄位）。
CREATE OR REPLACE VIEW "export"."business_cycle_reference_date" AS
SELECT
  "cycle_no", "trough_start", "peak", "trough_end",
  "expansion_months", "contraction_months", "total_months",
  "updated_at",
  "supplemented_fields", "supplement_source"
FROM "public"."business_cycle_reference_date";
