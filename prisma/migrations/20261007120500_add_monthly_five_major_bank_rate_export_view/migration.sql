-- CreateView
-- analysis-ts 的 export 契約層新增五大銀行存款利率 view。這是給 Sharpe/Sortino/Jensen α 用的
-- 短天期無風險利率——export.monthly_gov_bond_yield_10y 那支 10 年期適合 CAPM 與歷史法 ERP，
-- 不適合配一年窗口的日報酬（理由見 prisma/schema.prisma 的 MonthlyFiveMajorBankRate 註解）。
-- 下游依窗口選天期：月報酬配 deposit_rate_1m，一年窗口配 deposit_rate_1y。
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."monthly_five_major_bank_rate" AS
SELECT
  "year", "month",
  "deposit_rate_1m", "deposit_rate_1y", "base_lending_rate",
  "updated_at"
FROM "public"."monthly_five_major_bank_rate";
