import { describe, it, expect } from 'vitest';
import { parseUsPolicyRate } from '@/domains/usPolicyRate/parser';

const legacy = (rows: string) => `observation_date,DFEDTAR\n${rows}`;
const upper = (rows: string) => `observation_date,DFEDTARU\n${rows}`;
const lower = (rows: string) => `observation_date,DFEDTARL\n${rows}`;

describe('parseUsPolicyRate', () => {
  it('collapses daily held-constant values into one row per change', () => {
    const points = parseUsPolicyRate(
      legacy('1982-09-27,10.2500\n1982-09-28,10.2500\n1982-09-29,10.0000\n'),
      upper(''),
      lower('')
    );
    expect(points.map((p) => [p.effectiveDate.toISOString().slice(0, 10), p.targetUpper])).toEqual([
      ['1982-09-27', 10.25],
      ['1982-09-29', 10.0],
    ]);
  });

  it('stores the single-target era with upper equal to lower', () => {
    const [point] = parseUsPolicyRate(legacy('2008-12-15,1.0000\n'), upper(''), lower(''));
    expect(point).toMatchObject({ targetUpper: 1, targetLower: 1 });
  });

  it('stitches the 2008 boundary in date order', () => {
    const points = parseUsPolicyRate(
      legacy('2008-12-15,1.0000\n'),
      upper('2008-12-16,0.25\n2008-12-17,0.25\n'),
      lower('2008-12-16,0.00\n2008-12-17,0.00\n')
    );
    expect(points.map((p) => p.effectiveDate.toISOString().slice(0, 10))).toEqual(['2008-12-15', '2008-12-16']);
    expect(points[1]).toMatchObject({ targetUpper: 0.25, targetLower: 0 });
  });

  it('treats a change in only one side of the range as a change', () => {
    const points = parseUsPolicyRate(
      legacy(''),
      upper('2026-01-01,4.00\n2026-01-02,4.00\n'),
      lower('2026-01-01,3.75\n2026-01-02,3.50\n')
    );
    expect(points).toHaveLength(2);
    expect(points[1]).toMatchObject({ targetUpper: 4, targetLower: 3.5 });
  });

  it('skips a day where only one side of the range is present', () => {
    const points = parseUsPolicyRate(legacy(''), upper('2026-01-01,4.00\n2026-01-02,4.25\n'), lower('2026-01-01,3.75\n'));
    expect(points.map((p) => p.effectiveDate.toISOString().slice(0, 10))).toEqual(['2026-01-01']);
  });

  it("skips FRED's missing-value marker", () => {
    const points = parseUsPolicyRate(legacy('1982-09-27,.\n1982-09-28,10.2500\n'), upper(''), lower(''));
    expect(points.map((p) => p.effectiveDate.toISOString().slice(0, 10))).toEqual(['1982-09-28']);
  });

  it('throws when a series header changes (series renamed or replaced)', () => {
    expect(() => parseUsPolicyRate('observation_date,FEDFUNDS\n2026-01-01,4.0\n', upper(''), lower(''))).toThrow(/DFEDTAR/);
  });
});
