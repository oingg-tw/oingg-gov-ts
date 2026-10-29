/**
 * 讀環境變數；頭尾有空白、換行、控制字元或引號就丟錯並說出變數名，不幫忙修掉。
 *
 * 2026-10-29 之前這裡是 stripQuotes()（照 oingg-twse-ts），默默去掉頭尾空白跟一層引號。讀取端
 * 吸收髒值，髒值就一直沒人發現，換一個不 trim 的讀取端才以 401/連線失敗的形式爆出來，離原因很遠
 * （data-rust 一把結尾多 \r 的金鑰就是這樣被 mops 的 trim 藏住，mops b64c0ba 改成丟錯）。使用者
 * 裁定值錯了在來源修（Secret Manager／.env），不在程式裡配合。
 * dotenv 跟 `node --env-file` 本來就會去掉 .env 裡 KEY="..." 的引號，本機 .env 不受影響。
 */
export function readCleanEnv(name: string): string | undefined {
  const value = process.env[name];
  // oxlint-disable-next-line no-control-regex -- 就是要抓頭尾的控制字元（\r、\0 等）
  if (value !== undefined && /^[\s\x00-\x1f"']|[\s\x00-\x1f"']$/.test(value)) {
    throw new Error(`${name} 頭尾有空白、換行或引號，請到來源（Secret Manager／.env）修掉，不要在程式裡去掉。`);
  }
  return value;
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
