-- 從 export.quarterly_gdp 拿掉 yoy_change_percent。這張主計總處的表是「貢獻度」表，12 個項目的值都
-- 是百分點，官方附的「年增率(%)」是對百分點數字本身再算一次年增率（國外淨需求 2026Q1 = 1757.89%），
-- 對所有項目都沒有分析意義；growth_rate 列的 contribution_points 本身就是經濟成長率。analysis-ts
-- 2026-09-22 接端點時發現這欄會誤導前端，決定從契約層移除（raw 表保留原始值）。
-- Postgres 的 CREATE OR REPLACE VIEW 不能減少欄位，要先 DROP 再 CREATE。
DROP VIEW "export"."quarterly_gdp";

CREATE VIEW "export"."quarterly_gdp" AS
SELECT "year", "quarter", "category", "contribution_points", "updated_at"
FROM "public"."quarterly_gdp";
