import { OUTBOUND_USER_AGENT } from '@/shared/config';

// 中央銀行統計資料庫 API（cpx.cbc.gov.tw）的共用 GET client。查詢語法固定是
// `?FileName=ItemCode`，ItemCode 對照表見專案根目錄 CBC-ITEM-CODES.md（整理自央行提供的
// 「Introduction to the API of the CBC Statistical Database」文件）。這個端點本身就回傳
// JSON（header/dataset/structure 三段式結構），不像 MOPS 那幾個非官方端點要解析 HTML，
// 所以這裡不需要 cheerio，也不需要帶 Referer/cookie。
const CBC_API_BASE_URL = 'https://cpx.cbc.gov.tw/API/DataAPI/Get';

// 2026-08-28 用 EG43M01en 真實回應核對過：頂層其實是 meta/data 兩段（不是 header/dataset/structure，
// 那是先前沒驗證過就寫的猜測型別，已修正）。data.dataSets 是列陣列，每列第一個元素是期間字串
// （如 "2026M06"），其餘元素依序對應 data.structure 底下唯一一個表格鍵（例如 "Table1"）的欄位陣列。
// 其餘欄位形狀是否依 ItemCode 不同而不同尚未驗證，故仍用寬鬆型別頂住；各 domain 的 parser.ts 應該在
// 解析時用 zod 依實際回應收斂型別（見 CBC-ITEM-CODES.md 裡記載的做法：先貼真實回應，再對照調整 parser）。
export interface CbcApiResponse {
  meta: Record<string, unknown>;
  data: {
    dataSets: unknown[];
    structure: Record<string, { data: string }[]>;
  };
}

export const fetchCbcItem = async (itemCode: string): Promise<CbcApiResponse> => {
  const url = `${CBC_API_BASE_URL}?FileName=${encodeURIComponent(itemCode)}`;
  const response = await fetch(url, { headers: { 'User-Agent': OUTBOUND_USER_AGENT } });
  if (!response.ok) {
    throw new Error(`CBC API 回應非 200：${response.status}（itemCode=${itemCode}）`);
  }
  return (await response.json()) as CbcApiResponse;
};
