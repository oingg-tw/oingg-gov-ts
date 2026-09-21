import type { CbcApiResponse } from '@/adapters/cbc';
import type { CbcPolicyRatePoint } from '@/domains/cbcPolicyRate/types';

// 三個欄位在 data.structure 裡的顯示名稱（2026-09-21 用真實回應核對過）。注意日頻率版本 EG28D01en
// 的欄名跟月頻率 EG2AM01en 不一樣（月版是 "Discount rate"/"Interest rate on accommodations with
// coliateral"（原文就拼錯）/"CBRACM rate on accommodations with coliateral"），這裡只認日版的名稱。
// 用名稱比對找欄位索引而不寫死位置，理由同 govBondYield10y/parser.ts。
const COLUMN_NAMES = {
  discountRate: 'Discount',
  collateralAccommodationRate: 'Accommodations with collateral',
  unsecuredAccommodationRate: 'Accommodations without collateral',
} as const;

// data.dataSets 每一列是 [期間字串, 三個欄位的字串數值或 "-"]，期間字串格式如 "20240322"。
// 三個利率同日同步調整，實測 77 列全部三欄都有值；任一欄缺值（"-" 或非數字）就整列跳過，
// 不寫入部分欄位——這種列不符合「一次調整事件」的語意，寧可少一列也不要存半列。
export const parseCbcPolicyRate = (raw: CbcApiResponse): CbcPolicyRatePoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EG28D01en 回應缺少 data.structure，格式可能已變更。');
  }

  const indexOf = (name: string): number => {
    const idx = columns.findIndex((col) => col.data === name);
    if (idx === -1) {
      throw new Error(`CBC EG28D01en 回應的 data.structure 找不到欄位「${name}」，格式可能已變更。`);
    }
    return idx + 1; // +1：row[0] 是期間字串，不是資料欄
  };
  const discountIdx = indexOf(COLUMN_NAMES.discountRate);
  const collateralIdx = indexOf(COLUMN_NAMES.collateralAccommodationRate);
  const unsecuredIdx = indexOf(COLUMN_NAMES.unsecuredAccommodationRate);

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EG28D01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: CbcPolicyRatePoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;

    const match = period.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (!match) continue;

    const toNumber = (idx: number): number | null => {
      const v = row[idx];
      if (typeof v !== 'string' || v === '-') return null;
      const n = Number(v);
      return Number.isNaN(n) ? null : n;
    };
    const discountRate = toNumber(discountIdx);
    const collateralAccommodationRate = toNumber(collateralIdx);
    const unsecuredAccommodationRate = toNumber(unsecuredIdx);
    if (discountRate === null || collateralAccommodationRate === null || unsecuredAccommodationRate === null) continue;

    points.push({
      effectiveDate: new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))),
      discountRate,
      collateralAccommodationRate,
      unsecuredAccommodationRate,
    });
  }

  return points;
};
