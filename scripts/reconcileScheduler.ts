/**
 * 讀 scheduler.config.ts 這份「意圖排程表」，跟 Cloud Scheduler 上實際的狀態 diff。
 * 預設唯讀（只印報告），加 `--apply` 才會真的動手套用 schedule/timeZone/uri/attemptDeadline
 * 不符的 job，或建立設定裡有、但 Cloud Scheduler 上還沒有的 job。
 *
 * 抄自 oingg-twse-ts/scripts/reconcileScheduler.ts，差異：
 * - 多比對/套用 attemptDeadline，可逐 job 覆寫（gov-ts 有兩支 15-30 分鐘的 long-running job，見 scheduler.config.ts）
 * - 執行前先擋 serviceUrl/serviceAccount 還是 placeholder 的情況
 * - Task secret 名稱從 config 讀（gov-task-secret），不寫死
 *
 * 找到「Cloud Scheduler 上有、設定裡沒有」的 job 只會警告，不會自動刪除——刪除是有破壞性的操作，
 * 交給人自己決定。
 *
 * 用法（需要先 `gcloud auth login` 且 `gcloud config set project` 到 gov-ts 的專案）：
 *   npx tsx scripts/reconcileScheduler.ts          （只印報告，不動任何東西）
 *   npx tsx scripts/reconcileScheduler.ts --apply   （套用不符的 job，建立缺少的 job）
 */
import { execFileSync } from 'child_process';
import { schedulerConfig, SchedulerJobConfig } from './scheduler.config';

interface ActualJob {
  name: string;
  schedule: string;
  timeZone: string;
  uri: string;
  attemptDeadline: string;
}

// Windows 上 `gcloud` 是 `gcloud.cmd`（batch 檔案包裝），execFileSync 一定要 `shell: true` 才找得到
// ——args 全部來自這個 repo 自己的 scheduler.config.ts，沒有外部輸入，沒有 shell injection 的攻擊面。
// shell: true 不會幫忙 quote 個別 arg，帶空白的值（cron 表達式）要自己包引號。
function runGcloud(args: string[]): string {
  const quotedArgs = args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg));
  return execFileSync('gcloud', quotedArgs, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024, shell: true });
}

function listActualJobs(): Map<string, ActualJob> {
  let output: string;
  try {
    output = runGcloud(['scheduler', 'jobs', 'list', `--location=${schedulerConfig.region}`, '--format=json']);
  } catch (error) {
    // gcloud 的 auth token 每天過期，非互動執行會直接死在這裡——把 stderr 原樣印出來，不然只看到
    // JSON.parse 失敗看不出是 auth 問題（twse-ts 三週心得）。
    console.error('[reconcile] gcloud scheduler jobs list failed:');
    console.error((error as { stderr?: string }).stderr ?? (error as Error).message);
    process.exit(1);
  }
  const raw = JSON.parse(output) as Array<{
    name: string;
    schedule: string;
    timeZone: string;
    attemptDeadline?: string;
    httpTarget?: { uri?: string };
  }>;
  const byName = new Map<string, ActualJob>();
  for (const job of raw) {
    const shortName = job.name.split('/').pop()!;
    byName.set(shortName, {
      name: shortName,
      schedule: job.schedule,
      timeZone: job.timeZone,
      uri: job.httpTarget?.uri ?? '',
      attemptDeadline: job.attemptDeadline ?? '',
    });
  }
  return byName;
}

// 每個 job 除了 Cloud Run IAM 的 OIDC 驗證，還要過 requireTaskSecret 中介層（雙層防護）——建立
// 新 job 時漏帶 X-Task-Secret header 會讓 Cloud Run 一直回 401，不是 IAM 問題。
let cachedTaskSecret: string | null = null;
function getTaskSecret(): string {
  if (cachedTaskSecret) return cachedTaskSecret;
  cachedTaskSecret = execFileSync('gcloud', ['secrets', 'versions', 'access', 'latest', `--secret=${schedulerConfig.taskSecretName}`], {
    encoding: 'utf-8',
    shell: true,
  }).trim();
  return cachedTaskSecret;
}

const expectedAttemptDeadline = (job: SchedulerJobConfig): string => job.attemptDeadline ?? schedulerConfig.defaults.attemptDeadline;

function buildUpdateArgs(job: SchedulerJobConfig, isCreate: boolean): string[] {
  const uri = `${schedulerConfig.serviceUrl}${job.path}`;
  const args = [
    'scheduler',
    'jobs',
    isCreate ? 'create' : 'update',
    'http',
    job.name,
    `--location=${schedulerConfig.region}`,
    `--schedule=${job.schedule}`,
    `--time-zone=${schedulerConfig.defaults.timeZone}`,
    `--max-retry-attempts=${schedulerConfig.defaults.maxRetryAttempts}`,
    `--min-backoff=${schedulerConfig.defaults.minBackoff}`,
    `--max-backoff=${schedulerConfig.defaults.maxBackoff}`,
    `--attempt-deadline=${expectedAttemptDeadline(job)}`,
    `--uri=${uri}`,
  ];
  if (isCreate) {
    args.push(
      '--http-method=POST',
      '--message-body={}',
      `--headers=Content-Type=application/json,X-Task-Secret=${getTaskSecret()}`,
      `--oidc-service-account-email=${schedulerConfig.serviceAccount}`,
      `--oidc-token-audience=${schedulerConfig.serviceUrl}`
    );
  }
  return args;
}

// 只認這份 config 實際會用到的 cron 語法（分鐘：單一值/逗號清單/*；小時：單一值/範圍/逗號清單/*），
// 不比對 day-of-month/day-of-week——兩個 job 只要有可能在同一天同一分鐘觸發就列為碰撞，要自己判斷
// 是不是真的有意義的重疊。
function expandMinuteField(field: string): number[] {
  if (field === '*') return Array.from({ length: 60 }, (_, i) => i);
  if (field.startsWith('*/')) {
    const step = Number(field.slice(2));
    const out: number[] = [];
    for (let m = 0; m < 60; m += step) out.push(m);
    return out;
  }
  return field.split(',').map(Number);
}

function expandHourField(field: string): number[] {
  if (field === '*') return Array.from({ length: 24 }, (_, i) => i);
  const out = new Set<number>();
  for (const part of field.split(',')) {
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      for (let h = start; h <= end; h++) out.add(h);
    } else {
      out.add(Number(part));
    }
  }
  return [...out];
}

function expandSchedule(cron: string): Set<string> {
  const [minuteField, hourField] = cron.split(' ');
  const minutes = expandMinuteField(minuteField);
  const hours = expandHourField(hourField);
  const times = new Set<string>();
  for (const h of hours) {
    for (const m of minutes) {
      times.add(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return times;
}

function checkCollisions(jobs: SchedulerJobConfig[]): void {
  const expanded = jobs.map((j) => ({ name: j.name, times: expandSchedule(j.schedule) }));
  const collisions: string[] = [];
  for (let i = 0; i < expanded.length; i++) {
    for (let j = i + 1; j < expanded.length; j++) {
      const shared = [...expanded[i].times].filter((t) => expanded[j].times.has(t));
      if (shared.length > 0) {
        collisions.push(`${expanded[i].name} vs ${expanded[j].name} at ${shared.join(', ')}`);
      }
    }
  }
  if (collisions.length > 0) {
    console.log(`\n[reconcile] ⚠️  MINUTE COLLISIONS in config (${collisions.length}) — review before applying:`);
    for (const c of collisions) console.log(`  ! ${c}`);
  } else {
    console.log('\n[reconcile] No minute collisions among configured jobs.');
  }
}

function assertConfigured(): void {
  const missing = (['serviceUrl', 'serviceAccount'] as const).filter((k) => schedulerConfig[k].startsWith('TODO_'));
  if (missing.length > 0) {
    console.error(`[reconcile] scheduler.config.ts 的 ${missing.join(', ')} 還是 placeholder，先填上 GCP 實際的值再跑。`);
    process.exit(1);
  }
}

function main() {
  const apply = process.argv.includes('--apply');
  assertConfigured();
  checkCollisions(schedulerConfig.jobs);
  console.log(`\n[reconcile] Fetching actual Cloud Scheduler state (location=${schedulerConfig.region})...`);
  const actual = listActualJobs();

  const configNames = new Set(schedulerConfig.jobs.map((j) => j.name));
  const toCreate: SchedulerJobConfig[] = [];
  const toUpdate: SchedulerJobConfig[] = [];
  const matched: string[] = [];

  for (const job of schedulerConfig.jobs) {
    const existing = actual.get(job.name);
    const expectedUri = `${schedulerConfig.serviceUrl}${job.path}`;
    if (!existing) {
      toCreate.push(job);
      continue;
    }
    if (
      existing.schedule !== job.schedule ||
      existing.timeZone !== schedulerConfig.defaults.timeZone ||
      existing.uri !== expectedUri ||
      existing.attemptDeadline !== expectedAttemptDeadline(job)
    ) {
      toUpdate.push(job);
      continue;
    }
    matched.push(job.name);
  }

  const extra = [...actual.keys()].filter((name) => !configNames.has(name));

  console.log(`\n[reconcile] ${matched.length}/${schedulerConfig.jobs.length} jobs already match.`);

  if (toCreate.length > 0) {
    console.log(`\n[reconcile] Missing (in config, not on Cloud Scheduler) — ${toCreate.length}:`);
    for (const job of toCreate) console.log(`  + ${job.name}  (${job.schedule})`);
  }

  if (toUpdate.length > 0) {
    console.log(`\n[reconcile] Mismatched (need update) — ${toUpdate.length}:`);
    for (const job of toUpdate) {
      const existing = actual.get(job.name)!;
      console.log(`  ~ ${job.name}`);
      if (existing.schedule !== job.schedule) console.log(`      schedule: ${existing.schedule}  ->  ${job.schedule}`);
      if (existing.timeZone !== schedulerConfig.defaults.timeZone) {
        console.log(`      timeZone: ${existing.timeZone}  ->  ${schedulerConfig.defaults.timeZone}`);
      }
      const expectedUri = `${schedulerConfig.serviceUrl}${job.path}`;
      if (existing.uri !== expectedUri) console.log(`      uri: ${existing.uri}  ->  ${expectedUri}`);
      if (existing.attemptDeadline !== expectedAttemptDeadline(job)) {
        console.log(`      attemptDeadline: ${existing.attemptDeadline || '(default)'}  ->  ${expectedAttemptDeadline(job)}`);
      }
    }
  }

  if (extra.length > 0) {
    console.log(`\n[reconcile] ⚠️  On Cloud Scheduler but not in scheduler.config.ts — ${extra.length} (not touched, review manually):`);
    for (const name of extra) console.log(`  ? ${name}`);
  }

  if (toCreate.length === 0 && toUpdate.length === 0) {
    console.log('\n[reconcile] Nothing to do — config and Cloud Scheduler already match.');
    return;
  }

  if (!apply) {
    console.log('\n[reconcile] Dry run only — re-run with --apply to create/update the jobs listed above.');
    return;
  }

  console.log('\n[reconcile] Applying changes...');
  for (const job of [...toUpdate, ...toCreate]) {
    const isCreate = toCreate.includes(job);
    const args = buildUpdateArgs(job, isCreate);
    console.log(`[reconcile] ${isCreate ? 'Creating' : 'Updating'} ${job.name}...`);
    try {
      runGcloud(args);
      console.log(`[reconcile] ${job.name}: done.`);
    } catch (error) {
      console.error(`[reconcile] ${job.name} failed: ${(error as Error).message}`);
    }
  }
  console.log('\n[reconcile] Done. Re-run without --apply to confirm everything now matches.');
}

main();
