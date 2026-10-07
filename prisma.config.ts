import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// CLI-only config (generate / migrate / studio). Runtime PrismaClient in
// src/adapters/prisma/index.ts sets up its own @prisma/adapter-pg adapter with DATABASE_URL —
// migrate needs the direct (non-pooled) connection instead, see NEON.md for why. Replaces the old
// prisma.config.js (broken, pre-Prisma-7 shape) and the deprecated package.json "prisma" block.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  // seed 已移除（2026-10-07）：唯一的 seed 是 tax_industry_classification 的靜態代碼字典，
  // 隨公司產業分類整組刪除。其餘每張表都是向官方來源 ingest 來的，沒有需要 seed 的靜態參考資料。
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
});
