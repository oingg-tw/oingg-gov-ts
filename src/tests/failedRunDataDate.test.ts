import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestEcbPolicyRate } from '@/domains/ecbPolicyRate/service';

// 失敗的匯入沒抓到資料，data_date 要是 null；補成執行當天會讓只看 max(data_date) 的新鮮度查詢以為資料是新的。
const db = vi.hoisted(() => ({ ingestionRun: { create: vi.fn() } }));
vi.mock('@/adapters/prisma/index', () => ({ default: db }));
vi.mock('@/adapters/ecb/client', () => ({
  fetchEcbSeriesCsv: vi.fn(async () => {
    throw new Error('ECB Data Portal 下載失敗：HTTP 504');
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe('failed ingestion runs record no data date', () => {
  it('a source dated by its data (ECB) records null, not the run date', async () => {
    await expect(ingestEcbPolicyRate()).resolves.toMatchObject({ success: false });
    expect(db.ingestionRun.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'failed', dataDate: null }) });
  });
});
