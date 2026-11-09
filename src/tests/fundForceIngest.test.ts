import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestFundBasicInfo } from '@/domains/fundBasicInfo/service';
import { ingestFundDailyNav } from '@/domains/fundDailyNav/service';

// 這兩個來源只有最近 2 個交易日／當月快照，force 若整表刪除，來源補不回來的歷史就沒了。
const db = vi.hoisted(() => ({
  fundDailyNav: { deleteMany: vi.fn(), createMany: vi.fn() },
  fundBasicInfo: { deleteMany: vi.fn(), createMany: vi.fn() },
  ingestionRun: { create: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('@/adapters/prisma/index', () => ({ default: db }));
vi.mock('@/adapters/sitca/client', () => ({ fetchSitcaCsv: vi.fn(async () => ({ content: '', lastModified: null })) }));
vi.mock('@/domains/fundDailyNav/parser', () => ({
  parseFundDailyNav: () => [
    { tradeDate: new Date(Date.UTC(2026, 10, 5)), beneficiaryCode: 'A' },
    { tradeDate: new Date(Date.UTC(2026, 10, 5)), beneficiaryCode: 'B' },
    { tradeDate: new Date(Date.UTC(2026, 10, 6)), beneficiaryCode: 'A' },
  ],
}));
vi.mock('@/domains/fundBasicInfo/parser', () => ({
  parseFundBasicInfo: () => [
    { year: 2026, month: 9, isinCode: 'TW000001' },
    { year: 2026, month: 9, isinCode: 'TW000002' },
  ],
}));

beforeEach(() => vi.clearAllMocks());

describe('force ingest of snapshot-only SITCA sources', () => {
  it('fund daily NAV deletes only the trade dates in the file', async () => {
    await expect(ingestFundDailyNav(true)).resolves.toMatchObject({ success: true, totalPoints: 3 });
    expect(db.fundDailyNav.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.fundDailyNav.deleteMany).toHaveBeenCalledWith({
      where: { tradeDate: { in: [new Date(Date.UTC(2026, 10, 5)), new Date(Date.UTC(2026, 10, 6))] } },
    });
  });

  it('fund basic info deletes only the year-months in the file', async () => {
    await expect(ingestFundBasicInfo(true)).resolves.toMatchObject({ success: true, totalPoints: 2 });
    expect(db.fundBasicInfo.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.fundBasicInfo.deleteMany).toHaveBeenCalledWith({ where: { OR: [{ year: 2026, month: 9 }] } });
  });
});
