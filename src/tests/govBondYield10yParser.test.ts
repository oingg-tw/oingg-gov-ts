import { describe, it, expect } from 'vitest';
import { parseMonthlyGovBondYield10y } from '@/domains/govBondYield10y/parser';
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
