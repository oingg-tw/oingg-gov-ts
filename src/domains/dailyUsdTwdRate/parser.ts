import type { CbcApiResponse } from '@/adapters/cbc';
import type { DailyUsdTwdRatePoint } from '@/domains/dailyUsdTwdRate/types';

// 三個欄位在 data.structure 裡的顯示名稱（2026-09-21 用真實回應核對過）。同一份表還有「收盤價日平均」
// （日資料裡整份全是 "-"）跟「遠期信用狀融通利率」兩欄，不取。用名稱比對找欄位索引，不寫死位置。
const COLUMN_NAMES = {
  bankBuyingRate: 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Bank-customer rates-Buying',
  bankSellingRate: 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Bank-customer rates-Selling',
  interbankClosingRate: 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Interbank closing rate',
} as const;

const toNumberOrNull = (v: unknown): number | null => {
  if (typeof v !== 'string' || v === '-') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// data.dataSets 每一列是 [期間字串 YYYYMMDD, 五個欄位的字串數值或 "-"]。
export const parseDailyUsdTwdRate = (raw: CbcApiResponse): DailyUsdTwdRatePoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EG51D01en 回應缺少 data.structure，格式可能已變更。');
  }

  const indexOf = (name: string): number => {
    const idx = columns.findIndex((col) => col.data === name);
    if (idx === -1) {
      throw new Error(`CBC EG51D01en 回應的 data.structure 找不到欄位「${name}」，格式可能已變更。`);
    }
    return idx + 1; // +1：row[0] 是期間字串
  };
  const buyingIdx = indexOf(COLUMN_NAMES.bankBuyingRate);
  const sellingIdx = indexOf(COLUMN_NAMES.bankSellingRate);
  const closingIdx = indexOf(COLUMN_NAMES.interbankClosingRate);

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EG51D01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: DailyUsdTwdRatePoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;
    const match = period.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) continue;

    const bankBuyingRate = toNumberOrNull(row[buyingIdx]);
    const bankSellingRate = toNumberOrNull(row[sellingIdx]);
    const interbankClosingRate = toNumberOrNull(row[closingIdx]);
    if (bankBuyingRate === null && bankSellingRate === null && interbankClosingRate === null) continue; // 三欄全缺才跳過

    points.push({
      tradeDate: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
      bankBuyingRate,
      bankSellingRate,
      interbankClosingRate,
    });
  }

  return points;
};
