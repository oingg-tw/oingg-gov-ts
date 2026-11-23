import prisma from '@/adapters/prisma/index';
import { upsertRows } from '@/shared/upsertRows';
import { fetchDgbasXml } from '@/adapters/dgbas/client';
import { parseQuarterlyGdpExpenditure } from '@/domains/quarterlyGdpExpenditure/parser';
import type { QuarterlyGdpExpenditurePoint } from '@/domains/quarterlyGdpExpenditure/types';

// 主計總處固定路徑統計檔案，沒有查詢參數，每次都回傳整段歷史（1981Q1 至今）。
const GDP_EXPENDITURE_XML_URL = 'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230514/na8102a6q.xml';
export const EXPORT_DATASET = 'v_quarterly_gdp_expenditures'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestQuarterlyGdpExpenditureResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// 記帳邏輯同 quarterlyGdp/service.ts；dataDate 取這批資料裡最新一季的第一天。
const recordIngestionRun = async (status: 'success' | 'failed', points: QuarterlyGdpExpenditurePoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; quarter: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.quarter > acc.quarter)) return { year: p.year, quarter: p.quarter };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, (latest.quarter - 1) * 3, 1)) : null;
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status } });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 約 3 千列，整批寫入，寫法同 quarterlyGdp。主計總處每季會修正前幾季：不帶 force 時同鍵覆寫（shared/upsertRows.ts），
// 修正值每天自動進來；force 時整批刪除重建。
export const ingestQuarterlyGdpExpenditure = async (force = false): Promise<IngestQuarterlyGdpExpenditureResult> => {
  let xml: string;
  try {
    xml = await fetchDgbasXml(GDP_EXPENDITURE_XML_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: QuarterlyGdpExpenditurePoint[];
  try {
    points = parseQuarterlyGdpExpenditure(xml);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.quarterlyGdpExpenditure.deleteMany({}), prisma.quarterlyGdpExpenditure.createMany({ data: points })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const { inserted, updated } = await upsertRows('QuarterlyGdpExpenditure', ['year', 'quarter', 'category'], points);
    fetched = inserted + updated;
    skipped = points.length - fetched;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
