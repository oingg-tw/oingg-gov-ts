import prisma from '@/adapters/prisma/index';
import { fetchFredSeriesCsv } from '@/adapters/fred/client';
import { FRED_SERIES_ID, parseQuarterlyUsGnpDeflator } from '@/domains/quarterlyUsGnpDeflator/parser';
import type { QuarterlyUsGnpDeflatorPoint } from '@/domains/quarterlyUsGnpDeflator/types';

const EXPORT_DATASET = 'quarterly_us_gnp_deflator'; // 對應 export.quarterly_us_gnp_deflator view

export interface IngestQuarterlyUsGnpDeflatorResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (
  status: 'success' | 'failed',
  points: QuarterlyUsGnpDeflatorPoint[],
  sourceLastModified: Date | null
): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; quarter: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.quarter > acc.quarter)) return { year: p.year, quarter: p.quarter };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, (latest.quarter - 1) * 3, 1)) : new Date();
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status, sourceLastModified } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 跟其他 CBC/DGBAS domain 不同，這裡**每次都整批刪除重建**、沒有 force 開關：BEA 每季發布後接下來兩個
// 月還會各修正一次（advance → second → third estimate），連同歷史年度修正，FRED 拿到就整份重發。
// 這個序列只有 300 多筆，每月重建一次的成本可忽略，比「skipDuplicates 永遠留著第一次抓到的
// advance 值」正確——它是 O-Score 的除數，用舊值會讓下游安靜地算錯。
export const ingestQuarterlyUsGnpDeflator = async (): Promise<IngestQuarterlyUsGnpDeflatorResult> => {
  let csv: string;
  let sourceLastModified: Date | null;
  try {
    const fetched = await fetchFredSeriesCsv(FRED_SERIES_ID);
    csv = fetched.content;
    sourceLastModified = fetched.lastModified;
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: QuarterlyUsGnpDeflatorPoint[];
  try {
    points = parseQuarterlyUsGnpDeflator(csv);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction([prisma.quarterlyUsGnpDeflator.deleteMany({}), prisma.quarterlyUsGnpDeflator.createMany({ data: points })], { timeout: 30000 });

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length };
};
