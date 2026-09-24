import prisma from '@/adapters/prisma/index';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyStockMarketSummary } from '@/domains/monthlyStockMarketSummary/parser';
import type { MonthlyStockMarketSummaryPoint } from '@/domains/monthlyStockMarketSummary/types';

const ITEM_CODE = 'EG27M01en';
const EXPORT_DATASET = 'monthly_stock_market_summary'; // 對應 export.monthly_stock_market_summary view

export interface IngestMonthlyStockMarketSummaryResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyStockMarketSummaryPoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : new Date();
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 單次請求回傳 1987-M5 至今整段月資料（471 筆），整批寫入，寫法同 govBondYield10y。這些是月底/月內
// 的統計事實，CBC 不太會事後修正，不帶 force 的 skipDuplicates 路徑足夠。
export const ingestMonthlyStockMarketSummary = async (force = false): Promise<IngestMonthlyStockMarketSummaryResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseMonthlyStockMarketSummary(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyStockMarketSummary.deleteMany({}), prisma.monthlyStockMarketSummary.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const result = await prisma.monthlyStockMarketSummary.createMany({ data: points, skipDuplicates: true });
    fetched = result.count;
    skipped = points.length - result.count;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
