/**
 * 從銅層重跑匯入：找出某個 job 在日期區間內（completed_at 的台北日期）有存原始回應的 ingestion_runs，依序帶
 * { force: true, replayRunId } 打匯入端點，用現在的解析程式同鍵覆寫。SITCA 兩支重跑區間裡的每一次，其他只重跑
 * 最後一次（見 src/shared/bronze.ts 的 pickRunsToReplay）。
 *
 * 用法：
 *   npx tsx --env-file=<env 檔> scripts/replayIngest.ts <job> <from YYYY-MM-DD> <to YYYY-MM-DD> [--base-url=http://localhost:8084] [--dry-run]
 *
 * env 檔要有 DATABASE_URL（查 ingestion_runs）和 TASK_SECRET。沒帶 --base-url 就打 Cloud Run，要先 gcloud auth login。
 * 對 PRD 跑就是觸發 PRD 匯入，照 CLAUDE.md 每次都要使用者核准；先用 --dry-run 看會重跑哪幾次。
 */
import { execFileSync } from 'child_process';
import prisma from '../src/adapters/prisma/index';
import { pickRunsToReplay } from '../src/shared/bronze';
import { schedulerConfig } from './scheduler.config';

const [job, from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const baseUrl = process.argv.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length) ?? schedulerConfig.serviceUrl;
const dryRun = process.argv.includes('--dry-run');

const main = async () => {
  if (!job || !/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
    throw new Error('用法：scripts/replayIngest.ts <job> <from YYYY-MM-DD> <to YYYY-MM-DD> [--base-url=...] [--dry-run]');
  }
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000);
  const runs = (
    await prisma.ingestionRun.findMany({
      where: { completedAt: { gte: start, lt: end }, rawObjects: { isEmpty: false } },
      orderBy: { runId: 'asc' },
      select: { runId: true, status: true, completedAt: true, rawObjects: true },
    })
  ).filter((run) => run.rawObjects.every((path) => path.startsWith(`${job}/`)));
  const picked = pickRunsToReplay(job, runs);
  console.log(`${job} ${from}~${to}：${runs.length} 次匯入有原始回應，要重跑 ${picked.length} 次`);
  for (const run of picked) console.log(`  run ${run.runId}（${run.status}，${run.completedAt.toISOString()}）${run.rawObjects.join(', ')}`);
  if (dryRun || picked.length === 0) return;

  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Task-Secret': process.env.TASK_SECRET ?? '' };
  if (baseUrl.startsWith('https://')) {
    // Windows 上 gcloud 是 gcloud.cmd，要 shell: true 才找得到（同 reconcileScheduler.ts）
    headers.Authorization = `Bearer ${execFileSync('gcloud', ['auth', 'print-identity-token'], { encoding: 'utf-8', shell: true }).trim()}`;
  }
  for (const run of picked) {
    for (;;) {
      const response = await fetch(`${baseUrl}/api/ingest/${job}`, { method: 'POST', headers, body: JSON.stringify({ force: true, replayRunId: Number(run.runId) }) });
      const text = await response.text();
      if (response.status === 429) {
        // 同一個 job 成功後有 60 秒冷卻（shared/rateLimiter.ts），照 Retry-After 等完再打
        const waitSeconds = Number(response.headers.get('retry-after') ?? '60') + 1;
        console.log(`  run ${run.runId}：冷卻中，等 ${waitSeconds} 秒`);
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
        continue;
      }
      console.log(`  run ${run.runId}：HTTP ${response.status} ${text.slice(0, 300)}`);
      if (!response.ok) process.exitCode = 1;
      break;
    }
  }
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
