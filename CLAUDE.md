生態系官方詞彙表（export view、欄位命名的唯一依據）：C:\Users\Chuia\Documents\oingg-data-rust\UBIQUITOUS_LANGUAGE.md（2026-10-27 起由 oingg-data-rust 維護，新詞彙、命名缺口找它）

格式原則（使用者 2026-11-03 定的）：數字存 numeric/int、日期存 date、時間存 timestamptz、布林存 boolean、缺值存 null；代碼（統編、ISIN、許可證號、行業代碼）存字串。只要不合理就改，不接受「沒壞就不改」；刻意保留只有兩種理由：是代碼，或數值超過 2^53／15 位有效數字。來源解析不了就丟錯，不要安靜跳過、補值或存 null。

export view 的讀者是 oingg-data-rust（它讀哪些 view 看該 repo crates/bootstrap/src/jobs/upstream_schema.json 的 gov 鍵）。改欄名或刪欄分兩階段：先加新名，等 data-rust 換完、更新快照再刪舊名。CREATE OR REPLACE VIEW 只能在尾端加欄，刪欄要 DROP 再 CREATE（etl_reader 的 SELECT 由 ALTER DEFAULT PRIVILEGES 自動補）。

部署：push main 會由 Cloud Build 自動測試並部署 Cloud Run；PRD migration 不會自動跑，要手動 prisma migrate deploy，且每次都要使用者核准。
