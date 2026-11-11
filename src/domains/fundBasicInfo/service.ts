import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchSitcaCsv } from '@/adapters/sitca/client';
import { parseFundBasicInfo } from '@/domains/fundBasicInfo/parser';
import type { FundBasicInfoPoint } from '@/domains/fundBasicInfo/types';

// data.gov.tw 資料集 43476，固定路徑 CSV，無查詢參數。這份檔案本身是「當月快照」，不是累積歷史
// （已用真實檔案核對過：單次回應只有一個年月），每次 ingest 只會新增當月一批，不會補到過去的月份。
const FUND_BASIC_INFO_CSV_URL = 'https://www.sitca.org.tw/MemberK0000/F/03/43476投信投顧公會境內基金基本資料.csv';
export const EXPORT_DATASET = 'v_fund_profiles'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestFundBasicInfoResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (
  status: 'success' | 'failed',
  points: FundBasicInfoPoint[],
  sourceLastModified: Date | null
): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : null;

    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status, sourceLastModified },
    });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 跟 quarterlyGdp 等 domain 一樣用整批寫入（見 quarterlyGdp/service.ts 的說明）。force 時只刪這份檔案裡
// 有的年月再重寫——來源只有當月快照，整表刪除會把來源補不回來的過去月份一起刪掉。不 force 時用
// createMany({ skipDuplicates: true }) 讓 (year, month, isin_code) 的唯一約束處理「已存在就跳過」。
export const ingestFundBasicInfo = async (force = false): Promise<IngestFundBasicInfoResult> => {
  let csv: string;
  let sourceLastModified: Date | null;
  try {
    const fetched = await fetchSitcaCsv(FUND_BASIC_INFO_CSV_URL);
    csv = fetched.content;
    sourceLastModified = fetched.lastModified;
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: FundBasicInfoPoint[];
  try {
    points = parseFundBasicInfo(csv);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({
    year: p.year,
    month: p.month,
    companyName: p.companyName,
    fundName: p.fundName,
    fundTaxId: p.fundTaxId,
    fundInceptionDate: p.fundInceptionDate,
    fundSizeDate: p.fundSizeDate,
    fundSizeCurrency: p.fundSizeCurrency,
    classSizeAmount: p.classSizeAmount,
    fundSizeAmount: p.fundSizeAmount,
    fundTypeCode: p.fundTypeCode,
    fundTypeName: p.fundTypeName,
    investmentRegion: p.investmentRegion,
    dividendPolicy: p.dividendPolicy,
    isinCode: p.isinCode,
    custodianDomestic: p.custodianDomestic,
    custodianForeign: p.custodianForeign,
    denominationCurrency: p.denominationCurrency,
  }));

  let fetchedCount: number;
  let skipped: number;
  if (force) {
    const months = [...new Map(points.map((p) => [`${p.year}-${p.month}`, { year: p.year, month: p.month }])).values()];
    await prisma.$transaction(
      [prisma.fundBasicInfo.deleteMany({ where: { OR: months } }), prisma.fundBasicInfo.createMany({ data })],
      { timeout: 30000 }
    );
    fetchedCount = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.fundBasicInfo.createMany({ data: rows, skipDuplicates: true }), data);
    fetchedCount = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length, fetched: fetchedCount, skipped };
};
