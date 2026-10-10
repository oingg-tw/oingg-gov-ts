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

import { applySupplements } from '@/domains/businessCycleReferenceDate/supplements';

describe('applySupplements', () => {
  const base = { troughStart: new Date(Date.UTC(2016, 1, 1)), peak: new Date(Date.UTC(2022, 0, 1)), troughEnd: null, expansionMonths: 71, contractionMonths: null, totalMonths: null };
  const sup = [{ cycleNo: 15, values: { troughEnd: new Date(Date.UTC(2023, 3, 1)), contractionMonths: 15, totalMonths: 86 }, source: 'NDC 2025-02-05' }];

  it('fills only the fields the dataset left empty, and records which', () => {
    const [p] = applySupplements([{ cycleNo: 15, ...base }], sup, () => {});
    expect(p!.troughEnd?.toISOString().slice(0, 10)).toBe('2023-04-01');
    expect(p!.supplementedFields.sort()).toEqual(['contractionMonths', 'totalMonths', 'troughEnd']);
    expect(p!.supplementSource).toBe('NDC 2025-02-05');
    expect(p!.expansionMonths).toBe(71); // 資料集原值不動
  });

  it('keeps the dataset value and warns when the two disagree', () => {
    const warnings: string[] = [];
    const [p] = applySupplements([{ cycleNo: 15, ...base, contractionMonths: 14 }], sup, (m) => warnings.push(m));
    expect(p!.contractionMonths).toBe(14);
    expect(p!.supplementedFields).not.toContain('contractionMonths');
    expect(warnings.join()).toMatch(/不一致/);
  });

  it('marks nothing as supplemented once the dataset has caught up', () => {
    const caughtUp = { ...base, troughEnd: new Date(Date.UTC(2023, 3, 1)), contractionMonths: 15, totalMonths: 86 };
    const [p] = applySupplements([{ cycleNo: 15, ...caughtUp }], sup, () => {});
    expect(p!.supplementedFields).toEqual([]);
    expect(p!.supplementSource).toBeNull();
  });

  it('creates a row the dataset does not have yet', () => {
    const points = applySupplements([], [{ cycleNo: 16, values: { troughStart: new Date(Date.UTC(2023, 3, 1)) }, source: 'NDC' }], () => {});
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ cycleNo: 16, peak: null, troughEnd: null, supplementedFields: ['troughStart'] });
  });
});
