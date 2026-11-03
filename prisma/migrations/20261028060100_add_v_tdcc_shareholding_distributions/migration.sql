-- CreateView
-- 集保戶股權分散表（data.gov.tw 11452），2026-10-28 從 oingg-sitca-ts 接手。view 名稱、欄位、型別刻意跟
-- sitca 庫裡的 export.v_tdcc_shareholding_distributions 一模一樣，下游（data-rust、analysis-ts）只換連線
-- 不改查詢。level_kind 只是把來源的級距編號語意標出來（16 差異數調整、17 合計不是級距，加總會變兩倍），
-- 不是從資料推算的狀態。fetched_at = 第一次寫入的時間（同一期重抓會跳過，不會更新）。
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."v_tdcc_shareholding_distributions" AS
SELECT
  "symbol", "data_date", "holding_level", "holder_count", "shares", "custody_pct",
  "created_at" AS "fetched_at",
  CASE "holding_level"
    WHEN 17 THEN 'total'
    WHEN 16 THEN 'adjustment'
    ELSE 'bracket'
  END AS "level_kind"
FROM "public"."tdcc_shareholding_distribution";

COMMENT ON COLUMN "export"."v_tdcc_shareholding_distributions"."custody_pct" IS '占集保庫存數比例，單位為百分比（1 = 1%），0～100';
COMMENT ON COLUMN "export"."v_tdcc_shareholding_distributions"."data_date" IS '資料日期：快照反映的那一天（週資料，落在該週最後一個營業日），不是發布日也不是抓取日';
