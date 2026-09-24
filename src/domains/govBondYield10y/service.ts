import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchCbcItem } from '@/adapters/cbc';
import { parseMonthlyGovBondYield10y } from '@/domains/govBondYield10y/parser';
import type { MonthlyGovBondYield10yPoint } from '@/domains/govBondYield10y/types';

const ITEM_CODE = 'EG43M01en';
const EXPORT_DATASET = 'monthly_gov_bond_yield_10y'; // 對應 export.monthly_gov_bond_yield_10y view，見 prisma/schema.prisma 的 IngestionRun 註解

export interface IngestGovBondYield10yResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

// analysis-ts 的 export 契約層只認 export.ingestion_runs 裡 status='success' 的紀錄，raw 表有資料
// 但沒對應紀錄的，他們當作不存在——所以每次 ingest（不論成功或失敗）都要記一筆。這是輔助性的記帳
// 動作，失敗不能讓主要的 ingest 結果跟著失敗，包一層 try/catch，最多 console.error。
const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyGovBondYield10yPoint[]): Promise<void> => {
  try {
    // dataDate 記這批資料實際涵蓋到的最新月份，不是「現在」——points 是 CBC 端點回應的全部歷史，
    // 取其中最新的 year/month 就是這批資料的新鮮度；失敗時沒有可信的資料月份，退回今天的日期。
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

// CBC 這個端點本身不分頁、不需要重複請求，一次請求就拿到 1987-M5 至今整段月資料。跟
// quarterlyGdp/monthlyUnemploymentRate 一樣用整批寫入，不是逐月 findUnique+upsert——後者在 Neon
// 的網路延遲下每筆兩次往返，量一大就很慢（monthlyCpi 4,376 筆實測跑了近 10 分鐘，這個 domain 只有
// 369 筆問題不大，但改成同一套寫法純粹圖一致，之後有人抄這個 domain 當範本不會抄到慢的版本）。
// force 時整批刪除重建，不 force 時用 createMany({ skipDuplicates: true }) 讓唯一約束處理「已存在
// 就跳過」。
export const ingestMonthlyGovBondYield10y = async (force = false): Promise<IngestGovBondYield10yResult> => {
  let raw;
  try {
    raw = await fetchCbcItem(ITEM_CODE);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points;
  try {
    points = parseMonthlyGovBondYield10y(raw);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({ year: p.year, month: p.month, yieldRate: p.yieldRate }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.monthlyGovBondYield10y.deleteMany({}), prisma.monthlyGovBondYield10y.createMany({ data })], { timeout: 30000 });
    fetched = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.monthlyGovBondYield10y.createMany({ data: rows, skipDuplicates: true }), data);
    fetched = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
