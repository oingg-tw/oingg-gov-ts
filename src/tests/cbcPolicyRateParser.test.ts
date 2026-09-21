import { describe, it, expect } from 'vitest';
import { parseCbcPolicyRate } from '@/domains/cbcPolicyRate/parser';
import type { CbcApiResponse } from '@/adapters/cbc';

// 欄位順序刻意跟真實回應（Discount / with / without）打亂，模擬 CBC 改版換欄位順序——parser 用名稱
// 比對就不受影響，用固定位置就會抓錯欄。
const buildResponse = (dataSets: unknown[]): CbcApiResponse => ({
  meta: {},
  data: {
    structure: {
      Table1: [
        { data: 'Accommodations without collateral' },
        { data: 'Some unrelated column' },
        { data: 'Discount' },
        { data: 'Accommodations with collateral' },
      ],
    },
    dataSets,
  },
});

describe('parseCbcPolicyRate', () => {
  it('parses a valid row into a point, mapping columns by name', () => {
    const points = parseCbcPolicyRate(buildResponse([['20240322', '4.250', '9.999', '2.000', '2.375']]));
    expect(points).toEqual([
      {
        effectiveDate: new Date(Date.UTC(2024, 2, 22)),
        discountRate: 2.0,
        collateralAccommodationRate: 2.375,
        unsecuredAccommodationRate: 4.25,
      },
    ]);
  });

  it('skips the whole row when any of the three rates is "-" (CBC missing-value marker)', () => {
    const points = parseCbcPolicyRate(buildResponse([['20240322', '4.250', '9.999', '2.000', '-']]));
    expect(points).toEqual([]);
  });

  it('skips rows with a period that is not YYYYMMDD', () => {
    const points = parseCbcPolicyRate(buildResponse([['2024M03', '4.250', '9.999', '2.000', '2.375']]));
    expect(points).toEqual([]);
  });

  it('skips rows where a rate is not numeric', () => {
    const points = parseCbcPolicyRate(buildResponse([['20240322', 'N/A', '9.999', '2.000', '2.375']]));
    expect(points).toEqual([]);
  });

  it('skips non-array rows without throwing', () => {
    const points = parseCbcPolicyRate(buildResponse([null, undefined, 'not-a-row']));
    expect(points).toEqual([]);
  });

  it('parses multiple rows, preserving order', () => {
    const points = parseCbcPolicyRate(
      buildResponse([
        ['20230324', '4.125', '9.999', '1.875', '2.250'],
        ['20240322', '4.250', '9.999', '2.000', '2.375'],
      ])
    );
    expect(points.map((p) => p.discountRate)).toEqual([1.875, 2.0]);
    expect(points.map((p) => p.effectiveDate.toISOString().slice(0, 10))).toEqual(['2023-03-24', '2024-03-22']);
  });

  it('throws when data.structure is missing (CBC response shape changed)', () => {
    const raw = { meta: {}, data: { dataSets: [] } } as unknown as CbcApiResponse;
    expect(() => parseCbcPolicyRate(raw)).toThrow(/data\.structure/);
  });

  it('throws when a required column cannot be found by name', () => {
    const raw: CbcApiResponse = {
      meta: {},
      data: { structure: { Table1: [{ data: 'Discount' }, { data: 'Accommodations with collateral' }] }, dataSets: [] },
    };
    expect(() => parseCbcPolicyRate(raw)).toThrow(/Accommodations without collateral/);
  });

  it('throws when data.dataSets is missing (CBC response shape changed)', () => {
    const raw = {
      meta: {},
      data: {
        structure: {
          Table1: [{ data: 'Discount' }, { data: 'Accommodations with collateral' }, { data: 'Accommodations without collateral' }],
        },
      },
    } as unknown as CbcApiResponse;
    expect(() => parseCbcPolicyRate(raw)).toThrow(/data\.dataSets/);
  });
});
