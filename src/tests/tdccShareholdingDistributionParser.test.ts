import { describe, it, expect } from 'vitest';
import { parseTdccShareholdingDistribution } from '@/domains/tdccShareholdingDistribution/parser';

const HEADER = '資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%';

describe('parseTdccShareholdingDistribution', () => {
  it('parses real 0050 rows and trims the space-padded symbol (2026-10-28 live file, data date 20261022)', () => {
    const csv = `${HEADER}\r\n20261022,0050  ,16,1,1684,0.00\r\n20261022,0050  ,17,3720414,23055000000,100.00\r\n`;
    expect(parseTdccShareholdingDistribution(csv)).toEqual([
      { symbol: '0050', dataDate: new Date(Date.UTC(2026, 9, 22)), holdingLevel: 16, holderCount: 1n, shares: 1684n, custodyPct: '0.00' },
      { symbol: '0050', dataDate: new Date(Date.UTC(2026, 9, 22)), holdingLevel: 17, holderCount: 3720414n, shares: 23055000000n, custodyPct: '100.00' },
    ]);
  });

  it('keeps all-zero rows — a bracket with nobody in it is a fact, not missing data', () => {
    const points = parseTdccShareholdingDistribution(`${HEADER}\n20261022,000218,1,0,0,0.00`);
    expect(points).toHaveLength(1);
    expect(points[0]?.shares).toBe(0n);
  });

  it('keeps shares beyond Number.MAX_SAFE_INTEGER exact (bigint, not float)', () => {
    const points = parseTdccShareholdingDistribution(`${HEADER}\n20261022,2330  ,17,1,9007199254740993,100.00`);
    expect(points[0]?.shares).toBe(9007199254740993n);
  });

  it('throws on an unexpected header instead of guessing the column order', () => {
    expect(() => parseTdccShareholdingDistribution('資料日期,證券代號,持股分級,人數,股數\n20261022,0050,1,1,1')).toThrow();
  });

  it('skips malformed rows', () => {
    const csv = `${HEADER}\n20261022,0050,1,1,1\n2026-10-22,0050,1,1,1,0.00\n20261022,,1,1,1,0.00\n20261022,0050,1,-,1,0.00`;
    expect(parseTdccShareholdingDistribution(csv)).toEqual([]);
  });
});
