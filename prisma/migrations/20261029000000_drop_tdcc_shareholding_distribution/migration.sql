-- 撤回 20261028060000 / 20261028060100：集保戶股權分散表（11452）不交給 gov（使用者 2026-10-29）。
-- gov 抓的還是集保同一份檔案，跟 oingg-sitca-ts 打集保 OpenAPI 是同一個來源，換手沒有意義；資料留在
-- sitca 的 export.v_tdcc_shareholding_distributions。這兩張物件在 PRD 建好後從未部署過寫入的程式，是空的。
DROP VIEW "export"."v_tdcc_shareholding_distributions";
DROP TABLE "tdcc_shareholding_distribution";
