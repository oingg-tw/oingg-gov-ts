import { describe, it, expect } from 'vitest';
import { parseMonthlyFiveMajorBankRate } from '@/domains/monthlyFiveMajorBankRate/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

// 照 EG2BM01en 真實回應的形狀：structure 底下一個表格鍵、三個欄位；dataSets 每列是
// [期間, 一個月定存, 一年定存, 基準放款]。欄位刻意用非預設順序擺，釘住「按名稱找索引」這件事。
const build = (columns: string[], rows: unknown[]): CbcApiResponse =>
  ({ meta: {}, data: { structure: { Table1: columns.map((data) => ({ data })) }, dataSets: rows } }) as CbcApiResponse;

const DEFAULT_COLUMNS = ['1-month deposit rates', '1-year deposit rates', 'Base lending rates'];

describe('parseMonthlyFiveMajorBankRate', () => {
  it('parses a month into year/month plus the three rates', () => {
    const points = parseMonthlyFiveMajorBankRate(build(DEFAULT_COLUMNS, [['2026M08', '1.23', '1.70', '3.265']]));
    expect(points).toEqual([{ year: 2026, month: 8, depositRate1m: 1.23, depositRate1y: 1.7, baseLendingRate: 3.265 }]);
  });

  it('finds columns by name, not by position', () => {
    const reordered = ['Base lending rates', '1-year deposit rates', '1-month deposit rates'];
    const [point] = parseMonthlyFiveMajorBankRate(build(reordered, [['2026M08', '3.265', '1.70', '1.23']]));
    expect(point).toMatchObject({ depositRate1m: 1.23, depositRate1y: 1.7, baseLendingRate: 3.265 });
  });

  // 存半列會讓下游分不出「缺值」跟「真的沒有」，所以缺任一欄整列跳過。
  it("skips a month where any column is CBC's missing marker", () => {
    const points = parseMonthlyFiveMajorBankRate(
      build(DEFAULT_COLUMNS, [
        ['2026M07', '1.23', '-', '3.265'],
        ['2026M08', '1.23', '1.70', '3.265'],
      ])
    );
    expect(points.map((p) => p.month)).toEqual([8]);
  });

  it('skips a period string that is not YYYYMnn', () => {
    const points = parseMonthlyFiveMajorBankRate(
      build(DEFAULT_COLUMNS, [
        ['2026Q3', '1.23', '1.70', '3.265'],
        ['2026M08', '1.23', '1.70', '3.265'],
      ])
    );
    expect(points.map((p) => p.month)).toEqual([8]);
  });

  it('throws when a column is renamed or dropped', () => {
    expect(() => parseMonthlyFiveMajorBankRate(build(['1-month deposit rates', '1-year deposit rates'], [])))
      .toThrow(/Base lending rates/);
  });

  it('throws when the response shape changes', () => {
    expect(() => parseMonthlyFiveMajorBankRate({ meta: {}, data: { structure: {}, dataSets: [] } } as CbcApiResponse))
      .toThrow(/data\.structure/);
  });
});
