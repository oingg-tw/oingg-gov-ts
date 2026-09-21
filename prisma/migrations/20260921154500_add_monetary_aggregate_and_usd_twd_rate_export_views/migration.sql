-- CreateView
-- analysis-ts 的 export 契約層新增兩個 view，對應這次一起建的 monthly_monetary_aggregate /
-- daily_usd_twd_rate 兩張表。etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，新視圖
-- 建立後會自動被涵蓋，不需要重新 GRANT。
CREATE VIEW "export"."monthly_monetary_aggregate" AS
SELECT
  "year", "month",
  "m1a_amount", "m1a_yoy_percent",
  "m1b_amount", "m1b_yoy_percent",
  "m2_amount", "m2_yoy_percent",
  "updated_at"
FROM "public"."monthly_monetary_aggregate";

CREATE VIEW "export"."daily_usd_twd_rate" AS
SELECT
  "trade_date",
  "bank_buying_rate", "bank_selling_rate", "interbank_closing_rate",
  "updated_at"
FROM "public"."daily_usd_twd_rate";
