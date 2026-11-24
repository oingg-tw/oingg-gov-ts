-- 兩件事，都只加不改（數據中台 2026-11-24 開總經端點時問的）：
--   1. CPI 細項加穩定的英文代碼 item_code：網站拿細項當鍵，主計總處改基期時可能改名或跳號。官方檔案只有層級編號
--      （一.、1.、(1)），是位置編號、增刪細項就跳號，所以代碼由 gov 定，對照表在 src/domains/monthlyCpi/parser.ts 的
--      CPI_SUB_ITEM_CODES（總指數和七大類同 category，73 個細項是英文 snake_case）。名稱對不到代碼就丟錯，改名時由 gov
--      決定沿用哪個代碼。先加可為 null 的欄，上一版程式寫入時不帶這欄也不會失敗；部署後重跑 monthly-cpi，由同鍵覆寫
--      補齊全部列，穩定後再設 NOT NULL。view 用 CREATE OR REPLACE 在尾端加欄，原有的 COMMENT 會保留，view 的說明改寫。
--   2. v_monthly_unemployment_rates 原本沒有 COMMENT，補上：來源沒有季節調整（來源沒標，從數字看每年 7、8 月固定偏高），
--      數字欄寫單位。只加註解，欄位不變。
BEGIN;
SET LOCAL lock_timeout = '3s';

-- 1. CPI 細項代碼
ALTER TABLE "public"."monthly_cpi_item" ADD COLUMN "item_code" TEXT;

CREATE OR REPLACE VIEW "export"."v_monthly_cpi_items" AS
SELECT
  make_date("year", "month", 1) AS "year_month",
  "category",
  "item_name",
  "parent_item_name",
  "item_order",
  "index_value",
  "yoy_change_percent" AS "yoy_change_pct",
  "updated_at",
  "item_code"
FROM "public"."monthly_cpi_item";

COMMENT ON VIEW "export"."v_monthly_cpi_items" IS
  '主計總處消費者物價基本分類指數（1981-01 起每月）全部 81 項：總指數、七大類、73 個細項，一個（月, item_name）一列。item_name 是官方名稱去掉編號和基期標註；item_code 是 gov 定的英文代碼，主計總處改名、改編號時不變，網站拿細項當鍵請用它（總指數和七大類同 category）；category 是所屬大類，代碼同 v_monthly_cpis.category（總指數是 total）；parent_item_name 是上一層（總指數是 null，大類是「總指數」）；item_order 是官方檔案裡的順序。總指數和七大類的數字同 v_monthly_cpis。那一項當月指數和年增率都沒有值時沒有列。由 monthly-cpi 那支匯入一起寫。';
COMMENT ON COLUMN "export"."v_monthly_cpi_items"."item_code" IS 'gov 定的英文代碼，主計總處改名、改編號時不變；總指數和七大類同 category';

-- 2. 失業率的說明
COMMENT ON VIEW "export"."v_monthly_unemployment_rates" IS
  '主計總處人力資源調查失業率（mp0101a07.xml，1978-01 起每月），按性別、年齡、教育程度分，一個（月, category）一列。未經季節調整：來源沒有標，從數字看每年 7、8 月畢業季固定偏高（2010～2025 平均總計約 +0.1 個百分點、20～24 歲約 +0.8），主計總處的開放資料沒有季調後的失業率。category：total、male、female；年齡 age_15_19～age_60_64、age_65_over；教育程度 edu_*，幾類彼此有包含關係（例如 edu_junior_high_and_below 含 edu_primary_school_and_below 和 edu_junior_high）。由 monthly-unemployment-rate 匯入寫。';
COMMENT ON COLUMN "export"."v_monthly_unemployment_rates"."rate_pct" IS '失業率，%（1 = 1%），未經季節調整';

COMMIT;
