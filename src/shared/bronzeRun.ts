import { Request, Response, NextFunction } from 'ultimate-express';
import prisma from '@/adapters/prisma/index';
import { runRawContext } from '@/shared/bronze';
import { DATASET_BY_JOB } from '@/shared/ingestDatasets';

/**
 * 每個 /api/ingest 請求開一個銅層範圍（見 shared/bronze.ts），這次存的原始回應會記進 ingestion_runs.raw_objects。
 * body 帶 replayRunId 就不連上游，改回放那次匯入存的檔：只收這個資料集自己的紀錄，沒有原始檔就擋掉。
 * 要覆寫已存在的值，跟平常一樣另外帶 force。
 * 跟 requireTaskSecret 分開放：這支要查資料庫，middleware.ts 的測試不用跟著載入 Prisma。
 */
export const bronzeRun = async (req: Request, res: Response, next: NextFunction) => {
  const job = req.path.replace(/^\//, '');
  const dataset = DATASET_BY_JOB[job] ?? job;
  const replayRunId = (req.body as { replayRunId?: unknown } | undefined)?.replayRunId;
  if (replayRunId === undefined) return runRawContext(dataset, undefined, next);

  if (typeof replayRunId !== 'number' || !Number.isSafeInteger(replayRunId) || replayRunId <= 0) {
    return res.status(400).json({ message: 'replayRunId must be a positive integer.' });
  }
  try {
    const run = await prisma.ingestionRun.findUnique({ where: { runId: BigInt(replayRunId) }, select: { dataset: true, rawObjects: true } });
    if (!run || run.dataset !== dataset || run.rawObjects.length === 0) {
      return res.status(400).json({ message: `ingestion_runs ${replayRunId} has no raw responses stored for ${dataset}.` });
    }
    runRawContext(dataset, run.rawObjects, next);
  } catch (error) {
    next(error);
  }
};
