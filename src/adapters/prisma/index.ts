import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config, stripQuotes } from '@/shared/config';

// Prisma 7 removed schema-level `url`/`directUrl` — the runtime client now needs a driver adapter
// passed in explicitly. Pooled connection (DATABASE_URL, 帶 -pooler) here; `prisma migrate` uses
// the direct (non-pooled) DIRECT_URL instead, configured separately in prisma.config.ts.
const adapter = new PrismaPg({ connectionString: stripQuotes(process.env.DATABASE_URL) });

// Instantiate a single PrismaClient instance to be used across the application.
export const prisma = new PrismaClient({
  adapter,
  // 'query' 開下去在批次 ingest（例如一次幾百筆 company-profile）時會洗版，開發環境只留 warn/error。
  log: config.isProduction ? ['error'] : ['warn', 'error'],
});

export const connectDb = async () => {
  try {
    await prisma.$connect();
    // Prisma 7 搭 driver adapter 時，$connect() 不會真的建立連線（要等第一個查詢才連）。2026-10-13 實測：
    // 本機 5432 沒有任何資料庫在跑、DATABASE_URL 是假值，照樣印出「Connected」並啟動成功——也就是說
    // 資料庫網址錯了或 Neon 掛了，啟動 log 一樣宣稱已連線，要等第一支排程 ingest 失敗才發現。跑一次
    // SELECT 1 才算真的驗證過；連不上就照原本的設計拒絕啟動（下面 catch 會 re-throw）。
    await prisma.$queryRaw`SELECT 1`;
    console.log('[db]: Connected to database.');
  } catch (error) {
    console.error('[db]: Could not connect to the database.', error);
    throw error; // Re-throw to be caught by the server starter and prevent server from starting.
  }
};

export default prisma;
