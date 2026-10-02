import type { CompanyProfile } from '@prisma/client';

export interface RegisterCompanyProfileResult {
  success: boolean;
  profile?: CompanyProfile;
  skipped?: boolean; // 該統編已存在資料，且未帶 force——沒打 GCIS，直接回傳既有資料
  notFound?: boolean; // GCIS 查無此統編（跟「呼叫 GCIS 失敗」的 502 區分開來）
  error?: string;
}
