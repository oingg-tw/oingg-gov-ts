import prisma from '@/adapters/prisma/index';
import { fetchFredSeriesCsv } from '@/adapters/fred/client';
import {
  LEGACY_TARGET_SERIES,
  RANGE_LOWER_SERIES,
  RANGE_UPPER_SERIES,
  parseUsPolicyRate,
} from '@/domains/usPolicyRate/parser';
import type { UsPolicyRatePoint } from '@/domains/usPolicyRate/types';

const EXPORT_DATASET = 'us_policy_rate';

export interface IngestUsPolicyRateResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: UsPolicyRatePoint[], sourceLastModified: Date | null): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.effectiveDate > acc ? p.effectiveDate : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status, sourceLastModified },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 整批刪除重建，沒有 force 開關：三個序列 diff 出來的事件是整體推導的結果，不是逐筆累加，而且 Fed
// 偶爾會修正歷史值。約 190 筆，成本可忽略。分批理由見 shared/createManyChunked.ts（這裡筆數少，
// 一批就送完，但走同一套路徑保持一致）。
export const ingestUsPolicyRate = async (): Promise<IngestUsPolicyRateResult> => {
  let csvs: [string, string, string];
  let sourceLastModified: Date | null = null;
  try {
    // 三個序列循序抓，不平行——FRED 的 robots.txt 標 Crawl-delay: 1，而且這支一天只跑一次。
    const legacy = await fetchFredSeriesCsv(LEGACY_TARGET_SERIES);
    const upper = await fetchFredSeriesCsv(RANGE_UPPER_SERIES);
    const lower = await fetchFredSeriesCsv(RANGE_LOWER_SERIES);
    csvs = [legacy.content, upper.content, lower.content];
    // 取三者裡最新的 Last-Modified——代表「FRED 這組資料最後一次更新是什麼時候」。
    sourceLastModified = [legacy.lastModified, upper.lastModified, lower.lastModified].reduce<Date | null>(
      (acc, d) => (d && (!acc || d > acc) ? d : acc),
      null
    );
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: UsPolicyRatePoint[];
  try {
    points = parseUsPolicyRate(csvs[0], csvs[1], csvs[2]);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.usPolicyRate.deleteMany({});
      for (let offset = 0; offset < points.length; offset += 500) {
        await tx.usPolicyRate.createMany({ data: points.slice(offset, offset + 500) });
      }
    },
    { timeout: 30000 }
  );

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length };
};
