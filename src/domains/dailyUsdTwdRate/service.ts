import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseDailyUsdTwdRate } from '@/domains/dailyUsdTwdRate/parser';
import type { DailyUsdTwdRatePoint } from '@/domains/dailyUsdTwdRate/types';

const ITEM_CODE = 'EG51D01en';
const EXPORT_DATASET = 'daily_usd_twd_rate'; // 對應 export.daily_usd_twd_rate view

export interface IngestDailyUsdTwdRateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 記帳邏輯同 govBondYield10y/service.ts；dataDate 取這批資料裡最新的交易日——CBC 這份是按月批次補的，
// 「最新交易日」通常是上個月底，這就是它的真實新鮮度。
const recordIngestionRun = async (status: 'success' | 'failed', points: DailyUsdTwdRatePoint[]): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.tradeDate > acc ? p.tradeDate : acc), null);
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 單次請求回傳 1992-01-04 至今全部交易日（約 9,000 筆），整批寫入，寫法同 govBondYield10y。歷史匯率
// 是成交事實，不會被事後修正，不帶 force 的 skipDuplicates 路徑足夠。
export const ingestDailyUsdTwdRate = async (force = false): Promise<IngestDailyUsdTwdRateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseDailyUsdTwdRate(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.dailyUsdTwdRate.deleteMany({}), prisma.dailyUsdTwdRate.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.dailyUsdTwdRate.createMany({ data: rows, skipDuplicates: true }), points);
    fetched = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
