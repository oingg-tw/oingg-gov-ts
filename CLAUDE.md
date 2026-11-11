生態系官方詞彙表（export view、欄位命名的唯一依據）：C:\Users\Chuia\Documents\oingg-data-rust\UBIQUITOUS_LANGUAGE.md（2026-10-27 起由 oingg-data-rust 維護，新詞彙、命名缺口找它）

格式原則（使用者 2026-11-03 定的）：數字存 numeric/int、日期存 date、時間存 timestamptz、布林存 boolean、缺值存 null；代碼（統編、ISIN、許可證號、行業代碼）存字串。只要不合理就改，不接受「沒壞就不改」；刻意保留只有兩種理由：是代碼，或數值超過 2^53／15 位有效數字。來源解析不了就丟錯，不要安靜跳過、補值或存 null。

export view 的讀者是 oingg-data-rust（它讀哪些 view 看該 repo crates/bootstrap/src/jobs/upstream_schema.json 的 gov 鍵）。改欄名或刪欄分兩階段：先加新名，等 data-rust 換完、更新快照再刪舊名。CREATE OR REPLACE VIEW 只能在尾端加欄，刪欄要 DROP 再 CREATE（etl_reader 的 SELECT 由 ALTER DEFAULT PRIVILEGES 自動補）。

部署：push main 會由 Cloud Build 自動測試並部署 Cloud Run；PRD migration 不會自動跑，要手動 prisma migrate deploy，且每次都要使用者核准。

PRD 上線（使用者 2026-11-11 定的）：
- 非 breaking 的改動直接上 PRD：先在 DEV 驗過，同一天先 DEV 再 PRD 就可以。breaking 的照上面 export view 的兩階段。資料庫結構一律先加、穩定後再刪，讓上一版程式也能跑（退版不會退 migration）。
- 改了解析讓存的值變了：上線前抽樣比對新舊值，寫出影響範圍（view、欄位、日期或期別、代號）；上線後把範圍通知數據中台（oingg-data-rust），由它決定要不要記規則變更，gov 不送規則變更紀錄。
- 部署後第一輪跑完先自己核對（筆數、空值、跟上一輪的差異），再通知下游和管理站；「修好了」的通知要寫資料集和代號。不是每天跑的排程要手動觸發才有第一輪，觸發 PRD 匯入要問使用者。
- 程式改壞可以先切流量回上一版、再回報使用者（使用者事先授權，只限切流量）：gcloud run services update-traffic oingg-gov-ts --region=asia-southeast1 --to-revisions=<上一版>=100。寫資料、觸發匯入、migration 照舊每次問。修好 push main 後，部署的 to-latest 步驟會把流量切回最新版。
- 資料改壞用修好的版本重跑該資料集。平常只新增的來源要帶 force=true 才會蓋掉舊值；SITCA 兩支只能重做上游檔案裡還有的日期。ingestion_runs.revision 記了每次匯入是哪一版寫的，用來圈範圍。
