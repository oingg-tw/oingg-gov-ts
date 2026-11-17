-- 兩件事合在一支（使用者 2026-11-16 決定）：
--   1. 勞動部仲介三支刪除的第二步（使用者 2026-11-13 決定刪掉）：程式 2026-11-14 已拿掉（main a1289b7），
--      沒有服務讀。DROP 3 個 export view 和 3 張底表。PRD 最後一次匯入是 11-02、11-04，早於銅層上線
--      （11-11），所以銅層沒有這三支的原始檔；要再用就從 git 歷史拿回程式、重抓來源的現況。
--   2. 8 支月頻 view 拿掉 year、month，只留 year_month（數據中台的用詞檢核提的）。讀者 data-rust 讀其中 6 支，
--      它的欄位快照已經拿掉 year、month（DEV d7ff728、PRD d4eeb30，都在 2026-11-16 上線），刪了不會被它的
--      欄位檢查擋；v_fund_profiles、v_monthly_unemployment_rates 沒有讀者。
--      CREATE OR REPLACE VIEW 不能刪欄，所以先 drop 再建；欄位順序 = 現行 view 去掉 year、month。
--      底表的 year、month 是主鍵，不動。v_fund_profiles 的 COMMENT 會跟著 drop 消失，照新欄名重建；
--      其他 7 支本來就沒有 COMMENT。季頻的 year、quarter 不在這次範圍。
-- etl_reader 的 SELECT 由 export schema 的 ALTER DEFAULT PRIVILEGES 自動補上；這 11 個 view 沒有別的 view
-- 依賴（2026-11-16 PRD、DEV 都核對過）。整支包在一個交易裡，同 20261103010000：讀的人只會等鎖，中途失敗
-- 就整個退回；lock_timeout 讓遇到長查詢時 migration 失敗，而不是一直卡著讀的人。
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1. 仲介三支
DROP VIEW "export"."v_labor_broker_evaluations";
DROP VIEW "export"."v_labor_broker_licenses";
DROP VIEW "export"."v_labor_broker_tax_registrations";
DROP TABLE "public"."labor_broker_evaluation";
DROP TABLE "public"."labor_broker_license";
DROP TABLE "public"."labor_broker_tax_registration";

-- 2. 月頻 view 拿掉 year、month
DROP VIEW "export"."v_fund_profiles";
CREATE VIEW "export"."v_fund_profiles" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "company_name", "fund_name", "fund_tax_id", "fund_inception_date",
  "fund_size_date", "fund_size_currency", "class_size_amount", "fund_size_amount",
  "fund_type_code", "fund_type_name", "investment_region", "dividend_policy", "isin_code",
  "custodian_domestic", "custodian_foreign", "denomination_currency",
  "updated_at"
FROM "public"."fund_basic_info";

COMMENT ON VIEW "export"."v_fund_profiles" IS
  '境內基金基本資料（data.gov.tw 43476，投信投顧公會）。每月一份快照，不是累積歷史：year_month 是快照月份（該月 1 日），同一檔基金每月一列。';

DROP VIEW "export"."v_monthly_business_cycle_indicators";
CREATE VIEW "export"."v_monthly_business_cycle_indicators" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "leading_index_composite",
  "leading_index_detrended",
  "coincident_index_composite",
  "coincident_index_detrended",
  "lagging_index_composite",
  "lagging_index_detrended",
  "signal_score",
  "signal_light",
  "updated_at"
FROM "public"."monthly_business_cycle_indicator";

DROP VIEW "export"."v_monthly_cpis";
CREATE VIEW "export"."v_monthly_cpis" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "index_value",
  "yoy_change_percent" AS "yoy_change_pct",
  "updated_at"
FROM "public"."monthly_cpi";

DROP VIEW "export"."v_monthly_five_major_bank_rates";
CREATE VIEW "export"."v_monthly_five_major_bank_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "updated_at",
  "deposit_rate_1m" AS "deposit_rate_1m_pct",
  "deposit_rate_1y" AS "deposit_rate_1y_pct",
  "base_lending_rate" AS "base_lending_rate_pct"
FROM "public"."monthly_five_major_bank_rate";

DROP VIEW "export"."v_monthly_gov_bond_yields_10y";
CREATE VIEW "export"."v_monthly_gov_bond_yields_10y" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "updated_at",
  "yield_rate" AS "yield_rate_pct"
FROM "public"."monthly_gov_bond_yield_10y";

DROP VIEW "export"."v_monthly_monetary_aggregates";
CREATE VIEW "export"."v_monthly_monetary_aggregates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "m1a_amount",
  "m1a_yoy_percent" AS "m1a_yoy_pct",
  "m1b_amount",
  "m1b_yoy_percent" AS "m1b_yoy_pct",
  "m2_amount",
  "m2_yoy_percent" AS "m2_yoy_pct",
  "updated_at"
FROM "public"."monthly_monetary_aggregate";

DROP VIEW "export"."v_monthly_stock_market_summaries";
CREATE VIEW "export"."v_monthly_stock_market_summaries" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "listed_companies",
  "total_par_value",
  "total_market_value",
  "total_trading_value",
  "avg_daily_trading_value",
  "avg_taiex",
  "avg_taiex_yoy_percent" AS "avg_taiex_yoy_pct",
  "updated_at"
FROM "public"."monthly_stock_market_summary";

DROP VIEW "export"."v_monthly_unemployment_rates";
CREATE VIEW "export"."v_monthly_unemployment_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "rate_percent" AS "rate_pct",
  "updated_at"
FROM "public"."monthly_unemployment_rate";

COMMIT;
