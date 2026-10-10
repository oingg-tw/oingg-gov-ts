import { describe, it, expect } from 'vitest';
import { parseBusinessCycleReferenceDates } from '@/domains/businessCycleReferenceDate/parser';

const HEADER = '\uFEFF循環次序,谷底1(日期),高峰(日期),谷底2(日期),擴張期,收縮期,全循環';
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('parseBusinessCycleReferenceDates', () => {
  it('parses a completed cycle into month dates and source month counts', () => {
    const [p] = parseBusinessCycleReferenceDates(`${HEADER}\n第14循環,201201,201401,201602,33,16,49\n`);
    expect({ ...p, troughStart: iso(p!.troughStart), peak: iso(p!.peak), troughEnd: iso(p!.troughEnd) }).toEqual({
      cycleNo: 14, troughStart: '2012-01-01', peak: '2014-01-01', troughEnd: '2016-02-01',
      expansionMonths: 33, contractionMonths: 16, totalMonths: 49,
    });
  });

  it('keeps the not-yet-dated stages of the current cycle as null', () => {
    const [p] = parseBusinessCycleReferenceDates(`${HEADER}\n第15循環,201602,202201,,71,,\n`);
    expect(p).toMatchObject({ cycleNo: 15, troughEnd: null, contractionMonths: null, totalMonths: null, expansionMonths: 71 });
  });

  it('skips the 平均 summary row', () => {
    const points = parseBusinessCycleReferenceDates(`${HEADER}\n第1循環,195411,195511,195609,12,10,22\n平均,,,,40,15,53\n`);
    expect(points.map((p) => p.cycleNo)).toEqual([1]);
  });

  it('throws on an unrecognised row instead of guessing', () => {
    expect(() => parseBusinessCycleReferenceDates(`${HEADER}\n小計,,,,1,1,2\n`)).toThrow(/無法辨識/);
  });

  it('throws on a non-YYYYMM date', () => {
    expect(() => parseBusinessCycleReferenceDates(`${HEADER}\n第1循環,1954-11,195511,195609,12,10,22\n`)).toThrow(/YYYYMM/);
  });

  it('throws when the header changes', () => {
    expect(() => parseBusinessCycleReferenceDates('循環,谷底,高峰\n第1循環,195411,195511\n')).toThrow(/表頭不符/);
  });
});
