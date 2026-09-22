-- CreateView
-- analysis-ts 的 export 契約層新增美國 GNP 平減指數 view（O-Score SIZE 變數用），對應這次一起建的
-- quarterly_us_gnp_deflator 表。etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，
-- 不需要重新 GRANT。
CREATE VIEW "export"."quarterly_us_gnp_deflator" AS
SELECT "year", "quarter", "index_value", "updated_at"
FROM "public"."quarterly_us_gnp_deflator";
