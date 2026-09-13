import https from 'node:https';
import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 行政院主計總處統計網站的固定路徑 XML 下載檔案（ws.dgbas.gov.tw），不是正式 REST API——每份
// 統計表各自有自己的固定 URL（依資料集不同，見各 domain 的 service.ts），沒有查詢參數，只能整份
// 下載。格式統一是 <DataSet Sender_NAME="..." Tab_NAME="...">
// <Obs><Item>...</Item><TIME_PERIOD>...</TIME_PERIOD><FREQ>...</FREQ><TYPE>...</TYPE>
// <Item_VALUE>...</Item_VALUE></Obs>...</DataSet>，已用消費者物價基本分類指數(CPI)、GDP貢獻度
// 兩份真實檔案核對過格式完全一致（2026-09-02）。手動用 regex 解析，不引入 XML parser 套件——這個
// 格式扁平、沒有巢狀結構、沒有屬性要解析，不值得為此加依賴。
//
// ws.dgbas.gov.tw 這台主機的 TLS 憑證鏈本身有問題（2026-09-02 用 openssl s_client -showcerts
// 實測驗證過：伺服器送出的憑證鏈裡，中繼憑證跟葉憑證（www.dgbas.gov.tw，簽發者 TWCA Secure SSL
// Certification Authority）對不上，openssl 直接回報 "unable to get local issuer certificate"——
// 是主機自己沒送出正確的中繼憑證，不是我方憑證庫缺漏）。curl 在 Windows 上能通，是因為 Schannel
// 會用 AIA(Authority Information Access)自動另外抓正確的中繼憑證補完整條鏈；Node.js 的 fetch
// 預設不做 AIA chasing，所以會直接判定驗證失敗（UNABLE_TO_VERIFY_LEAF_SIGNATURE）——這代表 Cloud
// Run 的 Linux 環境大概率也會一樣失敗，不是本機環境獨有的問題。同樣掛在國發會 ws.ndc.gov.tw 的
// 景氣指標及燈號 ZIP 檔憑證正常，不受影響，這裡的例外只針對 ws.dgbas.gov.tw 這一台主機、只在這個
// adapter 內生效，不影響其他 adapter（GCIS/CBC/FIA）對外請求的憑證驗證。改用 node:https 手動發
// 請求，而不是全域 fetch，這樣才能針對單一主機關閉驗證，不會不小心關掉全域的 TLS 保護。

export interface DgbasObs {
  item: string; // 統計項目名稱，例如 "總指數(指數基期：民國110年=100)"
  timePeriod: string; // 例如 "1981M01"（月）或 "1981Q1"（季）
  freq: string; // "M" | "Q"
  type: string; // 例如 "原始值"、"年增率(%)"
  value: string; // 原始字串，可能是空字串（缺值，通常是資料起始年份沒有前一年可比較，年增率算不出來）
}

// 已用真實回應核對過：CPI 檔案 88,614 個 <Obs>，這個 regex 全部解析成功、一個不漏（2026-09-02）。
const OBS_REGEX = /<Obs>\s*<Item>([^<]*)<\/Item>\s*<TIME_PERIOD>([^<]*)<\/TIME_PERIOD>\s*<FREQ>([^<]*)<\/FREQ>\s*<TYPE>([^<]*)<\/TYPE>\s*<Item_VALUE>([^<]*)<\/Item_VALUE>\s*<\/Obs>/g;

export const fetchDgbasXml = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    https
      .get(url, { rejectUnauthorized: false, headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          res.resume(); // 消耗掉 response body，避免 socket 卡住不釋放
          reject(new Error(`DGBAS XML 下載失敗：HTTP ${statusCode}（url=${url}）`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      })
      .on('error', reject);
  });
};

export const parseDgbasObsXml = (xml: string): DgbasObs[] => {
  const results: DgbasObs[] = [];
  for (const match of xml.matchAll(OBS_REGEX)) {
    results.push({
      item: match[1] ?? '',
      timePeriod: match[2] ?? '',
      freq: match[3] ?? '',
      type: match[4] ?? '',
      value: match[5] ?? '',
    });
  }
  return results;
};
