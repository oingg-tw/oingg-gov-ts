/**
 * dotenv 會自動去掉 .env 檔案裡值兩側的引號（例如 TASK_SECRET="xxx"），但 `docker run --env-file`
 * 跟 Cloud Run 的環境變數設定都不會——直接把 .env 內容複製貼過去，引號會被當成值的一部分存進去，
 * 導致 secret 比對永遠失敗。這裡在讀取當下防禦性去掉一層對稱的引號，不管值實際上是從 dotenv
 * （已經去過引號）還是從外部注入（可能還帶著引號）來的都能正常運作。
 * （跟 oingg-twse-ts 的 src/shared/config.ts 做法一致，是這個生態系裡目前唯一完整驗證過的參考實作。）
 */
export function stripQuotes(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  const isDoubleQuoted = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"');
  const isSingleQuoted = trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'");
  return isDoubleQuoted || isSingleQuoted ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Application configuration.
 * It's recommended to read these values from environment variables.
 */
export const config = {
  isProduction: process.env.NODE_ENV === 'production',
  port: process.env.PORT || 8084,
};

// 2026-09-13 跨服務(twse-ts/tpex-ts/mops-ts/sitca-ts)一起對齊的 User-Agent 格式，取代原本六個
// adapter（CBC/GCIS/FIA/DGBAS/NDC/SITCA）完全沒設 User-Agent、用 fetch/undici 預設值的狀態——讓
// 對方（政府機關/公會網站）看得出「這是誰的自動化流量」，出問題時也有據可查。格式：
// `<CrawlerName>/<Version> (+<Documentation-URL>; <Contact-Email>)`。實測驗證：twse-ts 用同一套
// 格式打過灰色地帶端點沒被擋，sitca-ts 對 4 種端點形狀（含 WebForms）都測過沒觸發自動封鎖，這裡
// 直接沿用，不用每個 adapter 各自重新驗證一次。
export const OUTBOUND_USER_AGENT = 'oingg-gov-ts/1.0 (+https://github.com/oingg-tw/oingg-gov-ts; ian.chu@oingg.com)';
