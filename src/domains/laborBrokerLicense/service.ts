import prisma from '@/adapters/prisma/index';
import { fetchMolCsv } from '@/adapters/mol/client';
import { MOL_RESOURCE_ID, parseLaborBrokerLicense } from '@/domains/laborBrokerLicense/parser';
import type { LaborBrokerLicensePoint } from '@/domains/laborBrokerLicense/types';

const EXPORT_DATASET = 'labor_broker_license';

export interface IngestLaborBrokerLicenseResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: LaborBrokerLicensePoint[], sourceLastModified: Date | null): Promise<void> => {
  try {
    // 這份沒有資料期別，是「目前全部許可證」的現況快照，dataDate 記抓取日（同
    // laborBrokerTaxRegistration）。刻意不取「最新的許可證起始日」——許可證可以預先核發，那個值會是
    // 未來日期（2026-09-22 實測抓到 2026-10-13），讓下游的新鮮度判斷失真。
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate: new Date(), rowCount: points.length, status, sourceLastModified } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 整批刪除重建，沒有 force 開關：這份是「現況快照」——許可證會展延、停業、廢止，舊列的狀態欄位會被
// 更新，不是只會新增。skipDuplicates 會讓已存在的許可證永遠停在第一次抓到的狀態（例如永遠顯示有效，
// 即使早就廢止了），對這個 domain 的用途（查核業者現在合不合法）是危險的。約 5,000 列，成本可忽略。
export const ingestLaborBrokerLicense = async (): Promise<IngestLaborBrokerLicenseResult> => {
  let csv: string;
  let sourceLastModified: Date | null;
  try {
    const fetched = await fetchMolCsv(MOL_RESOURCE_ID);
    csv = fetched.content;
    sourceLastModified = fetched.lastModified;
  } catch (error) {
    await recordIngestionRun('failed', [], null);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  let points: LaborBrokerLicensePoint[];
  try {
    points = parseLaborBrokerLicense(csv);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction([prisma.laborBrokerLicense.deleteMany({}), prisma.laborBrokerLicense.createMany({ data: points })], { timeout: 30000 });

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length };
};
