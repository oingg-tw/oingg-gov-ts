import type { CbcApiResponse } from '@/adapters/cbc';
import type { MonthlyMonetaryAggregatePoint } from '@/domains/monthlyMonetaryAggregate/types';

// 三個總計數在 data.structure 裡的顯示名稱（2026-09-21 用真實回應核對過）。用名稱比對找欄位索引，
// 不寫死位置，理由同 govBondYield10y/parser.ts。
const COLUMN_NAMES = {
  m1a: 'Monetary aggregates-M1A',
  m1b: 'Monetary aggregates-M1B',
  m2: 'Monetary aggregates-M2',
} as const;

// EF15M01en 每個 structure 欄位在 dataSets 列裡佔兩個位置：[餘額, 年增率]，交錯排列。所以 structure
// 第 i 欄（0-based）的餘額在 row[1 + 2i]、年增率在 row[2 + 2i]（row[0] 是期間字串）。這是實測出來的
// 對應（15 欄 ↔ 每列 30 個值，且 meta.units 寫 "Millions of N.T. dollars, ％"），不是文件寫的。
const AMOUNT_OFFSET = 1;
const YOY_OFFSET = 2;
const VALUES_PER_COLUMN = 2;

const toNumberOrNull = (v: unknown): number | null => {
  if (typeof v !== 'string' || v === '-') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export const parseMonthlyMonetaryAggregate = (raw: CbcApiResponse): MonthlyMonetaryAggregatePoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EF15M01en 回應缺少 data.structure，格式可能已變更。');
  }

  const indexOf = (name: string): number => {
    const idx = columns.findIndex((col) => col.data === name);
    if (idx === -1) {
      throw new Error(`CBC EF15M01en 回應的 data.structure 找不到欄位「${name}」，格式可能已變更。`);
    }
    return idx;
  };
  const m1aIdx = indexOf(COLUMN_NAMES.m1a);
  const m1bIdx = indexOf(COLUMN_NAMES.m1b);
  const m2Idx = indexOf(COLUMN_NAMES.m2);

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EF15M01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: MonthlyMonetaryAggregatePoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;
    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue;

    // 每列長度必須是 1 + 2 × 欄數，否則交錯配對的假設已經不成立，整份丟出去而不是默默錯位
    if (row.length !== 1 + VALUES_PER_COLUMN * columns.length) {
      throw new Error(`CBC EF15M01en 的列長度 ${row.length} 跟 1 + 2 × ${columns.length} 欄不符，餘額/年增率交錯配對的假設可能已變更。`);
    }

    const amount = (idx: number) => toNumberOrNull(row[AMOUNT_OFFSET + VALUES_PER_COLUMN * idx]);
    const yoy = (idx: number) => toNumberOrNull(row[YOY_OFFSET + VALUES_PER_COLUMN * idx]);

    const m1aAmount = amount(m1aIdx);
    const m1bAmount = amount(m1bIdx);
    const m2Amount = amount(m2Idx);
    if (m1aAmount === null || m1bAmount === null || m2Amount === null) continue; // 餘額缺值就整列跳過，年增率缺值可以

    points.push({
      year: Number(match[1]),
      month: Number(match[2]),
      m1aAmount,
      m1aYoyPercent: yoy(m1aIdx),
      m1bAmount,
      m1bYoyPercent: yoy(m1bIdx),
      m2Amount,
      m2YoyPercent: yoy(m2Idx),
    });
  }

  return points;
};
