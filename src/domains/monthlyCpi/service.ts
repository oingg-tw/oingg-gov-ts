import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchDgbasXml } from '@/adapters/dgbas/client';
import { parseMonthlyCpi } from '@/domains/monthlyCpi/parser';
import type { MonthlyCpiPoint } from '@/domains/monthlyCpi/types';

// 主計總處固定路徑統計檔案，沒有查詢參數，每次都回傳整段歷史（1981M01 至今）。
const CPI_XML_URL = 'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml';
const EXPORT_DATASET = 'monthly_cpi'; // 對應 export.monthly_cpi view

export interface IngestMonthlyCpiResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 跟 govBondYield10y 同樣的道理：analysis-ts 只認 export.ingestion_runs 裡 status='success' 的紀錄，
// 這是輔助性記帳動作，失敗不能讓主要 ingest 結果跟著失敗。
const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyCpiPoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : new Date();

    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 跟 quarterlyGdp/monthlyUnemploymentRate 一樣用整批寫入，不是逐點 findUnique+upsert——這個 domain
// 4,376 筆，逐點兩次資料庫往返在 Neon 的網路延遲下實測跑了近 10 分鐘，改成 createMany 之後幾秒鐘
// 就能跑完（見 quarterlyGdp/service.ts 的說明，同一套理由）。force 時整批刪除重建，不 force 時用
// createMany({ skipDuplicates: true }) 讓 (year, month, category) 的唯一約束處理「已存在就跳過」。
export const ingestMonthlyCpi = async (force = false): Promise<IngestMonthlyCpiResult> => {
  let xml: string;
  try {
    xml = await fetchDgbasXml(CPI_XML_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: MonthlyCpiPoint[];
  try {
    points = parseMonthlyCpi(xml);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({ year: p.year, month: p.month, category: p.category, indexValue: p.indexValue, yoyChangePercent: p.yoyChangePercent }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyCpi.deleteMany({}), prisma.monthlyCpi.createMany({ data })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.monthlyCpi.createMany({ data: rows, skipDuplicates: true }), data);
    fetched = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
