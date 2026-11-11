import { Request, Response, NextFunction } from 'ultimate-express';
import prisma from '@/adapters/prisma/index';
import { runRawContext } from '@/shared/bronze';

/**
 * 每個 /api/ingest 請求開一個銅層範圍（見 shared/bronze.ts），這次存的原始回應會記進 ingestion_runs.raw_objects。
 * body 帶 replayRunId 就不連上游，改回放那次匯入存的檔：只收這個 job 自己的紀錄（物件路徑第一層要是這個 job），
 * 沒有原始檔就擋掉。要覆寫已存在的值，跟平常一樣另外帶 force。
 * 跟 requireTaskSecret 分開放：這支要查資料庫，middleware.ts 的測試不用跟著載入 Prisma。
 */
export const bronzeRun = async (req: Request, res: Response, next: NextFunction) => {
  const job = req.path.replace(/^\//, '');
  const replayRunId = (req.body as { replayRunId?: unknown } | undefined)?.replayRunId;
  if (replayRunId === undefined) return runRawContext(job, undefined, next);

  if (typeof replayRunId !== 'number' || !Number.isSafeInteger(replayRunId) || replayRunId <= 0) {
    return res.status(400).json({ message: 'replayRunId must be a positive integer.' });
  }
  try {
    const run = await prisma.ingestionRun.findUnique({ where: { runId: BigInt(replayRunId) }, select: { rawObjects: true } });
    const paths = run?.rawObjects ?? [];
    if (paths.length === 0 || !paths.every((path) => path.startsWith(`${job}/`))) {
      return res.status(400).json({ message: `ingestion_runs ${replayRunId} has no raw responses stored for ${job}.` });
    }
    runRawContext(job, paths, next);
  } catch (error) {
    next(error);
  }
};
