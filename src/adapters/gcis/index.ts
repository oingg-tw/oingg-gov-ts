import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 經濟部商工行政資料開放平台「公司登記基本資料及營業項目」API 的共用 GET client。用統一編號
// （Business_Accounting_NO）查詢，回傳陣列（因為底層是 $filter 查詢，理論上可能查到 0 或 1 筆——
// 統編本身唯一，正常情況下不會超過 1 筆）。這個端點不需要 API key。
const GCIS_COMPANY_BUSINESS_API_URL = 'https://data.gcis.nat.gov.tw/od/data/api/236EE382-4942-41A9-BD03-CA0709025E7C';

// ⚠️ 境外註冊公司：**不要用任何欄位或名稱特徵預判 GCIS 查不查得到，唯一可靠的做法是打一次。**
//
// 2026-10-02 實測（130 次查詢，資料由 twse-ts / tpex-ts 提供）：
//
//   上市，有填 foreign_registration_country 且統編非佔位符的 94 家  →  10 家查得到（10.6%）
//   上櫃/興櫃，Registration = "KY 開曼群島" 的 36 家                →  14 家查得到（38.9%）
//
// 查得到的那些是**外國公司在台認許登記**（例如 `英屬開曼群島商亞德客國際股份有限公司`），GCIS 確實
// 收這一類，全部是 `Company_Status = 01 核准登記`。所以「不是台灣法人就不會有 GCIS 登記」這句話是
// 錯的，而 twse-ts 的推送腳本原本就是依這個理由預設把它們濾掉。
//
// 試過但**行不通**的預判方式，兩個都是實測否證的，不要再試一次：
//
// 1. 「登記名稱含『<國名>商』前綴」。這個機制在 GCIS 這一側 100% 成立——我們查到的 24 家，GCIS
//    回的 Company_Name 全部有「商」。但它**在交易所的資料裡觀測不到**：交易所的公司名稱欄位是簡化
//    後的本國名稱，會把前綴吃掉（TPEx 的 `譜瑞科技股份有限公司` 在 GCIS 是
//    `英屬蓋曼群島商譜瑞科技股份有限公司`）。拿交易所的名稱去判，兩個方向都錯：上櫃帶前綴的 5 家
//    只有 3 家查得到，沒帶前綴的 25 家有 9 家查得到。這不是門檻要調，是特徵不可觀測。
// 2. 「foreign_registration_country / Registration 欄位」。TPEx 那一欄 distinct 值只有 `－` 與
//    `KY 開曼群島`（tpex-ts 2026-10-02 量過原始回應），**實質是一個 KY 旗標，不是註冊國家欄位**，
//    表達不了認許登記母國。實例：上櫃 3664 安瑞在 TPEx 標 KY，GCIS 回的是「美商安瑞科技股份有限
//    公司」。兩邊記的本來就不是同一件事。
//
// 另外一條界線：**GCIS 查得到 ≠ 會有稅籍行業別。** 查得到只讓它進 company_profiles；要拿到
// section_code 還得在財政部那份 322MB 稅籍檔裡有「總公司本身」那一列（見
// companyIndustryClassification/service.ts）。外國公司認許登記不保證有稅籍營業登記，這一段還沒量過。

// Cmp_Business 陣列裡的每一列不一定是代碼化的營業項目——Business_Item 可能是空白（只有空格），
// 這種列是「所營事業資料」的自由文字說明（例如「依客戶之訂單...」），不是代碼表能查到的項目，
// 原樣照登，不特別處理。
export interface GcisCompanyBusinessItem {
  Business_Seq_NO: string;
  Business_Item: string;
  Business_Item_Desc: string;
}

export interface GcisCompanyRecord {
  Business_Accounting_NO: string;
  Company_Name: string;
  Company_Status: string;
  Company_Status_Desc: string;
  Company_Setup_Date: string;
  Cmp_Business: GcisCompanyBusinessItem[];
}

// 節流：GCIS 沒公開速率限制文件，但短時間內連續打有被暫時鎖 IP 的風險，保守起見同一個 process 內
// 每次呼叫之間至少間隔 MIN_REQUEST_INTERVAL_MS，用模組層級變數記上一次請求時間，而不是每個呼叫端
// 自己各自 sleep——這樣不管是 companyBusinessItems 的即時查詢還是 companyProfile 的註冊流程，
// 只要共用這個 client 就都受節流保護，不用每個 domain 各自實作一次。
const MIN_REQUEST_INTERVAL_MS = 1000;
let lastRequestAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 重試只針對「打不到／回應非 200」這種看起來像暫時性的失敗；「查無此統編」是 GCIS 回傳 HTTP 200
// 但 body 空字串，正常回傳空陣列而不丟例外，不會走到這個重試邏輯——重試空結果沒有意義。
const MAX_RETRIES = 2; // 最多共嘗試 3 次（1 次原始 + 2 次重試）
const RETRY_DELAY_MS = 2000; // 重試間隔遞增：第 1 次重試等 2 秒、第 2 次等 4 秒

const requestOnce = async (businessAccountingNo: string): Promise<GcisCompanyRecord[]> => {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestAt = Date.now();

  const filter = `Business_Accounting_NO eq '${businessAccountingNo}'`;
  const url = `${GCIS_COMPANY_BUSINESS_API_URL}?${new URLSearchParams({ $format: 'json', $filter: filter }).toString()}`;
  const response = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`GCIS API 回應非 200：${response.status}（統編=${businessAccountingNo}）`);
  }

  // 查無此統編時，GCIS 回傳 HTTP 200 但 body 是空字串（不是 "[]"），直接 .json() 會丟
  // "Unexpected end of JSON input"——空字串視同查無資料，回傳空陣列。
  const text = await response.text();
  if (text.trim() === '') return [];
  return JSON.parse(text) as GcisCompanyRecord[];
};

export const fetchCompanyBusinessItems = async (businessAccountingNo: string): Promise<GcisCompanyRecord[]> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await requestOnce(businessAccountingNo);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
      }
    }
  }
  throw lastError;
};
