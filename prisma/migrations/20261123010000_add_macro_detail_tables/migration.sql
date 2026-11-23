-- 總經細項（網頁前端 2026-11-23 轉達使用者的決定：總經相關的都要用、要做殖利率曲線）。全部只加不改：
--   1. 三張新表＋三個新 view。資料來自原本就在抓的檔，由原本的 job 同一次匯入寫，不另開 job 重抓：
--      - monthly_capital_market_rate → v_monthly_capital_market_rates：央行資本市場利率 EG43M01en 全部 20 欄
--        （原本只存次級市場十年期，在 v_monthly_gov_bond_yields_10y）
--      - monthly_cpi_item → v_monthly_cpi_items：主計總處 CPI 全部 81 項（原本只存總指數和七大類，在 v_monthly_cpis）
--      - monthly_monetary_aggregate_component → v_monthly_monetary_aggregate_components：央行貨幣總計數
--        EF15M01en 全部 15 項（原本只存 M1A、M1B、M2，在 v_monthly_monetary_aggregates）
--      另加一支新來源：monthly_money_market_rate → v_monthly_money_market_rates：央行貨幣市場利率 EG41M01en 全部 21 欄，
--      新 job monthly-money-market-rate（網頁前端要用短期利率跟十年期公債算長短天期利差）。
--   2. （原本要在 v_quarterly_gdps 尾端加 yoy_change_pct，DEV 核對時發現那是貢獻度本身的年增率——今年這季貢獻度 ÷
--      去年同季 − 1，例如民間消費 2026Q2 是 3585.71%——不是各項目的成長率，所以不放出去。各項目的實質成長率在另一份檔，
--      見第 4 段。）
--   3. v_monthly_monetary_aggregates 尾端加 m1a/m1b/m2_amount_million_ntd：詞彙表規定金額預設千元、例外的單位寫進
--      欄名（數據中台 11-23 提）。舊的 m1a_amount 等三欄有讀者（data-rust），照讀者先行並存，等它換讀再刪。
--   4. 另一支新來源：quarterly_gdp_expenditure → v_quarterly_gdp_expenditures：主計總處「國內生產毛額及平減指數依支出分-季」
--      （na8102a6q.xml）17 個項目的名目、連鎖實質、平減指數和各自的年增率，新 job quarterly-gdp-expenditure。
-- CREATE OR REPLACE VIEW 只在尾端加欄。新 view 的 etl_reader SELECT 由 export schema 的 ALTER DEFAULT PRIVILEGES
-- 自動補上。新表一開始是空的，部署後第一次匯入（排程或手動觸發）才寫進去。整支包在一個交易裡，lock_timeout 同前幾支。
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1. 新表（prisma migrate diff 產生，加上 schema 前綴）
CREATE TABLE "public"."monthly_capital_market_rate" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "rate" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_capital_market_rate_pkey" PRIMARY KEY ("year","month","category")
);

CREATE TABLE "public"."monthly_money_market_rate" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "rate" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_money_market_rate_pkey" PRIMARY KEY ("year","month","category")
);

CREATE TABLE "public"."monthly_monetary_aggregate_component" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "amount_million_ntd" DECIMAL(14,0) NOT NULL,
    "yoy_change_percent" DECIMAL(8,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_monetary_aggregate_component_pkey" PRIMARY KEY ("year","month","category")
);

CREATE TABLE "public"."monthly_cpi_item" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "item_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "parent_item_name" TEXT,
    "item_order" INTEGER NOT NULL,
    "index_value" DECIMAL(10,4),
    "yoy_change_percent" DECIMAL(8,4),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_cpi_item_pkey" PRIMARY KEY ("year","month","item_name")
);

-- 新 view
CREATE VIEW "export"."v_monthly_capital_market_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "rate" AS "rate_pct",
  "updated_at"
FROM "public"."monthly_capital_market_rate";

COMMENT ON VIEW "export"."v_monthly_capital_market_rates" IS
  '央行資本市場利率（金融統計月報 EG43M01，1987-05 起每月）全部 20 欄的長表，一個（月, category）一列。category：政府公債 gov_bond_3y／5y／7y／10y／15y、公司債 corporate_bond_1y～10y（8 個天期）、金融債券 bank_debenture_2y／3y／5y、央行定期存單 cbc_cd_1y／2y、央行儲蓄券 cbc_savings_bond_1y、十年期政府公債次級市場利率 gov_bond_10y_secondary_market。除了 gov_bond_10y_secondary_market（1994-12 起連續，同 v_monthly_gov_bond_yields_10y），其他只有當月有發行才有值，沒有值的月份沒有列。由 gov-bond-yield-10y 那支匯入一起寫。';
COMMENT ON COLUMN "export"."v_monthly_capital_market_rates"."rate_pct" IS '年息百分比（1 = 1%）';

CREATE VIEW "export"."v_monthly_money_market_rates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "rate" AS "rate_pct",
  "updated_at"
FROM "public"."monthly_money_market_rate";

COMMENT ON VIEW "export"."v_monthly_money_market_rates" IS
  '央行貨幣市場利率（金融統計月報 EG41M01，1987-05 起每月）全部 21 欄的長表，一個（月, category）一列。category：金融業拆款 interbank_call_loan；商業本票 commercial_paper_primary_／commercial_paper_secondary_ 加 1_30d、31_90d、91_180d；可轉讓定期存單次級市場 negotiable_cd_secondary_1_90d、91_180d；銀行承兌匯票次級市場 bankers_acceptance_secondary_1_30d、31_90d、91_180d；國庫券初級市場 treasury_bill_primary_1_91d、92_182d、183_364d；國庫券次級市場 treasury_bill_secondary_1_30d、31_91d、92_182d；公債附條件交易次級市場 gov_bond_repo_1_30d、31_90d、91_180d。商業本票與可轉讓定存單每月都有值，其他有空月；沒有值的月份沒有列。由 monthly-money-market-rate 匯入寫。';
COMMENT ON COLUMN "export"."v_monthly_money_market_rates"."rate_pct" IS '年息百分比（1 = 1%）';

CREATE VIEW "export"."v_monthly_cpi_items" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "item_name",
  "parent_item_name",
  "item_order",
  "index_value",
  "yoy_change_percent" AS "yoy_change_pct",
  "updated_at"
FROM "public"."monthly_cpi_item";

COMMENT ON VIEW "export"."v_monthly_cpi_items" IS
  '主計總處消費者物價基本分類指數（1981-01 起每月）全部 81 項：總指數、七大類、73 個細項，一個（月, item_name）一列。item_name 是官方名稱去掉編號和基期標註；category 是所屬大類，代碼同 v_monthly_cpis.category（總指數是 total）；parent_item_name 是上一層（總指數是 null，大類是「總指數」）；item_order 是官方檔案裡的順序。總指數和七大類的數字同 v_monthly_cpis。那一項當月指數和年增率都沒有值時沒有列。由 monthly-cpi 那支匯入一起寫。';
COMMENT ON COLUMN "export"."v_monthly_cpi_items"."index_value" IS '指數，基期見主計總處檔案標註（目前民國 110 年 = 100），換基期時整段一起變';
COMMENT ON COLUMN "export"."v_monthly_cpi_items"."yoy_change_pct" IS '年增率，%（1 = 1%）';
COMMENT ON COLUMN "export"."v_monthly_cpi_items"."item_order" IS '官方檔案裡的順序，從 1 起（排序用，不是數量）';

CREATE VIEW "export"."v_monthly_monetary_aggregate_components" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "amount_million_ntd",
  "yoy_change_percent" AS "yoy_change_pct",
  "updated_at"
FROM "public"."monthly_monetary_aggregate_component";

COMMENT ON VIEW "export"."v_monthly_monetary_aggregate_components" IS
  '央行貨幣總計數（金融統計月報 EF15M01，日平均，1987-05 起每月）全部 15 項的長表，一個（月, category）一列。category：currency_held_by_public（貨幣機構以外各部門持有通貨）；存款貨幣 deposit_money_total、checking_deposits、passbook_deposits、passbook_savings_deposits；準貨幣 quasi_money_total、time_and_savings_deposits、foreign_currency_deposits、postal_savings_deposits、non_resident_ntd_deposits、repurchase_agreements、money_market_funds；m1a、m1b、m2（同 v_monthly_monetary_aggregates）。M1A＝通貨＋支票存款＋活期存款，M1B＝M1A＋活期儲蓄存款，M2＝M1B＋準貨幣。由 monthly-monetary-aggregate 那支匯入一起寫。';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregate_components"."amount_million_ntd" IS '新台幣百萬元，日平均';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregate_components"."yoy_change_pct" IS '年增率，%（1 = 1%）';

-- 3. 貨幣總計數金額欄的新名（單位寫進欄名），跟舊欄並存
CREATE OR REPLACE VIEW "export"."v_monthly_monetary_aggregates" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "m1a_amount",
  "m1a_yoy_percent" AS "m1a_yoy_pct",
  "m1b_amount",
  "m1b_yoy_percent" AS "m1b_yoy_pct",
  "m2_amount",
  "m2_yoy_percent" AS "m2_yoy_pct",
  "updated_at",
  "m1a_amount" AS "m1a_amount_million_ntd",
  "m1b_amount" AS "m1b_amount_million_ntd",
  "m2_amount" AS "m2_amount_million_ntd"
FROM "public"."monthly_monetary_aggregate";

COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1a_amount_million_ntd" IS '新台幣百萬元，日平均（同 m1a_amount，數據中台換讀後刪舊欄）';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m1b_amount_million_ntd" IS '新台幣百萬元，日平均（同 m1b_amount，數據中台換讀後刪舊欄）';
COMMENT ON COLUMN "export"."v_monthly_monetary_aggregates"."m2_amount_million_ntd" IS '新台幣百萬元，日平均（同 m2_amount，數據中台換讀後刪舊欄）';

-- 4. GDP 依支出分（prisma migrate diff 產生，加上 schema 前綴）
CREATE TABLE "public"."quarterly_gdp_expenditure" (
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "nominal_amount_million_ntd" DECIMAL(14,0),
    "nominal_yoy_percent" DECIMAL(8,2),
    "real_amount_million_ntd" DECIMAL(14,0),
    "real_yoy_percent" DECIMAL(8,2),
    "deflator_index" DECIMAL(10,2),
    "deflator_yoy_percent" DECIMAL(8,2),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarterly_gdp_expenditure_pkey" PRIMARY KEY ("year","quarter","category")
);

CREATE VIEW "export"."v_quarterly_gdp_expenditures" AS
SELECT
  "year",
  "quarter",
  "category",
  "nominal_amount_million_ntd",
  "nominal_yoy_percent" AS "nominal_yoy_pct",
  "real_amount_million_ntd",
  "real_yoy_percent" AS "real_yoy_pct",
  "deflator_index",
  "deflator_yoy_percent" AS "deflator_yoy_pct",
  "updated_at"
FROM "public"."quarterly_gdp_expenditure";

COMMENT ON VIEW "export"."v_quarterly_gdp_expenditures" IS
  '主計總處國內生產毛額及平減指數依支出分（季，1981Q1 起，na8102a6q.xml）17 個項目，一季一個 category 一列。category：private_consumption 民間消費、government_consumption 政府消費、capital_formation_total 資本形成、fixed_capital_formation_total 固定資本形成、inventory_change 存貨變動、exports 商品及服務輸出（exports_goods 商品運輸與保險、exports_other 其他）、imports 商品及服務輸入（imports_goods、imports_other）、domestic_demand_total 國內需求、net_external_demand_total 國外淨需求、gdp、net_factor_income_from_abroad 國外要素所得淨額、terms_of_trade_gains_losses 對外貿易條件變動損益、gni。各項目的實質成長率是 real_yoy_pct。來源沒有值的存 null（例如存貨變動、國外淨需求沒有年增率和平減指數）。跟 v_quarterly_gdps（對經濟成長的貢獻度）是不同檔。由 quarterly-gdp-expenditure 匯入寫。';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."nominal_amount_million_ntd" IS '當期價格，新台幣百萬元';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."nominal_yoy_pct" IS '當期價格的年增率，%（1 = 1%）';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."real_amount_million_ntd" IS '連鎖實質值，新台幣百萬元；參考年見主計總處檔案標註（目前 2021），換參考年時整段一起變';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."real_yoy_pct" IS '實質成長率（連鎖實質值的年增率），%（1 = 1%）';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."deflator_index" IS '平減指數，目前 2021 = 100';
COMMENT ON COLUMN "export"."v_quarterly_gdp_expenditures"."deflator_yoy_pct" IS '平減指數的年增率，%（1 = 1%）';

COMMIT;
