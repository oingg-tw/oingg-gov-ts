import prisma from '@/adapters/prisma/index';
import { fetchBusinessCycleIndicatorCsv } from '@/adapters/ndc/client';
import { parseMonthlyBusinessCycleIndicator } from '@/domains/monthlyBusinessCycleIndicator/parser';
import type { MonthlyBusinessCycleIndicatorPoint } from '@/domains/monthlyBusinessCycleIndicator/types';

const EXPORT_DATASET = 'monthly_business_cycle_indicator'; // 對應 export.monthly_business_cycle_indicator view

export interface IngestMonthlyBusinessCycleIndicatorResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyBusinessCycleIndicatorPoint[]): Promise<void> => {
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
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 跟 quarterlyGdp/monthlyUnemploymentRate 一樣用整批寫入（見那兩個 service.ts 的說明）——這個
// domain 每次 ingest 只有 ~540 筆（一個月一列，沒有 category 維度），量不大，但統一寫法比較好維護。
export const ingestMonthlyBusinessCycleIndicator = async (force = false): Promise<IngestMonthlyBusinessCycleIndicatorResult> => {
  let csv: string;
  try {
    csv = await fetchBusinessCycleIndicatorCsv();
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: MonthlyBusinessCycleIndicatorPoint[];
  try {
    points = parseMonthlyBusinessCycleIndicator(csv);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({
    year: p.year,
    month: p.month,
    leadingIndexComposite: p.leadingIndexComposite,
    leadingIndexDetrended: p.leadingIndexDetrended,
    coincidentIndexComposite: p.coincidentIndexComposite,
    coincidentIndexDetrended: p.coincidentIndexDetrended,
    laggingIndexComposite: p.laggingIndexComposite,
    laggingIndexDetrended: p.laggingIndexDetrended,
    signalScore: p.signalScore,
    signalLight: p.signalLight,
  }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyBusinessCycleIndicator.deleteMany({}), prisma.monthlyBusinessCycleIndicator.createMany({ data })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const result = await prisma.monthlyBusinessCycleIndicator.createMany({ data, skipDuplicates: true });
    fetched = result.count;
    skipped = points.length - result.count;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
