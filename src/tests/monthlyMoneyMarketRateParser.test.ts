import { describe, it, expect } from 'vitest';
import { parseMonthlyMoneyMarketRates } from '@/domains/monthlyMoneyMarketRate/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

// 21 欄，名稱和順序照真實回應（2026-11-23）。欄位對照的錯誤路徑在 govBondYield10yParser.test.ts（同一個 parseCbcRateTable）。
const COLUMNS = [
  'Interbank call loans',
  'Commercial paper-Primary market-1-30 days', 'Commercial paper-Primary market-31-90 days', 'Commercial paper-Primary market-91-180 days',
  'Commercial paper-Secondary market-1-30 days', 'Commercial paper-Secondary market-31-90 days', 'Commercial paper-Secondary market-91-180 days',
  'NCDs-Secondary market-1-90 days', 'NCDs-Secondary market-91-180 days',
  "Bankers' acceptances-Secondary market-1-30 days", "Bankers' acceptances-Secondary market-31-90 days", "Bankers' acceptances-Secondary market-91-180 days",
  'Treasury bills-Primary market-1-91 days', 'Treasury bills-Primary market-92-182 days', 'Treasury bills-Primary market-183-364 days',
  'Treasury bills-Secondary market-1-30 days', 'Treasury bills-Secondary market-31-91 days', 'Treasury bills-Secondary market-92-182 days',
  'RP on government bonds-Secondary market-1-30 days', 'RP on government bonds-Secondary market-31-90 days', 'RP on government bonds-Secondary market-91-180 days',
];
const response = (dataSets: unknown[], columns = COLUMNS): CbcApiResponse => ({
  meta: {},
  data: { structure: { Table1: columns.map((data) => ({ data })) }, dataSets },
});

describe('parseMonthlyMoneyMarketRates', () => {
  it('maps all 21 columns and skips "-"', () => {
    const values = COLUMNS.map((_, i) => (i === 12 ? '-' : String(1 + i / 100)));
    const points = parseMonthlyMoneyMarketRates(response([['2026M09', ...values]]));
    expect(points).toHaveLength(20);
    expect(points[0]).toEqual({ year: 2026, month: 9, category: 'interbank_call_loan', rate: 1 });
    expect(points.find((p) => p.category === 'commercial_paper_secondary_31_90d')?.rate).toBe(1.05);
    expect(points.some((p) => p.category === 'treasury_bill_primary_1_91d')).toBe(false);
    expect(points.at(-1)).toMatchObject({ category: 'gov_bond_repo_91_180d', rate: 1.2 });
  });

  it('names the item code when the table changes', () => {
    expect(() => parseMonthlyMoneyMarketRates(response([], COLUMNS.slice(1)))).toThrow(/CBC EG41M01en 少了欄位「Interbank call loans」/);
  });
});
