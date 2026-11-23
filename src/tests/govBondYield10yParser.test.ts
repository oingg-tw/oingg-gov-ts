import { describe, it, expect } from 'vitest';
import { parseMonthlyCapitalMarketRates, parseMonthlyGovBondYield10y } from '@/domains/govBondYield10y/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

const TARGET_COLUMN = "Bond market-10-year gov't bond rates in secondary market";

// 目標欄位刻意放在非 0 的索引位置，模擬真實回應裡它不是第一欄的情況——如果 parser 誤用固定位置
// 而不是用欄位名稱比對，這裡就會測出來。
const buildResponse = (dataSets: unknown[]): CbcApiResponse => ({
  meta: {},
  data: {
    structure: {
      Table1: [{ data: 'Some other column' }, { data: TARGET_COLUMN }, { data: 'Yet another column' }],
    },
    dataSets,
  },
});

describe('parseMonthlyGovBondYield10y', () => {
  it('parses a valid row into a point', () => {
    const points = parseMonthlyGovBondYield10y(buildResponse([['2026M06', '1.111', '1.234', '9.999']]));
    expect(points).toEqual([{ year: 2026, month: 6, yieldRate: 1.234 }]);
  });

  it('skips rows where the target column is "-" (CBC missing-value marker)', () => {
    const points = parseMonthlyGovBondYield10y(buildResponse([['2026M06', '1.111', '-', '9.999']]));
    expect(points).toEqual([]);
  });

  it('skips rows with a period that does not match YYYYMmm', () => {
    const points = parseMonthlyGovBondYield10y(buildResponse([['not-a-period', '1.111', '1.234', '9.999']]));
    expect(points).toEqual([]);
  });

  it('throws when the target value is neither a number nor the "-" missing marker', () => {
    expect(() => parseMonthlyGovBondYield10y(buildResponse([['2026M06', '1.111', 'N/A', '9.999']]))).toThrow(/無法解析的數字「N\/A」/);
  });

  it('skips non-array rows without throwing', () => {
    const points = parseMonthlyGovBondYield10y(buildResponse([null, undefined, 'not-a-row']));
    expect(points).toEqual([]);
  });

  it('parses multiple rows, preserving order', () => {
    const points = parseMonthlyGovBondYield10y(
      buildResponse([
        ['2026M01', '1.111', '1.100', '9.999'],
        ['2026M02', '1.111', '1.200', '9.999'],
      ])
    );
    expect(points).toEqual([
      { year: 2026, month: 1, yieldRate: 1.1 },
      { year: 2026, month: 2, yieldRate: 1.2 },
    ]);
  });

  it('throws when data.structure is missing (CBC response shape changed)', () => {
    const raw = { meta: {}, data: { dataSets: [] } } as unknown as CbcApiResponse;
    expect(() => parseMonthlyGovBondYield10y(raw)).toThrow(/data\.structure/);
  });

  it('throws when the target column cannot be found by name', () => {
    const raw: CbcApiResponse = {
      meta: {},
      data: { structure: { Table1: [{ data: 'Unrelated column' }] }, dataSets: [] },
    };
    expect(() => parseMonthlyGovBondYield10y(raw)).toThrow(/找不到欄位/);
  });

  it('throws when data.dataSets is missing (CBC response shape changed)', () => {
    const raw = {
      meta: {},
      data: { structure: { Table1: [{ data: TARGET_COLUMN }] } },
    } as unknown as CbcApiResponse;
    expect(() => parseMonthlyGovBondYield10y(raw)).toThrow(/data\.dataSets/);
  });
});

// 整張表 20 欄，名稱和順序照真實回應（2026-11-12 的銅層檔）。
const ALL_COLUMNS = [
  'Government bonds-3-year', 'Government bonds-5-year', 'Government bonds-7-year', 'Government bonds-10-year', 'Government bonds-15-year',
  'Corporate bonds-1-year', 'Corporate bonds-2-year', 'Corporate bonds-3-year', 'Corporate bonds-4-year', 'Corporate bonds-5-year',
  'Corporate bonds-6-year', 'Corporate bonds-7-year', 'Corporate bonds-10-year',
  'Bank debentures-2-year', 'Bank debentures-3-year', 'Bank debentures-5-year',
  'Securities issued by CBC-CDs-1-year', 'Securities issued by CBC-CDs-2-year', 'Securities issued by CBC-SB-1-year',
  TARGET_COLUMN,
];
const fullResponse = (dataSets: unknown[], columns = ALL_COLUMNS): CbcApiResponse => ({
  meta: {},
  data: { structure: { Table1: columns.map((data) => ({ data })) }, dataSets },
});
const row = (period: string, values: Record<number, string>): string[] => [period, ...ALL_COLUMNS.map((_, i) => values[i] ?? '-')];

describe('parseMonthlyCapitalMarketRates', () => {
  it('stores one row per non-missing cell, mapped by column name', () => {
    const points = parseMonthlyCapitalMarketRates(fullResponse([row('2026M09', { 1: '1.625', 9: '2.1', 19: '1.383' })]));
    expect(points).toEqual([
      { year: 2026, month: 9, category: 'gov_bond_5y', rate: 1.625 },
      { year: 2026, month: 9, category: 'corporate_bond_5y', rate: 2.1 },
      { year: 2026, month: 9, category: 'gov_bond_10y_secondary_market', rate: 1.383 },
    ]);
  });

  it('throws on a column it has never mapped, instead of storing it under a guess', () => {
    expect(() => parseMonthlyCapitalMarketRates(fullResponse([], [...ALL_COLUMNS, 'Government bonds-20-year']))).toThrow(/沒對照過的欄位/);
  });

  it('throws when a known column disappears', () => {
    expect(() => parseMonthlyCapitalMarketRates(fullResponse([], ALL_COLUMNS.slice(1)))).toThrow(/少了欄位/);
  });

  it('throws when a row does not have one value per column', () => {
    expect(() => parseMonthlyCapitalMarketRates(fullResponse([['2026M09', '1.0']]))).toThrow(/跟 20 欄不符/);
  });

  it('throws on a value that is neither a number nor "-"', () => {
    expect(() => parseMonthlyCapitalMarketRates(fullResponse([row('2026M09', { 0: '1,5' })]))).toThrow(/無法解析的數字/);
  });
});
