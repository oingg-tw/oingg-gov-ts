-- 格式技術債一次清掉（2026-11-03 生態系自查，使用者：「只要不合理就改掉」）：
--   1. 19 張底表的 created_at／updated_at：TIMESTAMP(3) → TIMESTAMPTZ(3)。Prisma 寫進去的是 UTC，
--      所以 USING ... AT TIME ZONE 'UTC'。之前不改的理由只是「被 view 依賴、要重建 19 個 view」。
--   2. fund_basic_info：fund_inception_date／fund_size_date 從原始字串 "YYYYMMDD" 轉 DATE（DEV 實測
--      4,432 列全是西元 8 碼）；fund_type "(AH22) 跨國投資指數股票型_債券型" 拆成 fund_type_code ＋
--      fund_type_name；fund_size_currency「台幣」→ ISO "TWD"（同表 denomination_currency 早就是 ISO）；
--      dividend_policy 空字串 → NULL。
--   3. labor_broker_license：address／phone／responsible_person 空字串 → NULL。
-- 轉不過去的值（不是 8 碼日期、fund_type 不是「(代號) 名稱」）會讓這個 migration 直接失敗，不會默默存錯。
--
-- view 的欄位型別會跟著變：19 個 view 的 updated_at 變 timestamptz；v_fund_profiles 的兩個日期變 date、
-- fund_type 換成 fund_type_code／fund_type_name。讀者 data-rust 讀其中 13 個 view，它的欄位快照比對涵蓋
-- 整個 view（沒 SELECT 的 updated_at 也算），所以 PRD 跑之前要先通知 data-rust 更新快照（2026-11-03 約定）；
-- v_fund_profiles、v_labor_broker_* 沒有讀者。
-- etl_reader 的權限來自 export schema 的 ALTER DEFAULT PRIVILEGES，重建的 view 自動涵蓋。
--
-- 整支包在一個交易裡（同 twse-ts 20261016140000）：讀的人只會等鎖，不會遇到 view 不存在；中途任何一步
-- 失敗就整個退回，不會留下 view 被刪掉的半套狀態。lock_timeout 讓遇到長查詢時 migration 失敗，而不是
-- 一直卡著讀的人。
BEGIN;
SET LOCAL lock_timeout = '3s';

-- DropView（PostgreSQL 不准 ALTER TYPE 被 view 依賴的欄位）
DROP VIEW "export"."v_business_cycle_reference_dates";
DROP VIEW "export"."v_cbc_policy_rates";
DROP VIEW "export"."v_daily_usd_twd_rates";
DROP VIEW "export"."v_ecb_policy_rates";
DROP VIEW "export"."v_fund_daily_navs";
DROP VIEW "export"."v_fund_profiles";
DROP VIEW "export"."v_labor_broker_evaluations";
DROP VIEW "export"."v_labor_broker_licenses";
DROP VIEW "export"."v_labor_broker_tax_registrations";
DROP VIEW "export"."v_monthly_business_cycle_indicators";
DROP VIEW "export"."v_monthly_cpis";
DROP VIEW "export"."v_monthly_five_major_bank_rates";
DROP VIEW "export"."v_monthly_gov_bond_yields_10y";
DROP VIEW "export"."v_monthly_monetary_aggregates";
DROP VIEW "export"."v_monthly_stock_market_summaries";
DROP VIEW "export"."v_monthly_unemployment_rates";
DROP VIEW "export"."v_quarterly_gdps";
DROP VIEW "export"."v_quarterly_us_gnp_deflators";
DROP VIEW "export"."v_us_policy_rates";

-- 1. created_at／updated_at → TIMESTAMPTZ(3)
ALTER TABLE "monthly_gov_bond_yield_10y" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_five_major_bank_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "cbc_policy_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_monetary_aggregate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "daily_usd_twd_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "quarterly_us_gnp_deflator" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "us_policy_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "ecb_policy_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_stock_market_summary" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "labor_broker_license" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "labor_broker_evaluation" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "labor_broker_tax_registration" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_cpi" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "quarterly_gdp" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_unemployment_rate" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "monthly_business_cycle_indicator" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "fund_basic_info" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "fund_daily_nav" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "business_cycle_reference_date" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC', ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

-- 2. fund_basic_info
ALTER TABLE "fund_basic_info"
  ALTER COLUMN "fund_inception_date" DROP NOT NULL,
  ALTER COLUMN "fund_inception_date" SET DATA TYPE DATE USING to_date(NULLIF(btrim("fund_inception_date"), ''), 'YYYYMMDD'),
  ALTER COLUMN "fund_size_date" DROP NOT NULL,
  ALTER COLUMN "fund_size_date" SET DATA TYPE DATE USING to_date(NULLIF(btrim("fund_size_date"), ''), 'YYYYMMDD'),
  ALTER COLUMN "dividend_policy" DROP NOT NULL,
  ADD COLUMN "fund_type_code" TEXT,
  ADD COLUMN "fund_type_name" TEXT;

UPDATE "fund_basic_info" SET
  "fund_type_code" = substring("fund_type" from '^\(([A-Z0-9]+)\)'),
  "fund_type_name" = btrim(substring("fund_type" from '^\([A-Z0-9]+\)\s*(.+)$')),
  "fund_size_currency" = CASE "fund_size_currency" WHEN '台幣' THEN 'TWD' ELSE "fund_size_currency" END,
  "dividend_policy" = NULLIF(btrim("dividend_policy"), '');

-- 有列拆不出代號或名稱時 SET NOT NULL 會失敗，migration 整個退回
ALTER TABLE "fund_basic_info"
  ALTER COLUMN "fund_type_code" SET NOT NULL,
  ALTER COLUMN "fund_type_name" SET NOT NULL,
  DROP COLUMN "fund_type";

-- 3. labor_broker_license
ALTER TABLE "labor_broker_license"
  ALTER COLUMN "address" DROP NOT NULL,
  ALTER COLUMN "phone" DROP NOT NULL,
  ALTER COLUMN "responsible_person" DROP NOT NULL;

UPDATE "labor_broker_license" SET
  "address" = NULLIF(btrim("address"), ''),
  "phone" = NULLIF(btrim("phone"), ''),
  "responsible_person" = NULLIF(btrim("responsible_person"), '');

-- CreateView：除了 v_fund_profiles 的欄位，其他跟 20261010171156 定義相同
CREATE VIEW "export"."v_business_cycle_reference_dates" AS
SELECT
  "cycle_no",
  "trough_start",
  "peak",
  "trough_end",
  "expansion_months",
  "contraction_months",
  "total_months",
  "updated_at",
  "supplemented_fields",
  "supplement_source"
FROM "public"."business_cycle_reference_date";

CREATE VIEW "export"."v_cbc_policy_rates" AS
SELECT
  "effective_date",
  "discount_rate",
  "collateral_accommodation_rate",
  "unsecured_accommodation_rate",
  "updated_at"
FROM "public"."cbc_policy_rate";

CREATE VIEW "export"."v_daily_usd_twd_rates" AS
SELECT
  "trade_date",
  "bank_buying_rate",
  "bank_selling_rate",
  "interbank_closing_rate",
  "updated_at"
FROM "public"."daily_usd_twd_rate";

CREATE VIEW "export"."v_ecb_policy_rates" AS
SELECT
  "effective_date",
  "deposit_facility_rate",
  "main_refinancing_rate",
  "marginal_lending_rate",
  "main_refinancing_is_minimum_bid",
  "updated_at"
FROM "public"."ecb_policy_rate";

CREATE VIEW "export"."v_fund_daily_navs" AS
SELECT
  "trade_date",
  "member_code",
  "company_name",
  "fund_tax_id",
  "fund_code" AS "sitca_fund_code",
  "fund_name",
  "nav_value",
  "change_value",
  "change_percent" AS "change_pct",
  "type_code",
  "currency",
  "beneficiary_code",
  "updated_at"
FROM "public"."fund_daily_nav";

CREATE VIEW "export"."v_fund_profiles" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year", "month",
  "company_name", "fund_name", "fund_tax_id", "fund_inception_date",
  "fund_size_date", "fund_size_currency", "class_size_amount", "fund_size_amount",
  "fund_type_code", "fund_type_name", "investment_region", "dividend_policy", "isin_code",
  "custodian_domestic", "custodian_foreign", "denomination_currency",
  "updated_at"
FROM "public"."fund_basic_info";

COMMENT ON VIEW "export"."v_fund_profiles" IS
  '境內基金基本資料（data.gov.tw 43476，投信投顧公會）。每月一份快照，不是累積歷史：(year, month) 是快照月份，同一檔基金每月一列。';

CREATE VIEW "export"."v_labor_broker_evaluations" AS
SELECT
  "year",
  "license_no",
  "company_name",
  "region",
  "address",
  "quality_score",
  "violation_score",
  "customer_service_score",
  "other_score",
  "total_score",
  "has_suspension",
  "has_major_violation",
  "updated_at"
FROM "public"."labor_broker_evaluation";

CREATE VIEW "export"."v_labor_broker_licenses" AS
SELECT
  "license_no",
  "raw_license_no",
  "agency_name",
  "address",
  "phone",
  "responsible_person",
  "tax_id",
  "professional_staff_count",
  "staff_count",
  "license_start_date",
  "license_end_date",
  "suspension_start_date",
  "suspension_end_date",
  "expected_resume_date",
  "terminated_date",
  "revoked_date",
  "updated_at"
FROM "public"."labor_broker_license";

CREATE VIEW "export"."v_labor_broker_tax_registrations" AS
SELECT
  "tax_id",
  "industry_code",
  "business_name",
  "address",
  "is_primary_industry",
  "updated_at"
FROM "public"."labor_broker_tax_registration";

CREATE VIEW "export"."v_monthly_business_cycle_indicators" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
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

CREATE VIEW "export"."v_monthly_cpis" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "category",
  "index_value",
  "yoy_change_percent" AS "yoy_change_pct",
  "updated_at"
FROM "public"."monthly_cpi";

CREATE VIEW "export"."v_monthly_five_major_bank_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "deposit_rate_1m",
  "deposit_rate_1y",
  "base_lending_rate",
  "updated_at"
FROM "public"."monthly_five_major_bank_rate";

CREATE VIEW "export"."v_monthly_gov_bond_yields_10y" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "yield_rate",
  "updated_at"
FROM "public"."monthly_gov_bond_yield_10y";

CREATE VIEW "export"."v_monthly_monetary_aggregates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "m1a_amount",
  "m1a_yoy_percent" AS "m1a_yoy_pct",
  "m1b_amount",
  "m1b_yoy_percent" AS "m1b_yoy_pct",
  "m2_amount",
  "m2_yoy_percent" AS "m2_yoy_pct",
  "updated_at"
FROM "public"."monthly_monetary_aggregate";

CREATE VIEW "export"."v_monthly_stock_market_summaries" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "listed_companies",
  "total_par_value",
  "total_market_value",
  "total_trading_value",
  "avg_daily_trading_value",
  "avg_taiex",
  "avg_taiex_yoy_percent" AS "avg_taiex_yoy_pct",
  "updated_at"
FROM "public"."monthly_stock_market_summary";

CREATE VIEW "export"."v_monthly_unemployment_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "category",
  "rate_percent" AS "rate_pct",
  "updated_at"
FROM "public"."monthly_unemployment_rate";

CREATE VIEW "export"."v_quarterly_gdps" AS
SELECT
  "year",
  "quarter",
  "category",
  "contribution_points",
  "updated_at"
FROM "public"."quarterly_gdp";

CREATE VIEW "export"."v_quarterly_us_gnp_deflators" AS
SELECT
  "year",
  "quarter",
  "index_value",
  "updated_at"
FROM "public"."quarterly_us_gnp_deflator";

CREATE VIEW "export"."v_us_policy_rates" AS
SELECT
  "effective_date",
  "target_upper",
  "target_lower",
  "updated_at"
FROM "public"."us_policy_rate";

COMMIT;
