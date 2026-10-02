-- DropTable
-- 使用者 2026-10-02 裁定移除 gov-ts 公司資料的「查詢面」與兩張沒有下游的表。
--
-- company_business_items（正式環境 22,487 列）：GCIS 商工登記的營業項目。它存在的唯一目的是
-- 「用 MOEA 營業項目橋接 DGBAS 行業分類」，那條橋接沒有做成（analysis-ts 的紀錄：MOEA 營業項目
-- 對不上 DGBAS 行業分類），這張表從來沒有 export view，也沒有任何服務在讀。
--
-- company_profile_ingestion_failures（正式環境 0 列）：記「還沒成功登記的統編」，唯一的讀取者是
-- 一併移除的 GET /api/query/company-profile/failures。失敗現在逐筆回在 ingest 的 HTTP 回應裡。
--
-- 刻意保留的（analysis-ts 正在讀，已確認）：company_profiles、company_industry_classifications、
-- tax_industry_classification 三張表，以及 export.company_industry_classification 與
-- export.industry_codes 兩個 view。前者撐 Altman Z″ 的製造業判斷（section='C'），後者撐
-- GET /industries/tree 與 /flat。
--
-- company_business_items 外鍵到 company_profiles，但這裡刪的是子表，不影響父表。
DROP TABLE "company_business_items";
DROP TABLE "company_profile_ingestion_failures";
