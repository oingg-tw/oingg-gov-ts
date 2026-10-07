import type { CbcApiResponse } from '@/adapters/cbc';
import type { MonthlyFiveMajorBankRatePoint } from '@/domains/monthlyFiveMajorBankRate/types';

// data.structure 裡的欄位顯示名稱（2026-10-07 用真實回應核對過，整份只有這三欄）。用名稱比對找索引、
// 不寫死數字位置——CBC 官方文件沒承諾欄位順序不變，用名稱比對不會因為表格改版而悄悄抓錯欄。
const COLUMN_NAMES = {
  depositRate1m: '1-month deposit rates',
  depositRate1y: '1-year deposit rates',
  baseLendingRate: 'Base lending rates',
} as const;

// data.dataSets 每一列是 [期間字串, 一個月定存, 一年定存, 基準放款]，期間字串格式如 "2026M08"。
export const parseMonthlyFiveMajorBankRate = (raw: CbcApiResponse): MonthlyFiveMajorBankRatePoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EG2BM01en 回應缺少 data.structure，格式可能已變更。');
  }

  const indexes = {} as Record<keyof typeof COLUMN_NAMES, number>;
  for (const [field, name] of Object.entries(COLUMN_NAMES) as [keyof typeof COLUMN_NAMES, string][]) {
    const index = columns.findIndex((col) => col.data === name);
    if (index === -1) {
      throw new Error(`CBC EG2BM01en 回應的 data.structure 找不到欄位「${name}」，格式可能已變更。`);
    }
    indexes[field] = index;
  }

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EG2BM01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: MonthlyFiveMajorBankRatePoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;
    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue; // 格式不符預期的期間，跳過而不是猜

    // 三欄一起取：缺任一欄就整列跳過，不存半列。存半列會讓下游拿到「有一年期定存但沒有基準放款」
    // 這種看不出是缺值還是真的沒有的列。
    const values = {} as Record<keyof typeof COLUMN_NAMES, number>;
    let usable = true;
    for (const field of Object.keys(COLUMN_NAMES) as (keyof typeof COLUMN_NAMES)[]) {
      const rawValue = row[indexes[field] + 1]; // +1：row[0] 是期間字串，不是資料欄
      if (typeof rawValue !== 'string' || rawValue === '-') { usable = false; break; } // "-" 是 CBC 的缺值標記
      const value = Number(rawValue);
      if (Number.isNaN(value)) { usable = false; break; }
      values[field] = value;
    }
    if (!usable) continue;

    points.push({ year: Number(match[1]), month: Number(match[2]), ...values });
  }

  return points;
};
