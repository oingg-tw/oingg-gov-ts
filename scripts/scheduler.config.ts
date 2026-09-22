/**
 * Cloud Scheduler 的「意圖排程表」——照 `oingg-twse-ts` 的模式（`scripts/scheduler.config.ts` +
 * `scripts/reconcileScheduler.ts`），single source of truth，改排程直接改這裡，不要手動
 * `gcloud scheduler jobs update`。
 *
 * 2026-09-21 把這份 config 加進 repo 時，GCP 上已經有 9 個手動建的 job 跑了三週（2026-09-02 起，
 * 每次都 200，見 Cloud Logging）——這裡是把那 9 個既有的意圖原樣收編，不是重新設計：
 * 名稱、觸發日、SA 全部照舊，只做兩個改動：(1) 分鐘從全部 :00 改成每支錯開——tpex-ts 上線後的
 * 實戰回饋，同一個上游端點在整點被觸發的瞬間偶爾慢到逾時，整點是全世界 cron 的預設時間；而且原本
 * 9 支全擠在 03:00，週一/週二的兩支 weekly 跟各月更 job 一年會撞到幾次同一分鐘（例如週一剛好是
 * 3 日），錯開後 reconcileScheduler.ts 的撞分鐘檢查才會乾淨；(2) 新增 cbc-policy-rate-daily。
 *
 * 既有的節奏是「對齊各來源的發布日」而不是 twse-ts/sitca-ts 那種「每天打、靠 no-op upsert 吸收」：
 * - 月更統計（CBC 公債殖利率 5 日、主計總處 CPI 10 日 / 失業率 23 日、國發會景氣燈號 28 日）各自排在
 *   官方發布日之後幾天；GDP 季更排在 2/5/8/11 月 20 日（主計總處修正值發布後）。
 * - 這樣做的代價是發布日若延後超過排定日，會整整晚一個月/一季才抓到。目前三週沒踩到；如果之後
 *   發現某個來源常延遲，把那支改成每天跑即可（CBC/主計總處這幾個檔案都不大，每天打沒有負擔），
 *   不需要整套改。
 * - fund-daily-nav 每天 22:00：SITCA 的 nav.csv 是 T 日晚間陸續發布，22:00 抓到的是 T 日部分
 *   （實測 2026-09-21 當天 467 檔）；檔案本身是 2 個交易日的滾動窗口，隔天 22:00 那次會把 T 日補齊
 *   （09-18 最後是 4445 檔），所以不用另外排隔天早上的補抓。
 * - 三支 long-running（refresh-tracked 週一、industry-classification 及 labor-broker-tax-registration
 *   每月 3 日）attemptDeadline
 *   設到 Cloud Scheduler 上限 30 分鐘；refresh-tracked 實測 19 分鐘（Cloud Logging latency
 *   1139s），預設 3 分鐘會讓 Scheduler 在 job 還在跑時判定失敗並重試，造成重疊執行。其他 job
 *   都在 10 秒內完成，維持預設 180s。industry-classification 排到 04:02，跟 03:32 開始、跑 19 分鐘
 *   的 refresh-tracked 錯開半小時以上，週一剛好是 3 日時兩支不會同時佔著同一個 Cloud Run instance。
 *
 * 新增的 cbc-policy-rate-daily 刻意每天跑而不是跟公債殖利率一樣每月 5 日：這份是「利率調整事件」
 * 序列（每列一次理監事會決議的生效日），用途是疊在股價上看事件，理監事會在 3/6/9/12 月中下旬
 * 開會，月初才抓會晚兩週以上；請求本身是秒級的 JSON，每天打沒有成本。
 *
 * 刻意不排進這裡的：
 * - POST /api/ingest/company-profile：需要 body（證券代碼＋統編陣列），靜態 Cloud Scheduler job
 *   給不了，登記新公司是由外部（twse-ts/tpex-ts 的 company profile 流程）主動呼叫。
 */
export interface SchedulerJobConfig {
  name: string;
  path: string;
  schedule: string;
  attemptDeadline?: string; // 不填用 defaults.attemptDeadline
}

export const schedulerConfig = {
  region: 'asia-southeast1',
  serviceUrl: 'https://oingg-gov-ts-5i2shv7yca-as.a.run.app',
  serviceAccount: 'gov-scheduler-invoker@oingg-gov.iam.gserviceaccount.com',
  taskSecretName: 'gov-task-secret', // 跟 cloudbuild.yaml --set-secrets 用的同一個 Secret Manager secret
  defaults: {
    timeZone: 'Asia/Taipei',
    maxRetryAttempts: 3,
    minBackoff: '30s',
    maxBackoff: '120s',
    attemptDeadline: '180s',
  },
  jobs: [
    // 央行統計資料庫（cpx.cbc.gov.tw）——月報系列（公債殖利率、貨幣總計數、匯率）都是隨《金融統計
    // 月報》在每月 25 日前後一起更新上個月的資料，所以同樣排每月 5 日；匯率雖是日資料但也是這個節奏
    // 批次補上（見 dailyUsdTwdRate/route.ts），每天打只會拿到同一份。
    { name: 'gov-bond-yield-10y-monthly', path: '/api/ingest/gov-bond-yield-10y', schedule: '2 3 5 * *' },
    { name: 'monthly-monetary-aggregate-monthly', path: '/api/ingest/monthly-monetary-aggregate', schedule: '37 3 5 * *' },
    { name: 'daily-usd-twd-rate-monthly', path: '/api/ingest/daily-usd-twd-rate', schedule: '42 3 5 * *' },
    { name: 'monthly-stock-market-summary-monthly', path: '/api/ingest/monthly-stock-market-summary', schedule: '52 3 5 * *' },
    { name: 'cbc-policy-rate-daily', path: '/api/ingest/cbc-policy-rate', schedule: '2 5 * * *' },
    // FRED（美國聯準會）——BEA 每月底發布/修正 GDP，FRED 當天更新，每月 5 日抓一次；這支每次整批重建
    // （見 quarterlyUsGnpDeflator/service.ts），所以修正值自然進來。
    { name: 'quarterly-us-gnp-deflator-monthly', path: '/api/ingest/quarterly-us-gnp-deflator', schedule: '47 3 5 * *' },
    // 主計總處固定路徑 XML（ws.dgbas.gov.tw）
    { name: 'monthly-cpi-monthly', path: '/api/ingest/monthly-cpi', schedule: '7 3 10 * *' },
    { name: 'monthly-unemployment-rate-monthly', path: '/api/ingest/monthly-unemployment-rate', schedule: '12 3 23 * *' },
    { name: 'quarterly-gdp-quarterly', path: '/api/ingest/quarterly-gdp', schedule: '17 3 20 2,5,8,11 *' },
    // 國發會景氣指標 ZIP（ws.ndc.gov.tw），官方每月 27 日發布
    { name: 'monthly-business-cycle-indicator-monthly', path: '/api/ingest/monthly-business-cycle-indicator', schedule: '22 3 28 * *' },
    // 投信投顧公會 CSV（www.sitca.org.tw）
    { name: 'fund-basic-info-weekly', path: '/api/ingest/fund-basic-info', schedule: '27 3 * * 2' },
    { name: 'fund-daily-nav-daily', path: '/api/ingest/fund-daily-nav', schedule: '2 22 * * *' },
    // 勞動部開放資料（apiservice.mol.gov.tw）——官方標示年更，但兩份都是「現況快照」（許可證會展延/
    // 停業/廢止，評鑑會補上新年度），每月跑一次確保狀態新鮮，成本只有兩個幾百 KB 的 CSV。
    { name: 'labor-broker-license-monthly', path: '/api/ingest/labor-broker-license', schedule: '2 6 5 * *' },
    { name: 'labor-broker-evaluation-monthly', path: '/api/ingest/labor-broker-evaluation', schedule: '7 6 5 * *' },
    // 三支 long-running job，理由見檔頭
    {
      name: 'company-profile-refresh-tracked-weekly',
      path: '/api/ingest/company-profile/refresh-tracked',
      schedule: '32 3 * * 1',
      attemptDeadline: '1800s',
    },
    {
      name: 'company-industry-classification-monthly',
      path: '/api/ingest/company-industry-classification',
      schedule: '2 4 3 * *',
      attemptDeadline: '1800s',
    },
    // 跟 company-industry-classification 一樣要掃完整份 322MB 稅籍檔（實測數分鐘），排在它後面一小時
    // 避免兩支同時佔著同一個 Cloud Run instance 下載同一份大檔。
    {
      name: 'labor-broker-tax-registration-monthly',
      path: '/api/ingest/labor-broker-tax-registration',
      // 05:32 不是 05:02——每天 05:02 有 cbc-policy-rate-daily，每月 3 號會撞在同一分鐘
      schedule: '32 5 3 * *',
      attemptDeadline: '1800s',
    },
  ] satisfies SchedulerJobConfig[],
};
