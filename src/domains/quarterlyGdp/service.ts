import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchDgbasXml } from '@/adapters/dgbas/client';
import { parseQuarterlyGdp } from '@/domains/quarterlyGdp/parser';
import type { QuarterlyGdpPoint } from '@/domains/quarterlyGdp/types';

const GDP_XML_URL = 'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230514/na8102a7q.xml';
const EXPORT_DATASET = 'quarterly_gdp'; // 對應 export.quarterly_gdp view

export interface IngestQuarterlyGdpResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: QuarterlyGdpPoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; quarter: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.quarter > acc.quarter)) return { year: p.year, quarter: p.quarter };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, (latest.quarter - 1) * 3, 1)) : new Date();

    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 跟 monthlyCpi/govBondYield10y 逐點 findUnique+upsert 的寫法不同——GDP 一次 ingest 有 ~2,200 筆，
// 逐筆兩次資料庫往返（先查存不存在、再寫）在 Neon 的網路延遲下會拖到分鐘等級（CPI 4,376 筆實測跑了
// 將近 10 分鐘）。這裡改成整批寫入：force 時整批刪除重建（一次 DELETE + 一次 INSERT），不 force 時
// 用 createMany({ skipDuplicates: true }) 讓資料庫的唯一約束直接處理「已存在就跳過」，一次 INSERT
// 打完，不用先查一輪存不存在。
export const ingestQuarterlyGdp = async (force = false): Promise<IngestQuarterlyGdpResult> => {
  let xml: string;
  try {
    xml = await fetchDgbasXml(GDP_XML_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: QuarterlyGdpPoint[];
  try {
    points = parseQuarterlyGdp(xml);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({
    year: p.year,
    quarter: p.quarter,
    category: p.category,
    contributionPoints: p.contributionPoints,
    yoyChangePercent: p.yoyChangePercent,
  }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.quarterlyGdp.deleteMany({}), prisma.quarterlyGdp.createMany({ data })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.quarterlyGdp.createMany({ data: rows, skipDuplicates: true }), data);
    fetched = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
