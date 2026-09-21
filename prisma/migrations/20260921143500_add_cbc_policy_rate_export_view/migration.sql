-- CreateView
-- analysis-ts 的 export 契約層新增央行政策利率 view，對應這次一起建的 cbc_policy_rate 表。
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，新視圖建立後會自動被涵蓋，
-- 不需要重新 GRANT。
CREATE VIEW "export"."cbc_policy_rate" AS
SELECT
  "effective_date",
  "discount_rate", "collateral_accommodation_rate", "unsecured_accommodation_rate",
  "updated_at"
FROM "public"."cbc_policy_rate";
