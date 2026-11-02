-- 單位是 % 的利率欄位加上 *_pct 新名（2026-11-03 跟 data-rust 確認欄名）：詞彙表的 `*_pct` 規則把
-- 「_rate 表示 %」列為避免用法，命名照第 239 行「票面利率 couponRatePct」，名詞保留、加 _pct 後綴。
-- 兩階段：這支只在 view 尾端加新欄（CREATE OR REPLACE VIEW 只能在最後加欄），舊欄保留；data-rust 改讀
-- 新欄並部署後通知我們，下一支 migration 再刪舊欄。底表欄名不動。
-- v_daily_usd_twd_rates 的 *_rate 是匯率（每 1 美元兌新台幣），不是 %，不改。
-- 新增欄位不會被 data-rust 的欄位快照擋下；跟 20261103010000 同一次上 PRD（data-rust 2026-11-03 同意），
-- 跑之前照樣通知 data-rust。
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE OR REPLACE VIEW "export"."v_monthly_gov_bond_yields_10y" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "yield_rate",
  "updated_at",
  "yield_rate" AS "yield_rate_pct"
FROM "public"."monthly_gov_bond_yield_10y";

CREATE OR REPLACE VIEW "export"."v_monthly_five_major_bank_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "deposit_rate_1m",
  "deposit_rate_1y",
  "base_lending_rate",
  "updated_at",
  "deposit_rate_1m" AS "deposit_rate_1m_pct",
  "deposit_rate_1y" AS "deposit_rate_1y_pct",
  "base_lending_rate" AS "base_lending_rate_pct"
FROM "public"."monthly_five_major_bank_rate";

CREATE OR REPLACE VIEW "export"."v_cbc_policy_rates" AS
SELECT
  "effective_date",
  "discount_rate",
  "collateral_accommodation_rate",
  "unsecured_accommodation_rate",
  "updated_at",
  "discount_rate" AS "discount_rate_pct",
  "collateral_accommodation_rate" AS "collateral_accommodation_rate_pct",
  "unsecured_accommodation_rate" AS "unsecured_accommodation_rate_pct"
FROM "public"."cbc_policy_rate";

CREATE OR REPLACE VIEW "export"."v_ecb_policy_rates" AS
SELECT
  "effective_date",
  "deposit_facility_rate",
  "main_refinancing_rate",
  "marginal_lending_rate",
  "main_refinancing_is_minimum_bid",
  "updated_at",
  "deposit_facility_rate" AS "deposit_facility_rate_pct",
  "main_refinancing_rate" AS "main_refinancing_rate_pct",
  "marginal_lending_rate" AS "marginal_lending_rate_pct"
FROM "public"."ecb_policy_rate";

CREATE OR REPLACE VIEW "export"."v_us_policy_rates" AS
SELECT
  "effective_date",
  "target_upper",
  "target_lower",
  "updated_at",
  "target_upper" AS "target_upper_pct",
  "target_lower" AS "target_lower_pct"
FROM "public"."us_policy_rate";

COMMIT;
