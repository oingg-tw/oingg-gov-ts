import prisma from '@/adapters/prisma/index';
import { fetchMolCsv } from '@/adapters/mol/client';
import { MOL_RESOURCE_ID, parseLaborBrokerEvaluation } from '@/domains/laborBrokerEvaluation/parser';
import type { LaborBrokerEvaluationPoint } from '@/domains/laborBrokerEvaluation/types';

const EXPORT_DATASET = 'labor_broker_evaluation';

export interface IngestLaborBrokerEvaluationResult {
  success: boolean;
  totalPoints: number;
  error?: string;
}

const recordIngestionRun = async (status: 'success' | 'failed', points: LaborBrokerEvaluationPoint[], sourceLastModified: Date | null): Promise<void> => {
  try {
    const latestYear = points.reduce<number | null>((acc, p) => (!acc || p.year > acc ? p.year : acc), null);
    const dataDate = latestYear ? new Date(Date.UTC(latestYear, 0, 1)) : new Date();
    await prisma.ingestionRun.create({ data: { dataset: EXPORT_DATASET, dataDate, rowCount: points.length, status, sourceLastModified } });
  } catch (error) {
    console.error('Failed to record ingestion run for analysis-ts export contract:', error);
  }
};

// 整批刪除重建，理由同 laborBrokerLicense：勞動部每年重發整份檔案，過往年度的成績也可能被更正。
export const ingestLaborBrokerEvaluation = async (): Promise<IngestLaborBrokerEvaluationResult> => {
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

  let points: LaborBrokerEvaluationPoint[];
  try {
    points = parseLaborBrokerEvaluation(csv);
  } catch (error) {
    await recordIngestionRun('failed', [], sourceLastModified);
    return { success: false, totalPoints: 0, error: error instanceof Error ? error.message : String(error) };
  }

  await prisma.$transaction([prisma.laborBrokerEvaluation.deleteMany({}), prisma.laborBrokerEvaluation.createMany({ data: points })], { timeout: 30000 });

  await recordIngestionRun('success', points, sourceLastModified);
  return { success: true, totalPoints: points.length };
};
