import prisma from '@/adapters/prisma/index';
import { fetchSitcaCsv } from '@/adapters/sitca/client';
import { parseFundBasicInfo } from '@/domains/fundBasicInfo/parser';
import type { FundBasicInfoPoint } from '@/domains/fundBasicInfo/types';

// data.gov.tw 資料集 43476，固定路徑 CSV，無查詢參數。這份檔案本身是「當月快照」，不是累積歷史
// （已用真實檔案核對過：單次回應只有一個年月），每次 ingest 只會新增當月一批，不會補到過去的月份。
const FUND_BASIC_INFO_CSV_URL = 'https://www.sitca.org.tw/MemberK0000/F/03/43476投信投顧公會境內基金基本資料.csv';
const EXPORT_DATASET = 'fund_basic_info'; // 對應 export.fund_basic_info view

export interface IngestFundBasicInfoResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: FundBasicInfoPoint[]): Promise<void> => {
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

// 跟 quarterlyGdp 等 domain 一樣用整批寫入（見 quarterlyGdp/service.ts 的說明）。force 時整批刪除
// 重建，不 force 時用 createMany({ skipDuplicates: true }) 讓 (year, month, isin_code) 的唯一約束
// 處理「已存在就跳過」。
export const ingestFundBasicInfo = async (force = false): Promise<IngestFundBasicInfoResult> => {
  let csv: string;
  try {
    csv = await fetchSitcaCsv(FUND_BASIC_INFO_CSV_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: FundBasicInfoPoint[];
  try {
    points = parseFundBasicInfo(csv);
  } catch (error) {
    await recordIngestionRun('failed', []);
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
    fundType: p.fundType,
    investmentRegion: p.investmentRegion,
    dividendPolicy: p.dividendPolicy,
    isinCode: p.isinCode,
    custodianDomestic: p.custodianDomestic,
    custodianForeign: p.custodianForeign,
    denominationCurrency: p.denominationCurrency,
  }));

  let fetched: number;
  let skipped: number;
  if (force) {
    await prisma.$transaction([prisma.fundBasicInfo.deleteMany({}), prisma.fundBasicInfo.createMany({ data })]);
    fetched = points.length;
    skipped = 0;
  } else {
    const result = await prisma.fundBasicInfo.createMany({ data, skipDuplicates: true });
    fetched = result.count;
    skipped = points.length - result.count;
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped };
};
