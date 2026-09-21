import { describe, it, expect } from 'vitest';
import { parseDailyUsdTwdRate } from '@/domains/dailyUsdTwdRate/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

const BUY = 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Bank-customer rates-Buying';
const SELL = 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Bank-customer rates-Selling';
const CLOSE = 'Spot exchange rates of the N.T. dollar against the U.S. dollar-Interbank closing rate';

// 欄位順序刻意跟真實回應不同（收盤價放最前、多一個無關欄），parser 用名稱比對才不會抓錯。
const buildResponse = (dataSets: unknown[]): CbcApiResponse => ({
  meta: {},
  data: {
    structure: { Table1: [{ data: CLOSE }, { data: 'Interest rates on accommodations for usance L/C (per annum) %' }, { data: BUY }, { data: SELL }] },
    dataSets,
  },
});

describe('parseDailyUsdTwdRate', () => {
  it('parses a row, mapping columns by name', () => {
    const points = parseDailyUsdTwdRate(buildResponse([['20260731', '32.292', '7.50', '32.26', '32.36']]));
    expect(points).toEqual([
      { tradeDate: new Date(Date.UTC(2026, 6, 31)), bankBuyingRate: 32.26, bankSellingRate: 32.36, interbankClosingRate: 32.292 },
    ]);
  });

  it('keeps the row with a null closing rate when only that column is "-"', () => {
    const [point] = parseDailyUsdTwdRate(buildResponse([['20260731', '-', '7.50', '32.26', '32.36']]));
    expect(point).toMatchObject({ interbankClosingRate: null, bankBuyingRate: 32.26 });
  });

  it('skips the row when all three rates are "-"', () => {
    const points = parseDailyUsdTwdRate(buildResponse([['20260731', '-', '7.50', '-', '-']]));
    expect(points).toEqual([]);
  });

  it('skips rows whose period is not YYYYMMDD', () => {
    const points = parseDailyUsdTwdRate(buildResponse([['2026M07', '32.292', '7.50', '32.26', '32.36']]));
    expect(points).toEqual([]);
  });

  it('throws when a required column cannot be found by name', () => {
    const raw: CbcApiResponse = { meta: {}, data: { structure: { Table1: [{ data: BUY }, { data: SELL }] }, dataSets: [] } };
    expect(() => parseDailyUsdTwdRate(raw)).toThrow(/Interbank closing rate/);
  });

  it('throws when data.dataSets is missing', () => {
    const raw = { meta: {}, data: { structure: { Table1: [{ data: BUY }, { data: SELL }, { data: CLOSE }] } } } as unknown as CbcApiResponse;
    expect(() => parseDailyUsdTwdRate(raw)).toThrow(/data\.dataSets/);
  });
});
