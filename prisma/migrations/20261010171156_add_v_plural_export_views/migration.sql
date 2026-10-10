-- CreateView
-- 生態系官方詞彙表（analysis-ts UBIQUITOUS_LANGUAGE.md）改名，使用者 2026-10-11 核准。
-- 這支只「新增」v_<複數名詞> 的新 view，舊 view 一個都不動；analysis-ts 改讀新名並回覆「可以刪」
-- 之後，另一支 migration 才移除舊 view。新 view 只有新欄名，不並列舊欄名——舊名由舊 view 提供。
--
-- 規則（詞彙表 commit 5621da4d）：
--   view 名      export.v_<複數名詞>（照 twse/tpex 先例，把最後一個名詞改複數）
--   月頻         year、month 保留，另加 year_month（DATE，該月 1 日），只在 view 裡算
--   百分比       *_percent → *_pct
--   SITCA 基金代號  fund_code → sitca_fund_code（不唯一、不是證券代號，不能當鍵）
-- fund_basic_info 這次沒有做：info 不可數，套不上「複數名詞」，名稱等 analysis-ts 定案再補。
-- export.ingestion_runs 不改名（共用交接表，不是資料 view）。

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
