import { describe, it, expect } from 'vitest';
import { parseMonthlyStockMarketSummary } from '@/domains/monthlyStockMarketSummary/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

// 真實回應的 6 欄順序；每欄在列裡佔 [值, 年增率] 兩格，每列 = 1 個期間 + 12 個值。
const COLUMNS = [
  'Listed stock-Number of listed companies',
  'Listed stock-Total par value',
  'Listed stock-Total market value',
  'Listed stock-Total trading value',
  'Listed stock-Average daily trading value',
  'Average TAIEX 1966=100',
];
const buildResponse = (dataSets: unknown[]): CbcApiResponse => ({
  meta: {},
  data: { structure: { Table1: COLUMNS.map((c) => ({ data: c })) }, dataSets },
});

describe('parseMonthlyStockMarketSummary', () => {
  it('parses the real 2026M07 row', () => {
    const row = ['2026M07', '1083', '3.537', '7910895', '1.556', '140848179', '85.635', '20732353', '181.821', '942380', '194.631', '44366.29', '93.208'];
    expect(parseMonthlyStockMarketSummary(buildResponse([row]))).toEqual([
      {
        year: 2026,
        month: 7,
        listedCompanies: 1083,
        totalParValue: 7910895,
        totalMarketValue: 140848179,
        totalTradingValue: 20732353,
        avgDailyTradingValue: 942380,
        avgTaiex: 44366.29,
        avgTaiexYoyPercent: 93.208,
      },
    ]);
  });

  it('keeps the first row of the series with null avg daily trading value and null yoy', () => {
    const row = ['1987M05', '130', '-', '242530', '-', '985607', '-', '203081', '-', '-', '-', '1814.28', '-'];
    const [point] = parseMonthlyStockMarketSummary(buildResponse([row]));
    expect(point).toMatchObject({ year: 1987, month: 5, listedCompanies: 130, avgTaiex: 1814.28, avgDailyTradingValue: null, avgTaiexYoyPercent: null });
  });

  it('skips the row when a core value is missing', () => {
    const row = ['2026M07', '1083', '3.537', '7910895', '1.556', '-', '85.635', '20732353', '181.821', '942380', '194.631', '44366.29', '93.208'];
    expect(parseMonthlyStockMarketSummary(buildResponse([row]))).toEqual([]);
  });

  it('throws when the row length breaks the value/yoy pairing assumption', () => {
    expect(() => parseMonthlyStockMarketSummary(buildResponse([['2026M07', '1', '2', '3']]))).toThrow(/交錯配對/);
  });

  it('throws when a required column cannot be found by name', () => {
    const raw: CbcApiResponse = { meta: {}, data: { structure: { Table1: [{ data: 'Listed stock-Number of listed companies' }] }, dataSets: [] } };
    expect(() => parseMonthlyStockMarketSummary(raw)).toThrow(/Total par value/);
  });
});
