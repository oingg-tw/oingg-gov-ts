import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyFiveMajorBankRate } from '@/domains/monthlyFiveMajorBankRate/parser';
import type { MonthlyFiveMajorBankRatePoint } from '@/domains/monthlyFiveMajorBankRate/types';

const ITEM_CODE = 'EG2BM01en';
const EXPORT_DATASET = 'v_monthly_five_major_bank_rates'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestMonthlyFiveMajorBankRateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyFiveMajorBankRatePoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : new Date();

    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 跟 govBondYield10y 同一套寫法：單次請求就拿到 1987-M1 至今整段月資料，整批寫入；force 時刪除重建，
// 不 force 時用 createMany({ skipDuplicates: true }) 讓唯一約束處理「已存在就跳過」。476 列。
export const ingestMonthlyFiveMajorBankRate = async (force = false): Promise<IngestMonthlyFiveMajorBankRateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseMonthlyFiveMajorBankRate(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({
    year: p.year,
    month: p.month,
    depositRate1m: p.depositRate1m,
    depositRate1y: p.depositRate1y,
    baseLendingRate: p.baseLendingRate,
  }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction(
      [prisma.monthlyFiveMajorBankRate.deleteMany({}), prisma.monthlyFiveMajorBankRate.createMany({ data })],
      { timeout: 30000 }
    );
    fetched = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked(
      (rows) => prisma.monthlyFiveMajorBankRate.createMany({ data: rows, skipDuplicates: true }),
      data
    );
    fetched = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
