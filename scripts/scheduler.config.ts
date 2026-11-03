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
 * 原本的節奏是「對齊各來源的發布日」（CBC 月報 5 日、CPI 10 日、失業率 23 日、景氣燈號 28 日、
 * GDP 2/5/8/11 月 20 日）。**2026-10-30 使用者核准全部改成每天跑**，跟 twse-ts/sitca-ts 一樣「每天打、
 * 靠 no-op upsert 吸收」。原因是一個月只抓一次的話，發布晚了或那次抓失敗，就整整晚一個月：
 * data-rust 加資料新鮮度監看時發現，CPI 10/10 那次抓主計總處回 502、3 次重試都失敗，九月 CPI 要等到
 * 11/10；景氣指標 10/28 03:22 回 200，但國發會的開放資料檔當時還沒換，九月要等到 11/28。
 * 這 11 支都是秒級的小檔案，每天打沒有負擔。只有勞動部兩份（年更的現況快照）跟 322MB 的稅籍檔
 * 維持每月。名稱也從 -monthly/-quarterly 改成 -daily：reconcile 不會刪 job，舊名要手動
 * `gcloud scheduler jobs delete`。
 * - fund-daily-nav 每天 22:00：SITCA 的 nav.csv 是 T 日晚間陸續發布，22:00 抓到的是 T 日部分
 *   （實測 2026-09-21 當天 467 檔）；檔案本身是 2 個交易日的滾動窗口，隔天 22:00 那次會把 T 日補齊
 *   （09-18 最後是 4445 檔），所以不用另外排隔天早上的補抓。
 * - 一支 long-running（labor-broker-tax-registration，每月 3 日）attemptDeadline 設到 Cloud Scheduler
 *   上限 30 分鐘：它要串流掃完財政部那份 322MB 稅籍檔（實測數分鐘），預設 180s 會讓 Scheduler 在
 *   job 還在跑時判定失敗並重試，造成重疊執行。其他 job 都在 10 秒內完成，維持預設 180s。
 *   （2026-10-07 之前還有兩支——company-profile-refresh-tracked-weekly 與
 *   company-industry-classification-monthly——隨公司產業分類整組移除。）
 *
 * 新增的 cbc-policy-rate-daily 刻意每天跑而不是跟公債殖利率一樣每月 5 日：這份是「利率調整事件」
 * 序列（每列一次理監事會決議的生效日），用途是疊在股價上看事件，理監事會在 3/6/9/12 月中下旬
 * 開會，月初才抓會晚兩週以上；請求本身是秒級的 JSON，每天打沒有成本。

 */
export interface SchedulerJobConfig {
  name: string;
  path: string;
  schedule: string;
  attemptDeadline?: string; // 不填用 defaults.attemptDeadline
}

export const schedulerConfig = {
  // 一定要明確指定 project：多個 oingg session 共用同一份 gcloud 設定，active project 會被別的
  // session 切走（2026-09-29 實測被切到 oingg-bff，這支腳本當場失敗）。沒有這一行的話腳本會跟著
  // 環境跑，最壞情況是把 job 建到別人的專案裡。
  project: 'oingg-gov',
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
    // 月報》在每月 25 日前後一起更新上個月的資料；匯率雖是日資料但也是這個節奏批次補上（見
    // dailyUsdTwdRate/route.ts）。每天打，月報哪天出來隔天清晨就進來（2026-10-30 起，理由見檔頭）。
    { name: 'gov-bond-yield-10y-daily', path: '/api/ingest/gov-bond-yield-10y', schedule: '2 3 * * *' },
    { name: 'five-major-bank-rate-daily', path: '/api/ingest/five-major-bank-rate', schedule: '57 3 * * *' },
    { name: 'monthly-monetary-aggregate-daily', path: '/api/ingest/monthly-monetary-aggregate', schedule: '37 3 * * *' },
    { name: 'daily-usd-twd-rate-daily', path: '/api/ingest/daily-usd-twd-rate', schedule: '42 3 * * *' },
    { name: 'monthly-stock-market-summary-daily', path: '/api/ingest/monthly-stock-market-summary', schedule: '52 3 * * *' },
    { name: 'cbc-policy-rate-daily', path: '/api/ingest/cbc-policy-rate', schedule: '2 5 * * *' },
    // 美國政策利率跟 cbc-policy-rate 一樣每天跑：FOMC 一年只開 8 次，但決議當天就該反映，
    // 而三個 CSV 都很小。05:12 是空檔（05:02 是 cbc-policy-rate、05:32 只有每月 3 日的稅籍檔）。
    { name: 'us-policy-rate-daily', path: '/api/ingest/us-policy-rate', schedule: '12 5 * * *' },
    // 歐洲央行，同樣每天跑：ECB 管理委員會一年約 8 次貨幣政策會議，決議當天（台北時間晚上）
    // 公布，隔天早上 05:22 抓到。四支序列都是小檔案。05:22 是空檔（05:02 央行、05:12 美國、
    // 05:32 只有每月 3 日的稅籍檔）。
    { name: 'ecb-policy-rate-daily', path: '/api/ingest/ecb-policy-rate', schedule: '22 5 * * *' },
    // FRED（美國聯準會）——BEA 每月底發布/修正 GDP，FRED 當天更新；這支每次整批重建
    // （見 quarterlyUsGnpDeflator/service.ts），所以修正值自然進來。
    { name: 'quarterly-us-gnp-deflator-daily', path: '/api/ingest/quarterly-us-gnp-deflator', schedule: '47 3 * * *' },
    // 主計總處固定路徑 XML（ws.dgbas.gov.tw）
    { name: 'monthly-cpi-daily', path: '/api/ingest/monthly-cpi', schedule: '7 3 * * *' },
    { name: 'monthly-unemployment-rate-daily', path: '/api/ingest/monthly-unemployment-rate', schedule: '12 3 * * *' },
    { name: 'quarterly-gdp-daily', path: '/api/ingest/quarterly-gdp', schedule: '17 3 * * *' },
    // 國發會景氣指標 ZIP（ws.ndc.gov.tw），官方每月 27 日發布新聞稿，但開放資料檔會晚一點才換
    // （2026-10-28 03:22 抓到的還是舊檔）。
    { name: 'monthly-business-cycle-indicator-daily', path: '/api/ingest/monthly-business-cycle-indicator', schedule: '22 3 * * *' },
    // 歷次景氣循環峰谷日期：不定期更新（國發會認定轉折點才補），十幾列。
    { name: 'business-cycle-reference-date-daily', path: '/api/ingest/business-cycle-reference-date', schedule: '33 3 * * *' },
    // 投信投顧公會 CSV（www.sitca.org.tw）
    { name: 'fund-basic-info-weekly', path: '/api/ingest/fund-basic-info', schedule: '27 3 * * 2' },
    { name: 'fund-daily-nav-daily', path: '/api/ingest/fund-daily-nav', schedule: '2 22 * * *' },
    // 勞動部開放資料（apiservice.mol.gov.tw）——官方標示年更，但兩份都是「現況快照」（許可證會展延/
    // 停業/廢止，評鑑會補上新年度），每月跑一次確保狀態新鮮，成本只有兩個幾百 KB 的 CSV。
    { name: 'labor-broker-license-monthly', path: '/api/ingest/labor-broker-license', schedule: '2 6 5 * *' },
    { name: 'labor-broker-evaluation-monthly', path: '/api/ingest/labor-broker-evaluation', schedule: '7 6 5 * *' },
    // 唯一的 long-running job，理由見檔頭
    // 要串流掃完整份 322MB 稅籍檔（實測數分鐘）。2026-10-07 之前 04:02 還有一支
    // company-industry-classification 掃同一份檔案，這支刻意排在它後面一小時避免同時下載；
    // 那支已移除，這個時間保留不動（沒有理由改，改了還要重新確認撞分鐘）。
    {
      name: 'labor-broker-tax-registration-monthly',
      path: '/api/ingest/labor-broker-tax-registration',
      // 05:32 不是 05:02——每天 05:02 有 cbc-policy-rate-daily，每月 3 號會撞在同一分鐘
      schedule: '32 5 3 * *',
      attemptDeadline: '1800s',
    },
  ] satisfies SchedulerJobConfig[],
};
