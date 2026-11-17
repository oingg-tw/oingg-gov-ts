import { Router } from 'ultimate-express';
import { ingestGovBondYield10y } from '@/domains/govBondYield10y/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/gov-bond-yield-10y',
  summary: '向央行統計資料庫抓取10年期政府公債次級市場殖利率月資料',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG43M01en，"Capital Market Interest Rates By Period"）抓取，只取回應中「Bond market-10-year gov\'t bond rates in secondary market」這一欄——次級市場實際成交殖利率，適合當 CAPM 無風險利率；不是發行端得標利率，也不含同一份回應裡的公司債/銀行債/央行存單利率（跟這個用途無關）。單次請求就回傳 1987-M5 至今整段月資料，不像其他 domain 需要按公司/季度/年份分次請求，所以沒有單筆/backfill 的區分，也不需要節流間隔。存的是百分比數字（例如 1.234 代表 1.234%）。依 year + month 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過）。次級市場殖利率是歷史成交事實，理論上不會被事後修正，force 主要用於重跑時強制刷新。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總月數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/gov-bond-yield-10y', ingestGovBondYield10y);

export default router;
