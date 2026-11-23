import prisma from '@/adapters/prisma/index';
import { upsertRows } from '@/shared/upsertRows';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyMonetaryAggregate, parseMonthlyMonetaryAggregateComponents } from '@/domains/monthlyMonetaryAggregate/parser';
import type { MonthlyMonetaryAggregatePoint } from '@/domains/monthlyMonetaryAggregate/types';

const ITEM_CODE = 'EF15M01en';
export const EXPORT_DATASET = 'v_monthly_monetary_aggregates'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestMonthlyMonetaryAggregateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  componentPoints?: number; // 全部 15 項的長表列數（monthly_monetary_aggregate_component）
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
// 2026-11-23 起同一份回應也寫全部 15 項（monthly_monetary_aggregate_component → v_monthly_monetary_aggregate_components），
// 不另開 job 重抓。ingestion_runs 仍記在 v_monthly_monetary_aggregates 底下，列數是寬表那張的。
export const ingestMonthlyMonetaryAggregate = async (force = false): Promise<IngestMonthlyMonetaryAggregateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  let components;
  try {
    points = parseMonthlyMonetaryAggregate(raw);
    components = parseMonthlyMonetaryAggregateComponents(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction(
      [
        prisma.monthlyMonetaryAggregate.deleteMany({}),
        prisma.monthlyMonetaryAggregate.createMany({ data: points }),
        prisma.monthlyMonetaryAggregateComponent.deleteMany({}),
        prisma.monthlyMonetaryAggregateComponent.createMany({ data: components }),
      ],
      { timeout: 30000 }
    );
    fetched = points.length;
    skipped = 0;
  } else {
    const { inserted, updated } = await upsertRows('MonthlyMonetaryAggregate', ['year', 'month'], points);
    fetched = inserted + updated;
    skipped = points.length - fetched;
    await upsertRows('MonthlyMonetaryAggregateComponent', ['year', 'month', 'category'], components);
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped, componentPoints: components.length };
};
