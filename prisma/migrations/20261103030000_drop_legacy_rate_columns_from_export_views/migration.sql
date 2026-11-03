-- 第二階段：刪掉 20261103020000 留著的 12 個舊利率欄名，只留 *_pct。data-rust（唯一讀者）的 DEV 00067、
-- PRD 00027 都已換上 f772d35 改讀 *_pct，上游快照也已拿掉舊欄（2026-11-03 通知）。底表欄名不動。
-- CREATE OR REPLACE VIEW 不能刪欄，所以先 drop 再建。欄位順序 = 現行 view 去掉舊欄（updated_at 在 *_pct
-- 前面），跟 data-rust 現在的快照一致。etl_reader 的 SELECT 由 ALTER DEFAULT PRIVILEGES 自動補上。
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP VIEW "export"."v_monthly_gov_bond_yields_10y";
CREATE VIEW "export"."v_monthly_gov_bond_yields_10y" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "updated_at",
  "yield_rate" AS "yield_rate_pct"
FROM "public"."monthly_gov_bond_yield_10y";

DROP VIEW "export"."v_monthly_five_major_bank_rates";
CREATE VIEW "export"."v_monthly_five_major_bank_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year",
  "month",
  "updated_at",
  "deposit_rate_1m" AS "deposit_rate_1m_pct",
  "deposit_rate_1y" AS "deposit_rate_1y_pct",
  "base_lending_rate" AS "base_lending_rate_pct"
FROM "public"."monthly_five_major_bank_rate";

DROP VIEW "export"."v_cbc_policy_rates";
CREATE VIEW "export"."v_cbc_policy_rates" AS
SELECT
  "effective_date",
  "updated_at",
  "discount_rate" AS "discount_rate_pct",
  "collateral_accommodation_rate" AS "collateral_accommodation_rate_pct",
  "unsecured_accommodation_rate" AS "unsecured_accommodation_rate_pct"
FROM "public"."cbc_policy_rate";

DROP VIEW "export"."v_ecb_policy_rates";
CREATE VIEW "export"."v_ecb_policy_rates" AS
SELECT
  "effective_date",
  "main_refinancing_is_minimum_bid",
  "updated_at",
  "deposit_facility_rate" AS "deposit_facility_rate_pct",
  "main_refinancing_rate" AS "main_refinancing_rate_pct",
  "marginal_lending_rate" AS "marginal_lending_rate_pct"
FROM "public"."ecb_policy_rate";

DROP VIEW "export"."v_us_policy_rates";
CREATE VIEW "export"."v_us_policy_rates" AS
SELECT
  "effective_date",
  "updated_at",
  "target_upper" AS "target_upper_pct",
  "target_lower" AS "target_lower_pct"
FROM "public"."us_policy_rate";

COMMIT;
