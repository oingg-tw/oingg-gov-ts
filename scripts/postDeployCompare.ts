/**
 * 部署後自動比對（PRD 上線配套 6）：push main 前先 capture，第一輪排程跑完再 diff，有超過門檻的以 1 結束。
 * 怎麼比、門檻見 src/shared/postDeployCompare.ts。只讀：唯讀交易，快照存在本機暫存目錄（不進 repo、不進映像）。
 *
 * 用法：
 *   npx tsx --env-file=<env 檔> scripts/postDeployCompare.ts capture   push main 前
 *   npx tsx --env-file=<env 檔> scripts/postDeployCompare.ts diff      第一輪排程跑完後
 *
 * env 檔的 DATABASE_URL 連哪個庫就比哪個；快照照 endpoint 分檔，DEV 跟 PRD 不會拿錯。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import prisma from '../src/adapters/prisma/index';
import { CELL, compareSnapshots, NULL_CELL, VIEW_KEYS, type Snapshot, type ViewSnapshot } from '../src/shared/postDeployCompare';

const quote = (column: string) => `"${column}"`;
const joined = (columns: string[]) => (columns.length > 0 ? columns.map((c) => `${quote(c)}::text`).join(` || '|' || `) : `''`);

/** 每個 view 一列一筆：自然鍵、期別、各欄 md5 前幾碼接起來。欄名來自 information_schema 和 VIEW_KEYS，不是外部輸入 */
const fetchSnapshot = () =>
  prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const existing = await tx.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
        `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'export' ORDER BY table_name, ordinal_position`
      );
      const snapshot: Snapshot = {};
      for (const [view, { period = [], key = [] }] of Object.entries(VIEW_KEYS)) {
        const all = existing.filter((c) => c.table_name === view).map((c) => c.column_name);
        if (all.length === 0) continue; // view 不見了：diff 會把它整個算成少了
        const columns = all.filter((c) => ![...period, ...key, 'updated_at'].includes(c));
        const cells = columns.map((c) => `coalesce(left(md5(${quote(c)}::text), ${CELL}), '${NULL_CELL}')`).join(', ');
        const rows = await tx.$queryRawUnsafe<{ k: string; p: string; v: string }[]>(
          `SELECT ${joined(key)} AS k, ${joined(period)} AS p, concat(${cells}) AS v FROM export.${quote(view)}`
        );
        const byKey: ViewSnapshot['rows'] = {};
        for (const { k, p, v } of rows) {
          const periods = (byKey[k] ??= {});
          if (periods[p] !== undefined) throw new Error(`${view} 的 ${k}@${p} 不只一列：VIEW_KEYS 的自然鍵設錯了`);
          periods[p] = v;
        }
        snapshot[view] = { columns, rows: byKey };
      }
      return snapshot;
    },
    { timeout: 600_000 }
  );

const main = async () => {
  const mode = process.argv[2];
  if (mode !== 'capture' && mode !== 'diff') throw new Error('用法：npx tsx --env-file=<env 檔> scripts/postDeployCompare.ts capture|diff');
  const endpoint = new URL(process.env.DATABASE_URL ?? '').hostname.split('.')[0]!.replace(/-pooler$/, '');
  const dir = join(tmpdir(), 'oingg-post-deploy');
  const file = join(dir, `gov-ts-${endpoint}.json`);
  const now = await fetchSnapshot();
  const rows = Object.values(now).reduce((n, view) => n + Object.values(view.rows).reduce((m, periods) => m + Object.keys(periods).length, 0), 0);
  if (mode === 'capture') {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ endpoint, capturedAt: new Date().toISOString(), snapshot: now }));
    console.log(`部署前快照：${endpoint} ${Object.keys(now).length} 個 view、${rows} 列 → ${file}`);
    return;
  }

  const saved = JSON.parse(readFileSync(file, 'utf-8')) as { capturedAt: string; snapshot: Snapshot };
  const { results, flagged } = compareSnapshots(saved.snapshot, now);
  const sum = (pick: (r: (typeof results)[number]) => number) => results.reduce((n, r) => n + pick(r), 0);
  console.log(`${endpoint}：跟 ${saved.capturedAt} 的快照比，${results.length} 個 view、${rows} 列`);
  console.log(`  同一期改值 ${sum((r) => r.changed.length)}、少了 ${sum((r) => r.removed.length)}、多了 ${sum((r) => r.added)}`);
  const grown = results.filter((r) => r.added > 0).map((r) => `${r.view} +${r.added}`);
  if (grown.length > 0) console.log(`  多了的 view：${grown.join('、')}`);
  if (flagged.length === 0) {
    console.log('  沒有超過門檻的 view');
    return;
  }
  console.log(`  超過門檻的 view ${flagged.length} 個：`);
  for (const r of flagged) {
    const touched = [...r.changed, ...r.removed];
    const periods = touched.map(([, period]) => period).filter(Boolean).sort();
    const columns = Object.entries(r.changedColumns).map(([column, n]) => `${column} ${n}`);
    const detail = [
      `${r.before} → ${r.after} 列`,
      columns.length > 0 ? `改到的欄 ${columns.join('、')}` : '',
      periods.length > 0 ? `期別 ${periods[0]}～${periods.at(-1)}` : '',
      touched.length > 0 ? `例 ${touched.slice(0, 5).map((row) => row.filter(Boolean).join('@')).join('、')}` : '',
    ].filter(Boolean);
    console.log(`  - ${r.view}：${r.reasons.join('；')}（${detail.join('；')}）`);
  }
  process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
