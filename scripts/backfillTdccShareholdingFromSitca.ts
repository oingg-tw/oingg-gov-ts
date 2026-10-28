/**
 * 一次性：把 oingg-sitca-ts 累積的集保戶股權分散表歷史搬進 gov（2026-10-28 使用者裁定 gov 接手 11452）。
 *
 * 官方只給最新一期，sitca 從資料日 2026-09-18 起每天抓、累積下來的那幾期再也抓不回來，換手前要搬過來。
 * 值原樣搬（同一個集保來源），created_at／updated_at 用 sitca 的 fetched_at，讓「第一次抓到的時間」不變。
 * 已存在的 (symbol, data_date, holding_level) 跳過——gov 自己已經抓到的期數以 gov 為準。
 *
 * 用法（兩個連線字串都從環境變數給，不要寫進檔案或指令歷史）：
 *   DATABASE_URL=<gov>  SITCA_EXPORT_DATABASE_URL=<sitca 的 etl_reader>  npx tsx scripts/backfillTdccShareholdingFromSitca.ts
 *     → 只讀：列出兩邊每期列數
 *   同上再加 --apply → 寫入 gov，寫完再列一次兩邊每期列數供核對
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createManyChunked } from '../src/shared/createManyChunked';

const apply = process.argv.includes('--apply');

const connect = (name: string): PrismaClient => {
  const url = process.env[name];
  if (!url) throw new Error(`缺少環境變數 ${name}`);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
};

interface CountRow {
  data_date: string;
  n: bigint;
}

const countsByDate = async (db: PrismaClient, relation: 'sitca' | 'gov'): Promise<Map<string, number>> => {
  const rows =
    relation === 'sitca'
      ? await db.$queryRaw<CountRow[]>`SELECT to_char(data_date, 'YYYY-MM-DD') AS data_date, count(*) AS n FROM "export"."v_tdcc_shareholding_distributions" GROUP BY 1 ORDER BY 1`
      : await db.$queryRaw<CountRow[]>`SELECT to_char(data_date, 'YYYY-MM-DD') AS data_date, count(*) AS n FROM "public"."tdcc_shareholding_distribution" GROUP BY 1 ORDER BY 1`;
  return new Map(rows.map((r) => [r.data_date, Number(r.n)]));
};

const printCounts = (sitca: Map<string, number>, gov: Map<string, number>): void => {
  const dates = [...new Set([...sitca.keys(), ...gov.keys()])].sort();
  console.table(dates.map((d) => ({ data_date: d, sitca: sitca.get(d) ?? 0, gov: gov.get(d) ?? 0, same: (sitca.get(d) ?? 0) === (gov.get(d) ?? 0) })));
};

interface SitcaRow {
  symbol: string;
  holding_level: number;
  holder_count: string;
  shares: string;
  custody_pct: string;
  fetched_at: Date;
}

const main = async (): Promise<void> => {
  const gov = connect('DATABASE_URL');
  const sitca = connect('SITCA_EXPORT_DATABASE_URL');
  try {
    const sitcaCounts = await countsByDate(sitca, 'sitca');
    printCounts(sitcaCounts, await countsByDate(gov, 'gov'));
    if (!apply) {
      console.log('只讀模式，沒有寫入。確認無誤後加 --apply。');
      return;
    }

    // 一期一期搬，單期約 7 萬列，不一次把 40 幾萬列載進記憶體。
    for (const date of sitcaCounts.keys()) {
      const rows = await sitca.$queryRaw<SitcaRow[]>`
        SELECT symbol, holding_level, holder_count::text, shares::text, custody_pct::text, fetched_at
        FROM "export"."v_tdcc_shareholding_distributions" WHERE data_date = ${date}::date`;
      const dataDate = new Date(`${date}T00:00:00Z`);
      const inserted = await createManyChunked(
        (batch) => gov.tdccShareholdingDistribution.createMany({ data: batch, skipDuplicates: true }),
        rows.map((r) => ({
          symbol: r.symbol,
          dataDate,
          holdingLevel: r.holding_level,
          holderCount: BigInt(r.holder_count),
          shares: BigInt(r.shares),
          custodyPct: r.custody_pct,
          createdAt: r.fetched_at,
          updatedAt: r.fetched_at,
        }))
      );
      console.log(`${date}: sitca ${rows.length} 列，寫入 ${inserted}，跳過 ${rows.length - inserted}（gov 已有）`);
    }

    console.log('搬完後兩邊每期列數：');
    printCounts(sitcaCounts, await countsByDate(gov, 'gov'));
  } finally {
    await Promise.all([gov.$disconnect(), sitca.$disconnect()]);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
