import prisma from '@/adapters/prisma/index';
import { fetchDgbasXml } from '@/adapters/dgbas/client';
import { parseMonthlyUnemploymentRate } from '@/domains/monthlyUnemploymentRate/parser';
import type { MonthlyUnemploymentRatePoint } from '@/domains/monthlyUnemploymentRate/types';

const UNEMPLOYMENT_XML_URL = 'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230038/mp0101a07.xml';
const EXPORT_DATASET = 'monthly_unemployment_rate'; // 對應 export.monthly_unemployment_rate view

export interface IngestMonthlyUnemploymentRateResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyUnemploymentRatePoint[]): Promise<void> => {
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

// 這個 domain 有 21 個類別 x ~580 個月 ≈ 12,000+ 筆，逐筆 findUnique+upsert（govBondYield10y/
// monthlyCpi 的寫法）在這個量級下會太慢——理由跟 quarterlyGdp/service.ts 一樣，改用整批寫入。
export const ingestMonthlyUnemploymentRate = async (force = false): Promise<IngestMonthlyUnemploymentRateResult> => {
  let xml: string;
  try {
    xml = await fetchDgbasXml(UNEMPLOYMENT_XML_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: MonthlyUnemploymentRatePoint[];
  try {
    points = parseMonthlyUnemploymentRate(xml);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({ year: p.year, month: p.month, category: p.category, ratePercent: p.ratePercent }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyUnemploymentRate.deleteMany({}), prisma.monthlyUnemploymentRate.createMany({ data })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const result = await prisma.monthlyUnemploymentRate.createMany({ data, skipDuplicates: true });
    fetched = result.count;
    skipped = points.length - result.count;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
