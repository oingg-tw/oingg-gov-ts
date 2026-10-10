-- CreateView
-- fund_basic_info 的新 view 名，analysis-ts 依詞彙表定名為 v_fund_profiles（2026-10-11）：跟
-- twse／tpex 的 v_company_profiles 同一類東西，用同一個字根。舊 view export.fund_basic_info 保留，
-- 等 analysis-ts 回「可以刪」再移除。欄位跟舊 view 相同，另加 year_month（DATE，該月 1 日）。
-- 這份資料是投信投顧公會每月發布的快照，不是累積歷史，寫在 COMMENT 不放進名稱（詞彙表的做法）。
CREATE VIEW "export"."v_fund_profiles" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "year", "month",
  "company_name", "fund_name", "fund_tax_id", "fund_inception_date",
  "fund_size_date", "fund_size_currency", "class_size_amount", "fund_size_amount",
  "fund_type", "investment_region", "dividend_policy", "isin_code",
  "custodian_domestic", "custodian_foreign", "denomination_currency",
  "updated_at"
FROM "public"."fund_basic_info";

COMMENT ON VIEW "export"."v_fund_profiles" IS
  '境內基金基本資料（data.gov.tw 43476，投信投顧公會）。每月一份快照，不是累積歷史：(year, month) 是快照月份，同一檔基金每月一列。';
