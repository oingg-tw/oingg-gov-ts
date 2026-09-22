import type { CbcApiResponse } from '@/adapters/cbc';
import type { MonthlyStockMarketSummaryPoint } from '@/domains/monthlyStockMarketSummary/types';

// 六個欄位在 data.structure 裡的顯示名稱（2026-09-22 用真實回應核對過）。用名稱比對找欄位索引。
const COLUMN_NAMES = {
  listedCompanies: 'Listed stock-Number of listed companies',
  totalParValue: 'Listed stock-Total par value',
  totalMarketValue: 'Listed stock-Total market value',
  totalTradingValue: 'Listed stock-Total trading value',
  avgDailyTradingValue: 'Listed stock-Average daily trading value',
  avgTaiex: 'Average TAIEX 1966=100',
} as const;

// 跟 monthlyMonetaryAggregate 一樣的交錯配對：structure 第 i 欄的值在 row[1 + 2i]、年增率在 row[2 + 2i]
// （6 欄 ↔ 每列 12 個值，實測）。年增率只留加權指數那一個，其餘五欄的年增率下游要的話自己算。
const VALUES_PER_COLUMN = 2;

const toNumberOrNull = (v: unknown): number | null => {
  if (typeof v !== 'string' || v === '-') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export const parseMonthlyStockMarketSummary = (raw: CbcApiResponse): MonthlyStockMarketSummaryPoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EG27M01en 回應缺少 data.structure，格式可能已變更。');
  }

  const indexOf = (name: string): number => {
    const idx = columns.findIndex((col) => col.data === name);
    if (idx === -1) {
      throw new Error(`CBC EG27M01en 回應的 data.structure 找不到欄位「${name}」，格式可能已變更。`);
    }
    return idx;
  };
  const idx = {
    listedCompanies: indexOf(COLUMN_NAMES.listedCompanies),
    totalParValue: indexOf(COLUMN_NAMES.totalParValue),
    totalMarketValue: indexOf(COLUMN_NAMES.totalMarketValue),
    totalTradingValue: indexOf(COLUMN_NAMES.totalTradingValue),
    avgDailyTradingValue: indexOf(COLUMN_NAMES.avgDailyTradingValue),
    avgTaiex: indexOf(COLUMN_NAMES.avgTaiex),
  };

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EG27M01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: MonthlyStockMarketSummaryPoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;
    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue;

    if (row.length !== 1 + VALUES_PER_COLUMN * columns.length) {
      throw new Error(`CBC EG27M01en 的列長度 ${row.length} 跟 1 + 2 × ${columns.length} 欄不符，值/年增率交錯配對的假設可能已變更。`);
    }

    const value = (i: number) => toNumberOrNull(row[1 + VALUES_PER_COLUMN * i]);
    const yoy = (i: number) => toNumberOrNull(row[2 + VALUES_PER_COLUMN * i]);

    const listedCompanies = value(idx.listedCompanies);
    const totalParValue = value(idx.totalParValue);
    const totalMarketValue = value(idx.totalMarketValue);
    const totalTradingValue = value(idx.totalTradingValue);
    const avgTaiex = value(idx.avgTaiex);
    // 五個核心值任一缺就整列跳過；日均成交值早期本來就沒有，允許 null
    if (listedCompanies === null || totalParValue === null || totalMarketValue === null || totalTradingValue === null || avgTaiex === null) continue;

    points.push({
      year: Number(match[1]),
      month: Number(match[2]),
      listedCompanies,
      totalParValue,
      totalMarketValue,
      totalTradingValue,
      avgDailyTradingValue: value(idx.avgDailyTradingValue),
      avgTaiex,
      avgTaiexYoyPercent: yoy(idx.avgTaiex),
    });
  }

  return points;
};
