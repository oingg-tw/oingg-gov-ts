import { describe, it, expect } from 'vitest';
import { parseQuarterlyUsGnpDeflator } from '@/domains/quarterlyUsGnpDeflator/parser';

describe('parseQuarterlyUsGnpDeflator', () => {
  it('parses quarter-start dates into (year, quarter) and keeps the raw index value', () => {
    const csv = 'observation_date,GNPDEF\n1968-01-01,17.948\n1968-04-01,18.137\n2026-04-01,133.758\n';
    expect(parseQuarterlyUsGnpDeflator(csv)).toEqual([
      { year: 1968, quarter: 1, indexValue: 17.948 },
      { year: 1968, quarter: 2, indexValue: 18.137 },
      { year: 2026, quarter: 2, indexValue: 133.758 },
    ]);
  });

  it('tolerates BOM and CRLF line endings', () => {
    const csv = '﻿observation_date,GNPDEF\r\n1947-10-01,11.746\r\n';
    expect(parseQuarterlyUsGnpDeflator(csv)).toEqual([{ year: 1947, quarter: 4, indexValue: 11.746 }]);
  });

  it('skips FRED\'s "." missing-value marker', () => {
    const csv = 'observation_date,GNPDEF\n2026-01-01,.\n2026-04-01,133.758\n';
    expect(parseQuarterlyUsGnpDeflator(csv)).toEqual([{ year: 2026, quarter: 2, indexValue: 133.758 }]);
  });

  it('throws when the header names a different series', () => {
    expect(() => parseQuarterlyUsGnpDeflator('observation_date,GDPDEF\n2026-01-01,1\n')).toThrow(/表頭不符/);
  });

  it('throws when a date is not the first day of a quarter (frequency changed)', () => {
    expect(() => parseQuarterlyUsGnpDeflator('observation_date,GNPDEF\n2026-02-01,1\n')).toThrow(/非季首日/);
  });
});
