import prisma from '@/adapters/prisma/index';
import { upsertRows } from '@/shared/upsertRows';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyMoneyMarketRates } from '@/domains/monthlyMoneyMarketRate/parser';
import type { MonthlyMoneyMarketRatePoint } from '@/domains/monthlyMoneyMarketRate/types';

const ITEM_CODE = 'EG41M01en';
export const EXPORT_DATASET = 'v_monthly_money_market_rates'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestMonthlyMoneyMarketRateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 記帳邏輯同 govBondYield10y/service.ts；dataDate 取這批資料裡最新的年月。
const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyMoneyMarketRatePoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : null;
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status } });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 單次請求回傳 1987-M5 至今整段月資料（約 7 千列），整批寫入，寫法同 govBondYield10y。不帶 force 時同鍵覆寫
// （shared/upsertRows.ts），央行回頭修正的月份每天自動進來；force 時整批刪除重建。
export const ingestMonthlyMoneyMarketRate = async (force = false): Promise<IngestMonthlyMoneyMarketRateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseMonthlyMoneyMarketRates(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyMoneyMarketRate.deleteMany({}), prisma.monthlyMoneyMarketRate.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const { inserted, updated } = await upsertRows('MonthlyMoneyMarketRate', ['year', 'month', 'category'], points);
    fetched = inserted + updated;
    skipped = points.length - fetched;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
