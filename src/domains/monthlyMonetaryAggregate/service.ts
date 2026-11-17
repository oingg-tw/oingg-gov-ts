import prisma from '@/adapters/prisma/index';
import { upsertRows } from '@/shared/upsertRows';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyMonetaryAggregate } from '@/domains/monthlyMonetaryAggregate/parser';
import type { MonthlyMonetaryAggregatePoint } from '@/domains/monthlyMonetaryAggregate/types';

const ITEM_CODE = 'EF15M01en';
export const EXPORT_DATASET = 'v_monthly_monetary_aggregates'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestMonthlyMonetaryAggregateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 記帳邏輯同 govBondYield10y/service.ts；dataDate 取這批資料裡最新的年月。
const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyMonetaryAggregatePoint[]): Promise<void> => {
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

// 單次請求回傳 1987-M5 至今整段月資料（471 筆），整批寫入，寫法同 govBondYield10y。CBC 會回頭修正近期
// 月份的數字（金融統計月報有修正值）：不帶 force 時同鍵覆寫（shared/upsertRows.ts），修正值每天自動進來。
export const ingestMonthlyMonetaryAggregate = async (force = false): Promise<IngestMonthlyMonetaryAggregateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseMonthlyMonetaryAggregate(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyMonetaryAggregate.deleteMany({}), prisma.monthlyMonetaryAggregate.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const { inserted, updated } = await upsertRows('MonthlyMonetaryAggregate', ['year', 'month'], points);
    fetched = inserted + updated;
    skipped = points.length - fetched;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
