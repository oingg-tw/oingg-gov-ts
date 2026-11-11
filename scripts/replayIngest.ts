/**
 * 從銅層重跑匯入（銅層 v1 第 7 點）：找出某個資料集在日期區間內（completed_at 的台北日期）有存原始回應的
 * ingestion_runs，依序帶 { force: true, replayRunId } 打匯入端點，用現在的解析程式同鍵覆寫。重跑那次也會記一筆
 * ingestion_runs，raw_objects 指向讀的原始檔。SITCA 兩支重跑區間裡的每一次，其他只重跑最後一次
 * （見 src/shared/ingestDatasets.ts 的 pickRunsToReplay）。
 *
 * 用法（預設只列出會重跑哪幾次，加 --apply 才真的寫）：
 *   npx tsx --env-file=<env 檔> scripts/replayIngest.ts <dataset> --from YYYY-MM-DD --to YYYY-MM-DD [--apply] [--base-url=http://localhost:8084]
 *
 * <dataset> 是 ingestion_runs.dataset，例如 v_fund_daily_navs。env 檔要有 DATABASE_URL（查 ingestion_runs）和
 * TASK_SECRET。沒帶 --base-url 就打 Cloud Run，要先 gcloud auth login。
 * 加 --apply 打 PRD 就是觸發 PRD 匯入，照 CLAUDE.md 每次都要使用者核准。
 */
import { execFileSync } from 'child_process';
import prisma from '../src/adapters/prisma/index';
import { DATASET_BY_JOB, pickRunsToReplay } from '../src/shared/ingestDatasets';
import { schedulerConfig } from './scheduler.config';

const args = process.argv.slice(2);
const valueOf = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
const dataset = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--from' && args[i - 1] !== '--to');
const from = args.includes('--from') ? valueOf('--from') : undefined;
const to = args.includes('--to') ? valueOf('--to') : undefined;
const apply = args.includes('--apply');
const baseUrl = args.find((arg) => arg.startsWith('--base-url='))?.slice('--base-url='.length) ?? schedulerConfig.serviceUrl;

const main = async () => {
  const job = Object.entries(DATASET_BY_JOB).find(([, value]) => value === dataset)?.[0];
  if (!job || !/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) {
    throw new Error(`用法：scripts/replayIngest.ts <dataset> --from YYYY-MM-DD --to YYYY-MM-DD [--apply]\n資料集：${Object.values(DATASET_BY_JOB).join(', ')}`);
  }
  const start = new Date(`${from}T00:00:00+08:00`);
  const end = new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000);
  const runs = await prisma.ingestionRun.findMany({
    where: { dataset, completedAt: { gte: start, lt: end }, rawObjects: { isEmpty: false } },
    orderBy: { runId: 'asc' },
    select: { runId: true, status: true, completedAt: true, rawObjects: true },
  });
  const picked = pickRunsToReplay(dataset!, runs);
  console.log(`${dataset} ${from}~${to}：${runs.length} 次匯入有原始回應，要重跑 ${picked.length} 次（/api/ingest/${job}）`);
  for (const run of picked) console.log(`  run ${run.runId}（${run.status}，${run.completedAt.toISOString()}）${run.rawObjects.join(', ')}`);
  if (!apply) {
    if (picked.length > 0) console.log('只看不寫；加 --apply 才會重跑。');
    return;
  }

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
        // 同一個 job 成功後有 60 秒冷卻（src/shared/rateLimiter.ts），照 Retry-After 等完再打
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
