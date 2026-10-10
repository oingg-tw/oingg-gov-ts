import prisma from '@/adapters/prisma/index';
import { fetchBusinessCycleReferenceDatesCsv } from '@/adapters/ndc/client';
import { parseBusinessCycleReferenceDates } from '@/domains/businessCycleReferenceDate/parser';
import type { BusinessCycleReferenceDatePoint } from '@/domains/businessCycleReferenceDate/types';
import { applySupplements, type SupplementedPoint } from '@/domains/businessCycleReferenceDate/supplements';

const EXPORT_DATASET = 'business_cycle_reference_date';

export interface IngestBusinessCycleReferenceDateResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: BusinessCycleReferenceDatePoint[]): Promise<void> => {
  try {
    // dataDate 取所有已認定轉折點（谷底1/高峰/谷底2）裡最新的那個月——那才是這份資料「新鮮到哪裡」。
    const latest = points
      .flatMap((p) => [p.troughStart, p.peak, p.troughEnd])
      .reduce<Date | null>((acc, d) => (d && (!acc || d > acc) ? d : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 整批刪除重建，沒有 force 開關：最新一次循環的高峰／谷底會在國發會認定後才補上，既有列會被「更新」
// 而不只是新增，skipDuplicates 那套接不住。只有十幾列。
export const ingestBusinessCycleReferenceDate = async (): Promise<IngestBusinessCycleReferenceDateResult> => {
  let points: SupplementedPoint[];
  try {
    // 先照資料集原樣解析，再用國發會原始公告補資料集留空的欄位（見 supplements.ts）。
    points = applySupplements(parseBusinessCycleReferenceDates(await fetchBusinessCycleReferenceDatesCsv()));
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.businessCycleReferenceDate.deleteMany({});
      await tx.businessCycleReferenceDate.createMany({ data: points });
    },
    { timeout: 30000 }
  );

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length };
};
