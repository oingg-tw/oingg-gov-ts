import { Request, Response, NextFunction } from 'ultimate-express';

/**
 * 保護 ingest 端點不被過度觸發。
 *
 * 這裡要擋的不是「陌生人打進來」（那是 requireTaskSecret 的工作，必須掛在這個 middleware 之前），
 * 而是「就算密鑰外洩、或排程本身異常狂打，也不會讓這台服務跟著無限次去打 GCIS/CBC/財政部」——
 * 那才是真正會導致這些外部資料源把我們的伺服器 IP 鎖起來、或把 GCIS 節流額度用光的路徑。
 * company-industry-classification 那個端點還會下載 322MB 的檔案，重複觸發的成本更高。
 *
 * 用請求路徑當 key，讓每個 dataset 各自獨立限流，不會因為一個 dataset 在跑就卡住其他的。
 * 用記憶體實作就夠：這個服務單一 instance 執行、沒有跨 instance 共享狀態的需求，也不需要為了這個
 * 引入 Redis 之類的外部依賴。
 *
 * （跟 oingg-tpex-ts 的 ingestRateLimit 是同一套實作。）
 *
 * 2026-10-22 修正（us-policy-rate 10-21：FRED 暫時故障 502，Scheduler 30 秒後的第一次重試撞上
 * 自己的 60 秒冷卻變 429，白白浪費一次重試）；sitca/twse/tpex/business 互相 review 後的版本：
 * - 冷卻分兩種：成功後 60 秒；失敗後只有 FAILURE_COOLDOWN_MS。失敗的冷卻**必須短於
 *   scripts/scheduler.config.ts 的 minBackoff（30s）**，重試才過得去；但不能是 0，否則快速失敗的
 *   端點會被異常狂打、每次都真的去打上游（這層存在的理由，見上）。
 * - key 用 baseUrl + path，不含 query string：帶不同 query 不能繞過限流，網址裡有什麼也不會寫進
 *   下面的 log（requireTaskSecret 已改成只收 header，這裡仍不記 query 當作保險）。
 * - 失敗回應（>= 400）記一行結構化 log（Cloud Run 會把單行 JSON 的 severity 認成 ERROR；純文字
 *   的 stderr 實測沒有 severity）。包的是 res.send：res.json 內部也走 send，errorHandler 直接用
 *   send，兩條都抓得到。body 截斷到 2000 字。原本 502 的錯誤只在回應 body、Cloud Run 不記 body，
 *   失敗原因無處可查。
 * - 鎖在 handler 呼叫 send 時釋放（finish 當保險）。實測 ultimate-express 在客戶端中途斷線（例如
 *   Scheduler 的 attemptDeadline 到了）後，handler 寫完回應也**不會**發 finish 或 close，只聽 finish
 *   的話鎖會卡死到重啟。刻意不聽 close：那要假設框架不會在斷線當下、handler 還在跑時就發 close，
 *   否則會提早放鎖讓同一個 dataset 重複執行（analysis-ts review）。再加一個等於 Cloud Run 請求
 *   逾時的上限，防 handler 永遠不回應。
 *   客戶端斷線**不會**提早釋放：伺服器那次還在跑，這時回 429 擋掉重複執行是對的。
 */
const IN_FLIGHT_PATHS = new Set<string>();
const BLOCKED_UNTIL = new Map<string, number>();
const SUCCESS_COOLDOWN_MS = 60_000;
export const FAILURE_COOLDOWN_MS = 10_000; // 必須 < Scheduler minBackoff（30s），見上；有測試比對
const MAX_IN_FLIGHT_MS = 3_600_000; // = Cloud Run --timeout=3600（cloudbuild.yaml）

export const ingestRateLimit = (req: Request, res: Response, next: NextFunction) => {
  const key = req.baseUrl + req.path;

  if (IN_FLIGHT_PATHS.has(key)) {
    return res.status(429).json({ message: 'This dataset ingestion is already in progress. Please wait for it to finish.' });
  }

  const blockedUntil = BLOCKED_UNTIL.get(key);
  if (blockedUntil !== undefined && Date.now() < blockedUntil) {
    const waitSeconds = Math.ceil((blockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', String(waitSeconds));
    return res.status(429).json({ message: `Too many requests. Please wait ${waitSeconds}s before triggering this dataset again.` });
  }

  IN_FLIGHT_PATHS.add(key);
  let body: unknown;
  const send = res.send.bind(res);
  res.send = (payload: unknown) => {
    body = payload;
    const result = send(payload);
    release(); // handler 寫回應 = 這次 ingest 結束；客戶端已斷線時框架不會再發 finish/close
    return result;
  };

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(timer);
    IN_FLIGHT_PATHS.delete(key);
    const failed = res.statusCode >= 400;
    BLOCKED_UNTIL.set(key, Date.now() + (failed ? FAILURE_COOLDOWN_MS : SUCCESS_COOLDOWN_MS));
    if (failed) {
      const text = typeof body === 'string' ? body : JSON.stringify(body);
      console.error(JSON.stringify({ severity: 'ERROR', message: `ingest ${key} failed with HTTP ${res.statusCode}`, path: key, status: res.statusCode, body: text?.slice(0, 2000) }));
    }
  };
  const timer = setTimeout(release, MAX_IN_FLIGHT_MS);
  timer.unref();
  res.on('finish', release);

  next();
};
