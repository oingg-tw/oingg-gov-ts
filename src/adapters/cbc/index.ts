import { OUTBOUND_USER_AGENT } from '@/shared/config';
import { fetchUpstream } from '@/shared/bronze';
import { parseSourceNumber } from '@/shared/parseSourceValue';

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

// 每次回應的 meta.prepared 都是央行產生回應的當下時間（到秒），銅層比「內容跟上次一樣」時要拿掉，不然天天都算新檔
// （使用者 2026-11-12 核准）。解析不讀這個欄位。
export const withoutPreparedTime = (body: Buffer): string => body.toString('utf8').replace(/"prepared":"[^"]*"/, '');

export const fetchCbcItem = async (itemCode: string): Promise<CbcApiResponse> => {
  const url = `${CBC_API_BASE_URL}?FileName=${encodeURIComponent(itemCode)}`;
  const response = await fetchUpstream(url, 'json', { headers: { 'User-Agent': OUTBOUND_USER_AGENT } }, withoutPreparedTime);
  if (!response.ok) {
    throw new Error(`CBC API 回應非 200：${response.status}（itemCode=${itemCode}）`);
  }
  return JSON.parse(response.body.toString('utf8')) as CbcApiResponse;
};

// 一欄一個 category 的央行利率表（資本市場利率 EG43M01en、貨幣市場利率 EG41M01en）轉成長表：一個（月, category）一列，
// "-" 是沒有值，不存列。欄名對照表要跟來源完全一致，多一欄或少一欄都丟錯：多出來的不知道是什麼不能亂存，少了代表表格改版。
export const parseCbcRateTable = <C extends string>(
  raw: CbcApiResponse,
  itemCode: string,
  columnCategories: Readonly<Record<string, C>>
): { year: number; month: number; category: C; rate: number }[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) throw new Error(`CBC ${itemCode} 回應缺少 data.structure，格式可能已變更。`);

  const categories = columns.map((col) => {
    const category = columnCategories[col.data];
    if (!category) throw new Error(`CBC ${itemCode} 出現沒對照過的欄位「${col.data}」，格式可能已變更。`);
    return category;
  });
  const missing = Object.keys(columnCategories).filter((name) => !columns.some((col) => col.data === name));
  if (missing.length) throw new Error(`CBC ${itemCode} 少了欄位「${missing.join('」「')}」，格式可能已變更。`);

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) throw new Error(`CBC ${itemCode} 回應缺少 data.dataSets，格式可能已變更。`);

  const points: { year: number; month: number; category: C; rate: number }[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const period = row[0];
    if (typeof period !== 'string') continue;
    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue; // 同各 CBC parser：不是月資料的期間不收
    if (row.length !== 1 + columns.length) {
      throw new Error(`CBC ${itemCode} ${period} 有 ${row.length - 1} 個值，跟 ${columns.length} 欄不符，格式可能已變更。`);
    }
    categories.forEach((category, i) => {
      const rate = parseSourceNumber(row[i + 1], ['-'], `CBC ${itemCode} ${period} ${columns[i]?.data}`);
      if (rate !== null) points.push({ year: Number(match[1]), month: Number(match[2]), category, rate });
    });
  }
  return points;
};
