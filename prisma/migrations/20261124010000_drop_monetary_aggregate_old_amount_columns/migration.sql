-- 貨幣總計數金額欄改名的第二步：刪掉 v_monthly_monetary_aggregates 的 m1a_amount、m1b_amount、m2_amount。
--   第一步（20261123010000）在尾端加了 m1a/m1b/m2_amount_million_ntd 並存。讀者 data-rust 已經換讀新欄
--   （PRD 00094-m8r、DEV 00184-49z，2026-11-24 01:5x 上線），欄位快照 upstream_schema.json 也拿掉了舊的三欄，
--   刪了不會被它的欄位檢查擋。PRD 等它的新版跑滿一天才套（CLAUDE.md：穩定後再刪，讓上一版也能跑）。
-- CREATE OR REPLACE VIEW 不能刪欄，所以先 drop 再建；欄位順序 = 現行 view 去掉舊的三欄。底表欄名不動。
-- 原本只有三個新欄有 COMMENT，會跟著 drop 消失；照詞彙表「每個數字欄都要寫單位」重建，view 和年增率欄一起補上。
-- etl_reader 的 SELECT 由 export schema 的 ALTER DEFAULT PRIVILEGES 自動補上；沒有別的 view 依賴它
-- （2026-11-24 PRD、DEV 都核對過）。整支包在一個交易裡，lock_timeout 同前幾支。
BEGIN;
SET LOCAL lock_timeout = '3s';

DROP VIEW "export"."v_monthly_monetary_aggregates";
CREATE VIEW "export"."v_monthly_monetary_aggregates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "m1a_yoy_percent" AS "m1a_yoy_pct",
  "m1b_yoy_percent" AS "m1b_yoy_pct",
  "m2_yoy_percent" AS "m2_yoy_pct",
  "updated_at",
  "m1a_amount" AS "m1a_amount_million_ntd",
  "m1b_amount" AS "m1b_amount_million_ntd",
  "m2_amount" AS "m2_amount_million_ntd"
FROM "public"."monthly_monetary_aggregate";

COMMENT ON VIEW "export"."v_monthly_monetary_aggregates" IS
  '央行貨幣總計數 M1A、M1B、M2（金融統計月報 EF15M01，日平均，1987-05 起每月），一個月一列。M1A＝通貨＋支票存款＋活期存款，M1B＝M1A＋活期儲蓄存款，M2＝M1B＋準貨幣；組成細項見 v_monthly_monetary_aggregate_components。由 monthly-monetary-aggregate 匯入寫。';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1a_yoy_pct" IS '年增率，%（1 = 1%）';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1b_yoy_pct" IS '年增率，%（1 = 1%）';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m2_yoy_pct" IS '年增率，%（1 = 1%）';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1a_amount_million_ntd" IS '新台幣百萬元，日平均';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1b_amount_million_ntd" IS '新台幣百萬元，日平均';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m2_amount_million_ntd" IS '新台幣百萬元，日平均';

COMMIT;
