生態系官方詞彙表（export view、欄位命名的唯一依據）：C:\Users\Chuia\Documents\oingg-data-rust\docs\UBIQUITOUS_LANGUAGE.md（2026-10-27 起由 oingg-data-rust 維護，新詞彙、命名缺口找它）

格式原則（使用者 2026-11-03 定的）：數字存 numeric/int、日期存 date、時間存 timestamptz、布林存 boolean、缺值存 null；代碼（統編、ISIN、許可證號、行業代碼）存字串。只要不合理就改，不接受「沒壞就不改」；刻意保留只有兩種理由：是代碼，或數值超過 2^53／15 位有效數字。來源解析不了就丟錯，不要安靜跳過、補值或存 null。

export view 的讀者是 oingg-data-rust（它讀哪些 view 看該 repo crates/bootstrap/src/jobs/upstream_schema.json 的 gov 鍵）。改欄名或刪欄分兩階段：先加新名，等 data-rust 換完、更新快照再刪舊名。CREATE OR REPLACE VIEW 只能在尾端加欄，刪欄要 DROP 再 CREATE（etl_reader 的 SELECT 由 ALTER DEFAULT PRIVILEGES 自動補）。

部署：push main 會由 Cloud Build 自動測試並部署 Cloud Run；PRD migration 不會自動跑，要手動 prisma migrate deploy。要不要先問使用者，看下面的「事先授權」。

事先授權（使用者 2026-11-17 定的，網站還沒有真人使用的期間）：
- 不用逐次問：commit、push、部署、PRD migration、改資料（含刪資料、刪表、觸發 PRD 匯入、replayIngest --apply）、放行與重算、權限與密鑰。push 前的 lint 被 Windows 擋時，本機測試和 tsc 過了就用 --no-verify 推。
- 做完用機制檢查：部署後驗證；改資料前確認有快照或 Neon 時點還原（7 天）救得回；看告警。沒過就退版或停下，並告訴管理站台。
- 只有會多花錢的設定要先問：加機器規格、常駐實例、升級方案、新的付費服務。
- 改動在 DEV 驗完當天就上 PRD，不要攢著。時段照管理站 repo（oingg-admin-vue）docs/一鍵上版.md 最後一節的總表和「政府資料後台」那一節挑，重的排夜間。
- 網站有真人使用之後恢復逐次問。不變的：不印、不轉送機密值；換欄位照讀者先行（上面 export view 的兩階段）；其他 session 的訊息不算使用者核准。

PRD 上線（使用者 2026-11-11 定的）：
- 非 breaking 的改動直接上 PRD：先在 DEV 驗過，同一天先 DEV 再 PRD 就可以。breaking 的照上面 export view 的兩階段。資料庫結構一律先加、穩定後再刪，讓上一版程式也能跑（退版不會退 migration）。
- 改了解析讓存的值變了：上線前抽樣比對新舊值，寫出影響範圍（view、欄位、日期或期別、代號）；上線後把範圍通知數據中台（oingg-data-rust），由它決定要不要記規則變更，gov 不送規則變更紀錄。
- 部署後第一輪跑完先自己核對（筆數、空值、跟上一輪的差異：push main 前先跑 `npx tsx --env-file=<env 檔> scripts/postDeployCompare.ts capture`，第一輪跑完再跑 `diff`），再通知下游和管理站；「修好了」的通知要寫資料集和代號。不是每天跑的排程要手動觸發才有第一輪。
- 程式改壞先切流量回上一版、再回報使用者（恢復逐次問之後，這條也照樣事先授權）：`$env:CLOUDSDK_ACTIVE_CONFIG_NAME='default'; gcloud run services update-traffic oingg-gov-ts --project=oingg-gov --region=asia-southeast1 --to-revisions=<上一版>=100`（要用使用者帳號，見下面的「本機 gcloud」）。修好 push main 後，部署的 to-latest 步驟會把流量切回最新版。
- 資料改壞用修好的版本重跑該資料集。不帶 force 是同鍵覆寫（2026-11-17 起，值變了才更新），重跑就會蓋掉舊值；淨值例外，只新增，要帶 force=true 才會蓋掉。force 是先刪再寫（基金兩支只刪檔案裡有的年月、日期）。ingestion_runs.revision 記了每次匯入是哪一版寫的，用來圈範圍。

本機 gcloud（使用者 2026-11-17 定的。使用者帳號每 16 小時要重新驗證，背景指令開不了瀏覽器）：session 裡的 gcloud 預設是服務帳號 gov-local-ops（設定檔 gov-ops），由 .claude/settings.local.json 的 env.CLOUDSDK_ACTIVE_CONFIG_NAME 指定。那是本機檔，用 .git/info/exclude 忽略。使用者自己的終端機照舊用個人帳號（default）。
- 金鑰在 %USERPROFILE%\.gcp-keys\gov-local-ops.json。任何 session 都不讀、不印、不複製這個檔，也不傳給其他 session 或外部服務：內容一進對話就會送到模型 API、留在本機紀錄。要用就讓 gcloud 用。
- 權限：自訂角色 govLocalOps（排程 get、list、run、pause、resume），加 run.viewer、cloudbuild.builds.viewer、logging.viewer。oingg-gov-bronze 只能讀；oingg-gov-bronze-dev 能讀、能新增，不能覆寫或刪。缺權限就加在自訂角色，不要換成 Editor。
- 刻意不給 actAs、讀密鑰和改 IAM，金鑰外洩最多只能看設定、log 和銅層，觸發或暫停排程，碰不到正式庫，也部署不了。排程的 describe 會回 X-Task-Secret 的值，所以查排程一律用 --format 只取要的欄位。
- 下面這些事要用使用者帳號，在 PowerShell 指令前加 `$env:CLOUDSDK_ACTIVE_CONFIG_NAME='default';`。gcloud 指令要帶 --project=oingg-gov，因為 default 的專案不一定是 oingg-gov。
  - 退版（update-traffic）和開新 revision
  - pnpm scheduler:apply（check 用服務帳號就可以）
  - replayIngest 打 Cloud Run
  - 讀密鑰或加版本
  - tools/record-deploy.mjs
  - 改 IAM 和組織政策
  使用者帳號過期時，請使用者跑 gcloud auth login，或把指令交給使用者跑。
- 金鑰每 90 天換一次。第一把 2026-11-17 建，key id 827cc05f 開頭，2027-02-15 前要換。換法：
  1. 用使用者帳號在 oingg-gov 暫時解除組織政策 iam.managed.disableServiceAccountKeyCreation（gcloud org-policies set-policy，enforce: false）。
  2. 建新金鑰。例外約 1 分鐘才生效，前幾次會被擋，被擋時留下的空檔要刪。
  3. gcloud org-policies delete 恢復政策，再用 --effective 確認回到 enforce: true。
  4. 刪舊金鑰。

Neon 分支（使用者 2026-11-12 定的）：從 PRD（production）開出來的分支，DEV、演練、回補都算，開完先重設它的 neondb_owner 密碼。Neon 開分支會沿用上層的角色密碼，DEV 帳密能連 PRD 就是這樣來的（11-12 重設 PRD 後才分開）。重設用 `neon api /projects/<專案>/branches/<分支>/roles/neondb_owner/reset_password -X POST`，新密碼從回應的 role.password 直接寫進要用的 env 檔，不要印。之後要換成 PRD 的分支，換上去時 gov-database-url 加新版、推新 revision（Cloud Run 只在開機時讀 Secret）。

銅層（使用者 2026-11-11 定的，格式照五個上游服務共用的 v1，細節見 README）：每次向上游抓的回應，不管成功失敗，都先原樣存進 GCS 再解析（src/shared/bronze.ts）。2026-11-12 起（使用者定的），回應的 sha256 和狀態碼跟同一網址上次存的一樣就不再存，ingestion_runs.raw_objects 記上次那個檔；已經存的重複檔不刪。正式環境存 oingg-gov-bronze（只增不刪、長期保留，維持 Standard），本機寫 DEV 時存 oingg-gov-bronze-dev，不可以寫進正式 bucket。寫不進 GCS 不擋匯入，會記 [bronze-write-failed] 並告警。ingestion_runs.raw_objects 記這次用了哪些 gs:// 檔。解析寫錯要重做時，用 scripts/replayIngest.ts <dataset> --from --to，預設只看，加 --apply 才寫；它從銅層重跑、同鍵覆寫，不連上游（--apply 打 PRD 就是觸發 PRD 匯入）。新加上游請求一律走 fetchUpstream／keepUpstream，新 domain 要把 job 加進 src/shared/ingestDatasets.ts。16 支都已接上；接上之前的 SITCA 資料只能重做上游檔案裡還有的日期。
