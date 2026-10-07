-- DropView
-- DropTable
-- 使用者 2026-10-07 裁定移除公司產業分類整組。
--
-- 這組是為了「用財政部稅籍登記的行業別做公司產業分類」而建的。唯一的下游是 analysis-ts 的
-- Altman Z″ 製造業判斷（section = 'C'）；analysis-ts 2026-10-07 改用交易所類股、兩市統一，
-- 不再讀 gov 任何產業分類 view（他們的 commit 1148f6d1；理由是上市用稅籍分類、上櫃用交易所分類
-- 會讓兩市的「非製造業」定義不一致，而那個不一致會直接進到 Z″ 的母體）。
-- GET /industries/tree 與 /flat 也已於同日退役，export.industry_codes 先前已移除。
--
-- 刪除前量到的規模與狀態（正式環境，2026-10-02）：
--   company_profiles                 1,003 筆  全部是上市公司
--   company_industry_classifications 2,835 列  rank=0 有 999 列
--   tax_industry_classification      2,466 筆  財政部稅務行業標準分類第9次修訂的代碼字典
--
-- 為什麼只有上市：唯一的入口是 POST /api/ingest/company-profile，需要 body（證券代碼＋統編陣列），
-- Cloud Scheduler 給不了，而唯一的呼叫者是 twse-ts 的一支手動腳本（預設打 localhost）。
-- 每週的 refresh-tracked 是從這張表自己撈清單重抓，所以只能刷新、永遠長不出新公司。
-- 實際覆蓋率是全市場 2,349 家裡的 999 家（42.5%），而 Z″ 的 gating 原本是 fail-open，
-- 查不到分類的 1,350 家會被當成非製造業照算——那個靜默錯誤是 analysis-ts 改用交易所類股的起因。
--
-- 依外鍵依賴順序刪，不用 CASCADE：順序寫錯會當場失敗，而不是連帶刪掉沒預期的東西。
DROP VIEW "export"."company_industry_classification";

DROP TABLE "company_industry_classifications";
DROP TABLE "company_profiles";
DROP TABLE "tax_industry_classification";

-- export.ingestion_runs 是 analysis-ts 的握手表（他們只認 status='success' 的紀錄，raw 表有資料但
-- 沒有對應 success 紀錄就當作不存在）。對應的表與 view 都不存在了，留著會讓下游以為那份資料
-- 「可信、已完成」。
DELETE FROM "export"."ingestion_runs"
WHERE "dataset" IN ('company_profile', 'company_industry_classification', 'tax_industry_classification');
