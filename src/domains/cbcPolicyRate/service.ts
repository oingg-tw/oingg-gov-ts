import prisma from '@/adapters/prisma/index';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseCbcPolicyRate } from '@/domains/cbcPolicyRate/parser';
import type { CbcPolicyRatePoint } from '@/domains/cbcPolicyRate/types';

const ITEM_CODE = 'EG28D01en';
const EXPORT_DATASET = 'cbc_policy_rate'; // 對應 export.cbc_policy_rate view，見 prisma/schema.prisma 的 IngestionRun 註解

export interface IngestCbcPolicyRateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 記帳邏輯同 govBondYield10y/service.ts：analysis-ts 只認 status='success' 的紀錄，每次都要記；
// 失敗不能拖垮主要 ingest 結果。dataDate 取這批資料裡最新的生效日——這個序列的「新鮮度」就是
// 最近一次利率調整的日期，不是今天。
const recordIngestionRun = async (status: 'success' | 'failed', points: CbcPolicyRatePoint[]): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.effectiveDate > acc ? p.effectiveDate : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 單次請求回傳 1989-04-01 至今全部調整事件（目前 77 列），整批寫入，寫法同 govBondYield10y。
export const ingestCbcPolicyRate = async (force = false): Promise<IngestCbcPolicyRateResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseCbcPolicyRate(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.cbcPolicyRate.deleteMany({}), prisma.cbcPolicyRate.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const result = await prisma.cbcPolicyRate.createMany({ data: points, skipDuplicates: true });
    fetched = result.count;
    skipped = points.length - result.count;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
