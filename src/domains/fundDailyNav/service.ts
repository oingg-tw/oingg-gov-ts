import prisma from '@/adapters/prisma/index';
import { createManyChunked } from '@/shared/createManyChunked';
import { fetchSitcaCsv } from '@/adapters/sitca/client';
import { parseFundDailyNav } from '@/domains/fundDailyNav/parser';
import type { FundDailyNavPoint } from '@/domains/fundDailyNav/types';

// data.gov.tw 資料集 11109，固定路徑 CSV，無查詢參數。已用真實檔案核對過：單次回應含 2 個交易日
// （滾動窗口，不是只有最新一天）——大多數基金是前一營業日的淨值，約 490 支是當天就公布的，所以某天要等
// 下一個營業日的檔進來才齊（週五的到週一）。週末的檔只有約 36 列、日期是週五、全是已寫入的列，所以
// ingestion_runs 週末那筆會是「週五、36 列」，不代表週五只有這些（2026-11 實測）。下次 ingest 會有
// 1 天重疊——用 (trade_date, beneficiary_code) 唯一約束處理重疊，不會重複寫入。
const FUND_DAILY_NAV_CSV_URL = 'https://www.sitca.org.tw/MemberK0000/F/03/nav.csv';
const EXPORT_DATASET = 'v_fund_daily_navs'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestFundDailyNavResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  error?: string;
}

const recordIngestionRun = async (
  status: 'success' | 'failed',
  points: FundDailyNavPoint[],
  sourceLastModified: Date | null
): Promise<void> => {
  try {
    const latest = points.reduce<Date | null>((acc, p) => (!acc || p.tradeDate > acc ? p.tradeDate : acc), null);
    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate: latest, rowCount: points.length, status, sourceLastModified },
    });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 跟其他新 domain 一樣用整批寫入（見 quarterlyGdp/service.ts 的說明）。force 時只刪這份檔案裡有的交易日
// 再重寫——來源只有最近 2 個交易日，整表刪除會把來源補不回來的歷史一起刪掉。不 force 時用
// createMany({ skipDuplicates: true }) 讓 (trade_date, beneficiary_code) 的唯一約束處理「已存在就跳過」
// （也順便處理了滾動窗口重疊的那 1 天）。
export const ingestFundDailyNav = async (force = false): Promise<IngestFundDailyNavResult> => {
  let csv: string;
  let sourceLastModified: Date | null;
  try {
    const fetched = await fetchSitcaCsv(FUND_DAILY_NAV_CSV_URL);
    csv = fetched.content;
    sourceLastModified = fetched.lastModified;
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: FundDailyNavPoint[];
  try {
    points = parseFundDailyNav(csv);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({
    tradeDate: p.tradeDate,
    memberCode: p.memberCode,
    companyName: p.companyName,
    fundTaxId: p.fundTaxId,
    fundCode: p.fundCode,
    fundName: p.fundName,
    navValue: p.navValue,
    changeValue: p.changeValue,
    changePercent: p.changePercent,
    typeCode: p.typeCode,
    currency: p.currency,
    beneficiaryCode: p.beneficiaryCode,
  }));

  let fetchedCount: number;
  let skipped: number;
  if (force) {
    const tradeDates = [...new Set(points.map((p) => p.tradeDate.getTime()))].map((t) => new Date(t));
    await prisma.$transaction(
      [prisma.fundDailyNav.deleteMany({ where: { tradeDate: { in: tradeDates } } }), prisma.fundDailyNav.createMany({ data })],
      { timeout: 30000 }
    );
    fetchedCount = points.length;
    skipped = 0;
  } else {
    const insertedCount = await createManyChunked((rows) => prisma.fundDailyNav.createMany({ data: rows, skipDuplicates: true }), data);
    fetchedCount = insertedCount;
    skipped = points.length - insertedCount;
  }

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length, fetched: fetchedCount, skipped };
};
