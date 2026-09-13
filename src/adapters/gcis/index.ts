import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 經濟部商工行政資料開放平台「公司登記基本資料及營業項目」API 的共用 GET client。用統一編號
// （Business_Accounting_NO）查詢，回傳陣列（因為底層是 $filter 查詢，理論上可能查到 0 或 1 筆——
// 統編本身唯一，正常情況下不會超過 1 筆）。這個端點不需要 API key。
const GCIS_COMPANY_BUSINESS_API_URL = 'https://data.gcis.nat.gov.tw/od/data/api/236EE382-4942-41A9-BD03-CA0709025E7C';

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
