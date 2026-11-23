import prisma from '@/adapters/prisma/index';
import { upsertRows } from '@/shared/upsertRows';
import { fetchDgbasXml } from '@/adapters/dgbas/client';
import { createManyChunked } from '@/shared/createManyChunked';
import { parseMonthlyCpi, parseMonthlyCpiItems } from '@/domains/monthlyCpi/parser';
import type { MonthlyCpiItemPoint, MonthlyCpiPoint } from '@/domains/monthlyCpi/types';

// 主計總處固定路徑統計檔案，沒有查詢參數，每次都回傳整段歷史（1981M01 至今）。
const CPI_XML_URL = 'https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230555/pr0101a1m.xml';
export const EXPORT_DATASET = 'v_monthly_cpis'; // = export view 名（詞彙表：鍵跟著 view 改名）

export interface IngestMonthlyCpiResult {
  success: boolean;
  totalPoints: number;
  fetched: number;
  skipped: number;
  cpiItemPoints?: number; // 全部 81 項的列數（monthly_cpi_item）
  error?: string;
}

// 跟 govBondYield10y 同樣的道理：下游約定只認 export.ingestion_runs 裡 status='success' 的紀錄，
// 這是輔助性記帳動作，失敗不能讓主要 ingest 結果跟著失敗。
const recordIngestionRun = async (status: 'success' | 'failed', points: MonthlyCpiPoint[]): Promise<void> => {
  try {
    const latest = points.reduce<{ year: number; month: number } | null>((acc, p) => {
      if (!acc || p.year > acc.year || (p.year === acc.year && p.month > acc.month)) return { year: p.year, month: p.month };
      return acc;
    }, null);
    const dataDate = latest ? new Date(Date.UTC(latest.year, latest.month - 1, 1)) : null;

    await prisma.ingestionRun.create({
      data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status },
    });
  } catch (error) {
    console.error('Failed to record export.ingestion_runs:', error);
  }
};

// 跟 quarterlyGdp/monthlyUnemploymentRate 一樣用整批寫入，不是逐點 findUnique+upsert——這個 domain
// 4,376 筆，逐點兩次資料庫往返在 Neon 的網路延遲下實測跑了近 10 分鐘，改成 createMany 之後幾秒鐘
// 就能跑完（見 quarterlyGdp/service.ts 的說明，同一套理由）。force 時整批刪除重建，不 force 時同鍵覆寫
// （shared/upsertRows.ts），衝突鍵是 (year, month, category)。
// 2026-11-23 起同一份檔也寫全部 81 項（monthly_cpi_item → v_monthly_cpi_items，約 4.4 萬列），不另開 job 重抓。
// ingestion_runs 仍記在 v_monthly_cpis 底下，列數是七大類那張的。
export const ingestMonthlyCpi = async (force = false): Promise<IngestMonthlyCpiResult> => {
  let xml: string;
  try {
    xml = await fetchDgbasXml(CPI_XML_URL);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: MonthlyCpiPoint[];
  let items: MonthlyCpiItemPoint[];
  try {
    points = parseMonthlyCpi(xml);
    items = parseMonthlyCpiItems(xml);
  } catch (error) {
    await recordIngestionRun('failed', []);
    return { success: false, totalPoints: 0, fetched: 0, skipped: 0, error: error instanceof Error ? error.message : String(error) };
  }

  const data = points.map((p) => ({ year: p.year, month: p.month, category: p.category, indexValue: p.indexValue, yoyChangePercent: p.yoyChangePercent }));

  let fetched: number;
  let skipped: number;
  if (force) {
    // 81 項約 4.4 萬列，一次 createMany 的參數會超過 Postgres 上限，分批寫，所以用互動式交易
    await prisma.$transaction(
      async (tx) => {
        await tx.monthlyCpi.deleteMany({});
        await tx.monthlyCpi.createMany({ data });
        await tx.monthlyCpiItem.deleteMany({});
        await createManyChunked((rows) => tx.monthlyCpiItem.createMany({ data: rows }), items);
      },
      { maxWait: 30000, timeout: 180000 }
    );
    fetched = points.length;
    skipped = 0;
  } else {
    const { inserted, updated } = await upsertRows('MonthlyCpi', ['year', 'month', 'category'], data);
    fetched = inserted + updated;
    skipped = points.length - fetched;
    await upsertRows('MonthlyCpiItem', ['year', 'month', 'itemName'], items);
  }

  await recordIngestionRun('success', points);
  return { success: true, totalPoints: points.length, fetched, skipped, cpiItemPoints: items.length };
};
