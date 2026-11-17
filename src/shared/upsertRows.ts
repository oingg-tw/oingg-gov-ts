import { Prisma } from '@prisma/client';
import prisma from '@/adapters/prisma/index';

/**
 * 同鍵覆寫（使用者 2026-11-17 核准）：來源回頭修正的數字要進來。原本不帶 force 是 createMany skipDuplicates，只新增、
 * 不覆寫，國發會每月重算整段景氣指標，PRD 537 個月有 536 個月跟官方不同。
 *
 * - 新鍵插入；同鍵只有值真的變了才更新，並把 updated_at 設成現在。比的是轉成欄位型別之後的值（EXCLUDED 已經是欄位
 *   型別），numeric 的小數位數不會讓沒變的列每天都算成變了。值沒變的列不動，每天重抓照樣是 no-op。
 * - 不刪來源已經沒有的列，那是 force 的事。
 * - 表名、欄名從 Prisma 的 model 定義拿（@map），呼叫端給 model 名和衝突鍵（主鍵或唯一約束的欄位）。
 * - 分批理由同 createManyChunked：壓低 Prisma 建參數的記憶體平台；每批各自提交，中途失敗下次重跑會補齊。
 */
export const upsertRows = async (
  model: Prisma.ModelName,
  keys: string[],
  data: object[],
  chunkSize = 500
): Promise<{ inserted: number; updated: number }> => {
  const first = data[0];
  if (!first) return { inserted: 0, updated: 0 };
  const meta = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
  if (!meta) throw new Error(`找不到 model ${model}`);
  const column = (field: string) => {
    const f = meta.fields.find((x) => x.name === field);
    if (!f) throw new Error(`${model} 沒有欄位 ${field}`);
    return `"${f.dbName ?? f.name}"`;
  };
  const fields = Object.keys(first);
  const values = fields.filter((f) => !keys.includes(f));
  const table = `"${meta.schema ?? 'public'}"."${meta.dbName ?? model}"`;
  const insertColumns = fields.map(column).join(', ');
  const conflict = keys.map(column).join(', ');
  const set = values.map((f) => `${column(f)} = EXCLUDED.${column(f)}`).join(', ');
  const changed = `(${values.map((f) => `t.${column(f)}`).join(', ')}) IS DISTINCT FROM (${values.map((f) => `EXCLUDED.${column(f)}`).join(', ')})`;

  let inserted = 0;
  let updated = 0;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const rows = data
      .slice(offset, offset + chunkSize)
      .map((row) => Prisma.sql`(${Prisma.join(fields.map((f) => (row as Record<string, unknown>)[f] ?? null))})`);
    const result = await prisma.$queryRaw<{ inserted: boolean }[]>`
      INSERT INTO ${Prisma.raw(table)} AS t (${Prisma.raw(insertColumns)}) VALUES ${Prisma.join(rows)}
      ON CONFLICT (${Prisma.raw(conflict)}) DO UPDATE SET ${Prisma.raw(set)}, "updated_at" = now() WHERE ${Prisma.raw(changed)}
      RETURNING (xmax = 0) AS inserted`;
    for (const r of result) {
      if (r.inserted) inserted++;
      else updated++;
    }
  }
  console.log(`[upsert] ${table}: ${data.length} rows, inserted ${inserted}, updated ${updated}`);
  return { inserted, updated };
};
