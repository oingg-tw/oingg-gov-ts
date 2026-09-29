import prisma from '@/adapters/prisma/index';
import { fetchEcbSeriesCsv } from '@/adapters/ecb/client';
import {
  DEPOSIT_FACILITY_SERIES,
  MAIN_REFINANCING_FIXED_SERIES,
  MAIN_REFINANCING_MIN_BID_SERIES,
  MARGINAL_LENDING_SERIES,
  parseEcbPolicyRate,
} from '@/domains/ecbPolicyRate/parser';
import type { EcbPolicyRatePoint } from '@/domains/ecbPolicyRate/types';

const EXPORT_DATASET = 'ecb_policy_rate';

export interface IngestEcbPolicyRateResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: EcbPolicyRatePoint[], sourceLastModified: Date | null): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.effectiveDate > acc ? p.effectiveDate : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status, sourceLastModified },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 整批刪除重建，沒有 force 開關——理由跟 usPolicyRate 一樣：事件序列是四支序列整體 diff 出來的結果，
// 不是逐筆累加。約 70 筆。
export const ingestEcbPolicyRate = async (): Promise<IngestEcbPolicyRateResult> => {
  let csvs: [string, string, string, string];
  let sourceLastModified: Date | null = null;
  try {
    // 四支循序抓，不平行——一天只跑一次，沒有理由同時打四個請求到同一個公務機關端點。
    const deposit = await fetchEcbSeriesCsv(DEPOSIT_FACILITY_SERIES);
    const marginal = await fetchEcbSeriesCsv(MARGINAL_LENDING_SERIES);
    const mainFixed = await fetchEcbSeriesCsv(MAIN_REFINANCING_FIXED_SERIES);
    const mainMinBid = await fetchEcbSeriesCsv(MAIN_REFINANCING_MIN_BID_SERIES);
    csvs = [deposit.content, marginal.content, mainFixed.content, mainMinBid.content];
    sourceLastModified = [deposit.lastModified, marginal.lastModified, mainFixed.lastModified, mainMinBid.lastModified].reduce<Date | null>(
      (acc, d) => (d && (!acc || d > acc) ? d : acc),
      null
    );
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: EcbPolicyRatePoint[];
  try {
    points = parseEcbPolicyRate(csvs[0], csvs[1], csvs[2], csvs[3]);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.ecbPolicyRate.deleteMany({});
      for (let offset = 0; offset < points.length; offset += 500) {
        await tx.ecbPolicyRate.createMany({ data: points.slice(offset, offset + 500) });
      }
    },
    { timeout: 30000 }
  );

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length };
};
