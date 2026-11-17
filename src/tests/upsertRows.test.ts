import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { upsertRows } from '@/shared/upsertRows';

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock('@/adapters/prisma/index', () => ({ default: db }));

beforeEach(() => vi.clearAllMocks());

describe('upsertRows (same-key overwrite)', () => {
  it('maps fields to @map columns, updates only changed rows, and counts per chunk', async () => {
    db.$queryRaw.mockResolvedValueOnce([{ inserted: true }, { inserted: false }]).mockResolvedValueOnce([]);
    const rows = [
      { year: 2026, month: 8, depositRate1m: 1.5, depositRate1y: 1.7, baseLendingRate: 2.9 },
      { year: 2026, month: 9, depositRate1m: 1.5, depositRate1y: 1.7, baseLendingRate: 2.9 },
      { year: 2026, month: 10, depositRate1m: null, depositRate1y: 1.7, baseLendingRate: 2.9 },
    ];

    await expect(upsertRows('MonthlyFiveMajorBankRate', ['year', 'month'], rows, 2)).resolves.toEqual({ inserted: 1, updated: 1 });

    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    const first = Prisma.sql(...(db.$queryRaw.mock.calls[0] as [string[], ...unknown[]]));
    expect(first.sql).toContain('INSERT INTO "public"."monthly_five_major_bank_rate" AS t ("year", "month", "deposit_rate_1m", "deposit_rate_1y", "base_lending_rate")');
    expect(first.sql).toContain('ON CONFLICT ("year", "month") DO UPDATE SET "deposit_rate_1m" = EXCLUDED."deposit_rate_1m"');
    expect(first.sql).toContain(
      'WHERE (t."deposit_rate_1m", t."deposit_rate_1y", t."base_lending_rate") IS DISTINCT FROM (EXCLUDED."deposit_rate_1m", EXCLUDED."deposit_rate_1y", EXCLUDED."base_lending_rate")'
    );
    expect(first.values).toEqual([2026, 8, 1.5, 1.7, 2.9, 2026, 9, 1.5, 1.7, 2.9]);
    expect(Prisma.sql(...(db.$queryRaw.mock.calls[1] as [string[], ...unknown[]])).values).toEqual([2026, 10, null, 1.7, 2.9]);
  });

  it('rejects a field the model does not have', async () => {
    await expect(upsertRows('MonthlyCpi', ['year'], [{ year: 2026, nope: 1 }])).rejects.toThrow('MonthlyCpi 沒有欄位 nope');
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
