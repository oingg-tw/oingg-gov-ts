-- CreateView
-- analysis-ts 的 export 契約層新增歐洲央行政策利率 view，跟 export.cbc_policy_rate、
-- export.us_policy_rate 是同一組（台灣／美國／歐元區政策利率，同一種「每列一次調整」的形狀）。
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."ecb_policy_rate" AS
SELECT
  "effective_date",
  "deposit_facility_rate", "main_refinancing_rate", "marginal_lending_rate",
  "main_refinancing_is_minimum_bid",
  "updated_at"
FROM "public"."ecb_policy_rate";
