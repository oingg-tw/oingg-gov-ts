import { describe, it, expect } from 'vitest';
import { parseMonthlyMonetaryAggregate } from '@/domains/monthlyMonetaryAggregate/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

// 模擬真實回應的交錯配對：每個 structure 欄位在列裡佔 [餘額, 年增率] 兩格。這裡放 4 欄（一個無關欄
// 在最前面，讓 M1A/M1B/M2 的索引不是 0/1/2），每列 = 1 個期間 + 8 個值。
const COLUMNS = ['Currency held by the public', 'Monetary aggregates-M1A', 'Monetary aggregates-M1B', 'Monetary aggregates-M2'];

const buildResponse = (dataSets: unknown[]): CbcApiResponse => ({
  meta: {},
  data: { structure: { Table1: COLUMNS.map((c) => ({ data: c })) }, dataSets },
});

describe('parseMonthlyMonetaryAggregate', () => {
  it('reads amount/yoy pairs by column name using the interleaved layout', () => {
    const points = parseMonthlyMonetaryAggregate(
      buildResponse([['2026M07', '3572824', '5.29', '12716291', '8.28', '30530948', '7.34', '70224762', '7.42']])
    );
    expect(points).toEqual([
      {
        year: 2026,
        month: 7,
        m1aAmount: 12716291,
        m1aYoyPercent: 8.28,
        m1bAmount: 30530948,
        m1bYoyPercent: 7.34,
        m2Amount: 70224762,
        m2YoyPercent: 7.42,
      },
    ]);
  });

  it('keeps the row with null yoy when yoy is "-" (first year of the series)', () => {
    const [point] = parseMonthlyMonetaryAggregate(buildResponse([['1987M05', '242643', '-', '724916', '-', '1255199', '-', '3432119', '-']]));
    expect(point).toMatchObject({ m1bAmount: 1255199, m1aYoyPercent: null, m1bYoyPercent: null, m2YoyPercent: null });
  });

  it('skips the row when any aggregate amount is missing', () => {
    const points = parseMonthlyMonetaryAggregate(buildResponse([['2026M07', '1', '1', '-', '8.28', '30530948', '7.34', '70224762', '7.42']]));
    expect(points).toEqual([]);
  });

  it('skips rows whose period is not YYYYMmm', () => {
    const points = parseMonthlyMonetaryAggregate(buildResponse([['20260731', '1', '1', '2', '2', '3', '3', '4', '4']]));
    expect(points).toEqual([]);
  });

  it('throws when the row length breaks the amount/yoy pairing assumption', () => {
    expect(() => parseMonthlyMonetaryAggregate(buildResponse([['2026M07', '1', '2', '3', '4']]))).toThrow(/交錯配對/);
  });

  it('throws when a required column cannot be found by name', () => {
    const raw: CbcApiResponse = {
      meta: {},
      data: { structure: { Table1: [{ data: 'Monetary aggregates-M1A' }, { data: 'Monetary aggregates-M1B' }] }, dataSets: [] },
    };
    expect(() => parseMonthlyMonetaryAggregate(raw)).toThrow(/Monetary aggregates-M2/);
  });

  it('throws when data.structure is missing', () => {
    const raw = { meta: {}, data: { dataSets: [] } } as unknown as CbcApiResponse;
    expect(() => parseMonthlyMonetaryAggregate(raw)).toThrow(/data\.structure/);
  });
});
