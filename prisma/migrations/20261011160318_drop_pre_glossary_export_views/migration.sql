-- DropView
-- 移除 19 個舊 export view 名稱，改名的最後一步。新名 export.v_<複數名詞> 從 2026-10-11 起已並存。
--
-- analysis-ts 2026-10-12 回覆「可以刪」：他們 DEV 已部署改讀 v_ 的 f4779371，程式碼 0 處再讀舊名。
-- 已知並經使用者 2026-10-12 決定接受的影響：analysis-ts 的 PRD 仍是 f5dd124，會讀其中 12 個總經
-- 舊名，刪除後他們 PRD 的 /macro/* 會失效，直到他們 PRD 也部署新版。使用者表示 PRD 目前不對外。
--
-- 這些舊 view 都只是單一表的直接 SELECT，沒有任何物件依賴它們（刪除前查 pg_depend 確認），新 view
-- 也是直接讀 public 的底層表，不經過舊 view，所以刪除不會連帶影響新 view。
DROP VIEW "export"."business_cycle_reference_date";
DROP VIEW "export"."cbc_policy_rate";
DROP VIEW "export"."daily_usd_twd_rate";
DROP VIEW "export"."ecb_policy_rate";
DROP VIEW "export"."fund_basic_info";
DROP VIEW "export"."fund_daily_nav";
DROP VIEW "export"."labor_broker_evaluation";
DROP VIEW "export"."labor_broker_license";
DROP VIEW "export"."labor_broker_tax_registration";
DROP VIEW "export"."monthly_business_cycle_indicator";
DROP VIEW "export"."monthly_cpi";
DROP VIEW "export"."monthly_five_major_bank_rate";
DROP VIEW "export"."monthly_gov_bond_yield_10y";
DROP VIEW "export"."monthly_monetary_aggregate";
DROP VIEW "export"."monthly_stock_market_summary";
DROP VIEW "export"."monthly_unemployment_rate";
DROP VIEW "export"."quarterly_gdp";
DROP VIEW "export"."quarterly_us_gnp_deflator";
DROP VIEW "export"."us_policy_rate";
