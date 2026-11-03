import { describe, it, expect } from 'vitest';
import { parseMonthlyBusinessCycleIndicator } from '@/domains/monthlyBusinessCycleIndicator/parser';

const HEADER =
  '﻿"Date","領先指標綜合指數","領先指標不含趨勢指數","同時指標綜合指數","同時指標不含趨勢指數","落後指標綜合指數","落後指標不含趨勢指數","景氣對策信號綜合分數","景氣對策信號"';

describe('parseMonthlyBusinessCycleIndicator', () => {
  it('parses a normal row into a point', () => {
    const csv = `${HEADER}\n202607,138.6250095,104.6337283,141.5038118,106.8049538,138.836105,104.7914087,41,紅`;
    expect(parseMonthlyBusinessCycleIndicator(csv)).toEqual([
      {
        year: 2026,
        month: 7,
        leadingIndexComposite: 138.6250095,
        leadingIndexDetrended: 104.6337283,
        coincidentIndexComposite: 141.5038118,
        coincidentIndexDetrended: 106.8049538,
        laggingIndexComposite: 138.836105,
        laggingIndexDetrended: 104.7914087,
        signalScore: 41,
        signalLight: '紅',
      },
    ]);
  });

  it('treats "-" as a missing value, not zero (real early-1980s rows lack the signal columns)', () => {
    const csv = `${HEADER}\n198201,12.32815587,100.3449584,13.15273358,107.0671314,13.13630837,106.9334253,-,-`;
    const points = parseMonthlyBusinessCycleIndicator(csv);
    expect(points[0]?.signalScore).toBeNull();
    expect(points[0]?.signalLight).toBeNull();
    expect(points[0]?.leadingIndexComposite).toBe(12.32815587);
  });

  it('trims a trailing space in the signal light column (real value "黃藍 " observed)', () => {
    const csv = `${HEADER}\n202601,100,100,100,100,100,100,30,黃藍 `;
    expect(parseMonthlyBusinessCycleIndicator(csv)[0]?.signalLight).toBe('黃藍');
  });

  it('throws when the header does not match (format changed)', () => {
    const csv = 'Date,SomeOtherColumn\n202607,1';
    expect(() => parseMonthlyBusinessCycleIndicator(csv)).toThrow(/表頭欄位/);
  });

  it('throws on a malformed Date field or the wrong field count', () => {
    const csv = `${HEADER}\nnot-a-date,1,2,3,4,5,6,7,紅`;
    expect(() => parseMonthlyBusinessCycleIndicator(csv)).toThrow(/無法解析的年月/);
    expect(() => parseMonthlyBusinessCycleIndicator(`${HEADER}\n202601,1,2`)).toThrow(/3 欄（預期 9）/);
  });

  it('parses multiple rows', () => {
    const csv = `${HEADER}\n202601,1,2,3,4,5,6,7,紅\n202602,11,12,13,14,15,16,17,綠`;
    const points = parseMonthlyBusinessCycleIndicator(csv);
    expect(points.map((p) => p.month)).toEqual([1, 2]);
  });
});
