import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchShareholdingDistributionCsv } from '@/adapters/tdcc/client';
import { parseTdccShareholdingDistribution } from '@/domains/tdccShareholdingDistribution/parser';
import type { TdccShareholdingDistributionPoint } from '@/domains/tdccShareholdingDistribution/types';

const EXPORT_DATASET = 'v_tdcc_shareholding_distributions'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestTdccShareholdingDistributionResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: TdccShareholdingDistributionPoint[]): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.dataDate > acc ? p.dataDate : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest ?? new Date(), rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 只新增、不刪除，刻意沒有 force：來源只有最新一期，表裡的舊期數是官方再也給不出來的歷史，整批刪除
// 重建會把它們永久清掉。同一期每天重抓靠 (symbol, data_date, holding_level) 主鍵 + skipDuplicates 跳過。
export const ingestTdccShareholdingDistribution = async (): Promise<IngestTdccShareholdingDistributionResult> => {
  let points: TdccShareholdingDistributionPoint[];
  try {
    points = parseTdccShareholdingDistribution(await fetchShareholdingDistributionCsv());
    if (points.length === 0) throw new Error('集保股權分散表解析後沒有任何資料列。');
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const inserted = await createManyChunked(
    (rows) => prisma.tdccShareholdingDistribution.createMany({ data: rows, skipDuplicates: true }),
    points
  );

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched: inserted, skipped: points.length - inserted };
};
