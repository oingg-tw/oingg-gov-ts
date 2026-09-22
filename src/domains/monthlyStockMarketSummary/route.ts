import { Router } from 'ultimate-express';
import { ingestMonthlyStockMarketSummaryHandler } from '@/domains/monthlyStockMarketSummary/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/monthly-stock-market-summary',
  summary: '向央行統計資料庫抓取上市股票市場月統計（含加權指數月平均，1987 年起）',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG27M01en，"Stock Market-B.Transactions of Listed Stock and Stock Price By Period"）抓取：上市公司家數、上市股票總面值/總市值/當月總成交值/日均成交值（百萬新台幣）、加權股價指數月平均（1966=100）及其年增率。1987-05 起，比 twse-ts 的 daily_taiex_index（1999 起）早 12 年，用途是把大盤歷史往前推、以及跟同為月頻率的總經指標對照；它是月平均不是月底收盤，跟日線比較時要注意。單次請求回傳整段歷史。依 year + month 為主鍵；已存在且未帶 force 就跳過。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: { body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } } },
  responses: {
    200: { description: '抓取完成，回傳總月數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/monthly-stock-market-summary', ingestMonthlyStockMarketSummaryHandler);

export default router;
