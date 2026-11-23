import { describe, it, expect } from 'vitest';
import { parseMonthlyMonetaryAggregate, parseMonthlyMonetaryAggregateComponents } from '@/domains/monthlyMonetaryAggregate/parser';
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

// 全部 15 項，名稱和順序照真實回應；貨幣市場基金那項來源就有連續空白。
const ALL_COMPONENTS = [
  'Currency held by the public', 'Deposit money-Subtotal', 'Deposit money-Checking accounts', 'Deposit money-Passbook deposits',
  'Deposit money-Passbook savings deposits', 'Quasi-money-Subtotal', 'Quasi-money-Time & savings deposits', 'Quasi-money-Foreign currency deposits',
  'Quasi-money-Postal savings deposits', 'Quasi-money-Non-residents NTD deposits', 'Quasi-money-Repurchase agreements',
  'Quasi-money-Money  market mutual  funds etc', 'Monetary aggregates-M1A', 'Monetary aggregates-M1B', 'Monetary aggregates-M2',
];
const componentResponse = (dataSets: unknown[], columns = ALL_COMPONENTS): CbcApiResponse => ({
  meta: {},
  data: { structure: { Table1: columns.map((data) => ({ data })) }, dataSets },
});
// 每項 [餘額, 年增率]；沒給的項目填 "-"
const componentRow = (period: string, values: Record<number, [string, string]>): string[] => [
  period,
  ...ALL_COMPONENTS.flatMap((_, i) => values[i] ?? ['-', '-']),
];

describe('parseMonthlyMonetaryAggregateComponents', () => {
  it('stores one row per component, matching names with squashed whitespace', () => {
    const points = parseMonthlyMonetaryAggregateComponents(
      componentResponse([componentRow('2026M09', { 0: ['3575963', '4.72'], 11: ['424374', '-2.38'], 14: ['71361845', '-'] })])
    );
    expect(points).toEqual([
      { year: 2026, month: 9, category: 'currency_held_by_public', amountMillionNtd: 3575963, yoyChangePercent: 4.72 },
      { year: 2026, month: 9, category: 'money_market_funds', amountMillionNtd: 424374, yoyChangePercent: -2.38 },
      { year: 2026, month: 9, category: 'm2', amountMillionNtd: 71361845, yoyChangePercent: null },
    ]);
  });

  it('throws on an amount with decimals, since the column would round it', () => {
    expect(() => parseMonthlyMonetaryAggregateComponents(componentResponse([componentRow('2026M09', { 0: ['3575963.5', '4.72'] })]))).toThrow(/有小數/);
  });

  it('throws on a column it has never mapped, or when one disappears', () => {
    expect(() => parseMonthlyMonetaryAggregateComponents(componentResponse([], [...ALL_COMPONENTS, 'Monetary aggregates-M3']))).toThrow(/沒對照過的欄位/);
    expect(() => parseMonthlyMonetaryAggregateComponents(componentResponse([], ALL_COMPONENTS.slice(1)))).toThrow(/少了欄位/);
  });
});
