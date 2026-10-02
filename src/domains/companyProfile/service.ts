import { Prisma } from '@prisma/client';
import type { CompanyProfile } from '@prisma/client';
import prisma from '@/adapters/prisma/index';
import { fetchCompanyBusinessItems } from '@/adapters/gcis';
import type { RegisterCompanyProfileResult } from '@/domains/companyProfile/types';

// 2026-10-02 起這個 domain 只負責「維護 company_profiles 這份統編↔證券代碼對照」，供
// companyIndustryClassification 把稅籍行業別接到證券代碼上（export.company_industry_classification）。
// 原本還做兩件事，都已移除：
// - 把 GCIS 回應的營業項目落地到 company_business_items。那是為了「用 MOEA 營業項目橋接 DGBAS 行業
//   分類」而建的，該橋接沒有做成（analysis-ts 的紀錄），表也從來沒有 export view、沒有任何下游在讀。
// - 用 company_profile_ingestion_failures 記「還沒成功登記的統編」。它只有搭配已移除的
//   GET /api/query/company-profile/failures 才有意義，失敗現在逐筆回在 HTTP 回應裡。
// 仍然打 GCIS 的 fetchCompanyBusinessItems：那支回傳的是整筆公司登記資料，我們要的是公司名稱/狀態/
// 設立日期，營業項目只是同一個回應順帶附上的，不再寫進 DB。

export const registerCompanyProfile = async (stockCode: string, taxId: string, force = false): Promise<RegisterCompanyProfileResult> => {
  if (!force) {
    // 包 try/catch 是因為這個 function 會在批次 ingest 的迴圈裡被逐筆呼叫（見
    // companyProfile/controller.ts）：這裡如果不接住例外直接往外丟，會讓單一統編的 DB 查詢失敗
    // 中斷整批後面還沒處理的項目，而不是只記那一筆失敗、繼續跑下一筆。
    try {
      const existing = await prisma.companyProfile.findUnique({ where: { taxId } });
      // 已經有資料就跳過，不打 GCIS——這條路刻意不檢查 stockCode 是否跟既有資料一致，帶 force=true
      // 才會真的重新抓取並覆寫（包含 stockCode）。
      if (existing) return { success: true, profile: existing, skipped: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  let records;
  try {
    records = await fetchCompanyBusinessItems(taxId);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }

  const record = records[0];
  if (!record) {
    return { success: false, notFound: true, error: `GCIS 查無統編 ${taxId} 的公司登記資料。` };
  }

  const data = {
    stockCode,
    companyName: record.Company_Name,
    companyStatus: record.Company_Status,
    companyStatusDesc: record.Company_Status_Desc,
    companySetupDate: record.Company_Setup_Date,
  };

  try {
    // 單一 upsert，不再需要交易——營業項目的刪除重建移除後，這裡只寫一張表。
    const profile = await prisma.companyProfile.upsert({ where: { taxId }, create: { taxId, ...data }, update: data });
    return { success: true, profile };
  } catch (error) {
    // 這張表現在只剩 stockCode 一個額外的 unique constraint（taxId 是主鍵，upsert 自己處理），
    // 所以 P2002 只會是證券代碼撞到。仍然檢查 meta.target 而不是直接假設：之前這裡曾經不分
    // 青紅皂白把所有 P2002 都當成 stockCode 衝突，結果 company_business_items 的 (tax_id, position)
    // 撞到時也被貼上誤導訊息——那張表沒了，但「看 target 再判斷」這個習慣要留著。
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[] | string | undefined) ?? [];
      const targetsStockCode = Array.isArray(target) ? target.includes('stock_code') : target === 'stock_code';
      if (targetsStockCode) {
        return { success: false, error: `證券代碼 ${stockCode} 已登記在其他統編下，無法重複登記。` };
      }
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export interface RefreshTrackedCompanyProfilesResult {
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ stockCode: string; taxId: string; error?: string }>;
}

// 「重跑目前所有已追蹤公司」——不是靠外部呼叫端提供清單，清單直接從 company_profiles 現有資料撈，
// 撈到幾筆就處理幾筆，不寫死數字。每一筆都強制 force=true：這個端點存在的目的就是刷新既有資料
// （公司登記狀態可能變動過），如果沿用預設的「已存在就跳過」邏輯，對已經在追蹤清單裡的公司
// 會直接全部跳過、等於沒做事，語意上說不通。
//
// 注意這支**只能刷新，永遠不會長出新公司**——清單來源就是這張表自己。新公司只能由外部呼叫
// POST /api/ingest/company-profile 帶進來（需要 body，Cloud Scheduler 給不了，見 scheduler.config.ts
// 檔頭）。2026-10-02 實測正式環境 1,003 筆全部是上市公司，上櫃/興櫃從來沒有任何東西推進來過。
//
// 逐筆序列處理（原因跟 controller.ts 的批次登記一樣：GCIS client 本身有節流，平行送不會加速，
// 序列處理才能讓單筆失敗不影響其他筆）。回應只回統計數字跟失敗清單，不含每筆的完整 profile——
// 追蹤清單有 1000+ 筆，每筆都塞完整資料會讓回應本體過大。
export const refreshTrackedCompanyProfiles = async (): Promise<RefreshTrackedCompanyProfilesResult> => {
  const targets = await prisma.companyProfile.findMany({ select: { stockCode: true, taxId: true } });

  let succeeded = 0;
  const failures: Array<{ stockCode: string; taxId: string; error?: string }> = [];

  for (const { stockCode, taxId } of targets) {
    const result = await registerCompanyProfile(stockCode, taxId, true);
    if (result.success) {
      succeeded++;
    } else {
      failures.push({ stockCode, taxId, error: result.error });
    }
  }

  return { total: targets.length, succeeded, failed: failures.length, failures };
};

export type { CompanyProfile };
