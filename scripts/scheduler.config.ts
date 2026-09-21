/**
 * Cloud Scheduler 的「意圖排程表」——照 `oingg-twse-ts` 的模式（`scripts/scheduler.config.ts` +
 * `scripts/reconcileScheduler.ts`），single source of truth，改排程直接改這裡，不要手動
 * `gcloud scheduler jobs update`。
 *
 * gov-ts 的資料來源全部是月更/季更/不定期的官方開放資料（CBC 統計、主計總處、國發會、SITCA），
 * 沒有盤中分鐘級變動，每天固定打一次就夠——重抓沒變動的資料只是 no-op upsert（各 domain 都用
 * createMany skipDuplicates），成本可忽略，不另外做「來源有沒有更新」的偵測（同樣的推理見
 * twse-ts README「排程集中管理」跟 sitca-ts 的 scheduler.config.ts）。
 *
 * 時段選 05:02-05:37：sitca-ts 的排程佔 06:00-06:45、twse-ts 佔 07:00 起，gov-ts 跟 sitca-ts 都會
 * 打 www.sitca.org.tw，錯開整個小時是為了不在同一分鐘對同一個來源發兩批請求。不從整點 05:00
 * 開始、每支都偏 2 分鐘，是 tpex-ts 上線後的實戰回饋（2026-09-21）：同一個上游端點在整點被排程
 * 觸發的瞬間偶爾會明顯變慢到逾時——整點是全世界 cron 的預設時間，避開它成本是零。SITCA 的 nav.csv
 * 是 T 日晚間發布（2026-09-11 實測 13:13 抓到的最新一天還是前一天），隔天清晨抓 T 日資料沒問題，
 * 而且檔案本身是 2 個交易日的滾動窗口，漏一天也補得回來。
 *
 * 每週一次的兩支（週日凌晨）：
 * - company-profile/refresh-tracked：對 company_profiles 目前 1000+ 家逐一向 GCIS 重抓營業項目，
 *   受 GCIS client 節流（每家 ≥1 秒）約 15-20 分鐘。公司登記的營業項目很少變動，每天打 GCIS
 *   一千多次沒有意義，每週刷新一次已經足夠。
 * - company-industry-classification：下載財政部 322MB 稅籍登記檔串流比對。行業分類代碼同樣很少變，
 *   比照每週一次；排在 refresh-tracked 一小時後，確保前一支跑完再開始（兩支都是 long-running，
 *   同時跑會讓同一個 Cloud Run instance 撐兩個長請求）。
 *
 * 刻意不排進這裡的：
 * - POST /api/ingest/company-profile：需要 body（證券代碼＋統編陣列），靜態 Cloud Scheduler job
 *   給不了，登記新公司是由外部（twse-ts/tpex-ts 的 company profile 流程）主動呼叫。
 *
 * attemptDeadline 設到 Cloud Scheduler 的上限 30 分鐘（預設只有 3 分鐘）——refresh-tracked 跟
 * company-industry-classification 都遠超 3 分鐘，不設的話 Scheduler 會在 job 還在跑的時候判定
 * 失敗並重試，造成同一支 long-running job 重疊執行。Cloud Run 那邊的 --timeout 已經是 3600 秒
 * （見 cloudbuild.yaml），不是瓶頸。
 */
export interface SchedulerJobConfig {
  name: string;
  path: string;
  schedule: string;
}

export const schedulerConfig = {
  region: 'asia-southeast1',
  // 兩個值都要跟 GCP 上實際的資源對得上——reconcileScheduler.ts 執行前會先驗證不是 placeholder。
  // serviceUrl：`gcloud run services describe oingg-gov-ts --region=asia-southeast1 --format='value(status.url)'`
  // serviceAccount：專用的 scheduler invoker SA（只有 roles/run.invoker 在這個 service 上），
  //   不用 compute default SA，見 sitca-ts 2026-09-17 部署時整理的最小權限做法。
  serviceUrl: 'TODO_SERVICE_URL',
  serviceAccount: 'TODO_SERVICE_ACCOUNT',
  taskSecretName: 'gov-task-secret', // 跟 cloudbuild.yaml --set-secrets 用的同一個 Secret Manager secret
  defaults: {
    timeZone: 'Asia/Taipei',
    maxRetryAttempts: 3,
    minBackoff: '30s',
    maxBackoff: '120s',
    attemptDeadline: '1800s',
  },
  jobs: [
    // 央行統計資料庫（cpx.cbc.gov.tw）——兩個都是單次請求回傳整段歷史，秒級完成
    { name: 'gov-bond-yield-10y-daily', path: '/api/ingest/gov-bond-yield-10y', schedule: '2 5 * * *' },
    { name: 'cbc-policy-rate-daily', path: '/api/ingest/cbc-policy-rate', schedule: '7 5 * * *' },
    // 主計總處固定路徑 XML（ws.dgbas.gov.tw）——CPI 檔約 13MB，三支錯開
    { name: 'monthly-cpi-daily', path: '/api/ingest/monthly-cpi', schedule: '12 5 * * *' },
    { name: 'monthly-unemployment-rate-daily', path: '/api/ingest/monthly-unemployment-rate', schedule: '17 5 * * *' },
    { name: 'quarterly-gdp-daily', path: '/api/ingest/quarterly-gdp', schedule: '22 5 * * *' },
    // 國發會景氣指標 ZIP（ws.ndc.gov.tw）
    { name: 'monthly-business-cycle-indicator-daily', path: '/api/ingest/monthly-business-cycle-indicator', schedule: '27 5 * * *' },
    // 投信投顧公會 CSV（www.sitca.org.tw）
    { name: 'fund-basic-info-daily', path: '/api/ingest/fund-basic-info', schedule: '32 5 * * *' },
    { name: 'fund-daily-nav-daily', path: '/api/ingest/fund-daily-nav', schedule: '37 5 * * *' },
    // 每週日凌晨的兩支 long-running job，理由見檔頭；同樣避開整點
    { name: 'company-profile-refresh-tracked-weekly', path: '/api/ingest/company-profile/refresh-tracked', schedule: '2 3 * * 0' },
    { name: 'company-industry-classification-weekly', path: '/api/ingest/company-industry-classification', schedule: '2 4 * * 0' },
  ] satisfies SchedulerJobConfig[],
};
