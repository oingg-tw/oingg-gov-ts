-- CreateView
-- analysis-ts 的 export 契約層新增兩個基金相關 view，對應這次一起建的 fund_basic_info/
-- fund_daily_nav 兩張表。etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，這兩個
-- 新視圖建立後會自動被涵蓋，不需要重新 GRANT。
CREATE VIEW "export"."fund_basic_info" AS
SELECT
  "year", "month", "company_name", "fund_name", "fund_tax_id",
  "fund_inception_date", "fund_size_date", "fund_size_currency",
  "class_size_amount", "fund_size_amount", "fund_type",
  "investment_region", "dividend_policy", "isin_code",
  "custodian_domestic", "custodian_foreign", "denomination_currency",
  "updated_at"
FROM "public"."fund_basic_info";

CREATE VIEW "export"."fund_daily_nav" AS
SELECT
  "trade_date", "member_code", "company_name", "fund_tax_id", "fund_code",
  "fund_name", "nav_value", "change_value", "change_percent",
  "type_code", "currency", "beneficiary_code", "updated_at"
FROM "public"."fund_daily_nav";
