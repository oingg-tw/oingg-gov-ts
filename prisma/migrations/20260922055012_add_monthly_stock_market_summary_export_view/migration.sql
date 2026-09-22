-- CreateView
-- analysis-ts 的 export 契約層新增上市股票市場月統計 view（含加權指數月平均，1987 年起），對應這次一起建的
-- monthly_stock_market_summary 表。etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."monthly_stock_market_summary" AS
SELECT
  "year", "month",
  "listed_companies", "total_par_value", "total_market_value", "total_trading_value", "avg_daily_trading_value",
  "avg_taiex", "avg_taiex_yoy_percent",
  "updated_at"
FROM "public"."monthly_stock_market_summary";
