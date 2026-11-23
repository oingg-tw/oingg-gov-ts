import { Router } from 'ultimate-express';
import { ingestMonthlyMoneyMarketRateController } from '@/domains/monthlyMoneyMarketRate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/monthly-money-market-rate',
  summary: '向央行統計資料庫抓取貨幣市場利率月資料（全部 21 欄）',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG41M01en，"Money Market Interest Rates By Period"，金融統計月報 29.F 貨幣市場利率）抓取全部 21 欄：金融業拆款、商業本票初級／次級市場、可轉讓定期存單次級市場、銀行承兌匯票次級市場、國庫券初級／次級市場、公債附條件交易，各分天期。單次請求回傳 1987-M5 至今整段月資料，存成長表（一個月一個 category 一列，"-" 不存列），年息百分比（1.234 代表 1.234%）。網頁前端用它當短期利率，跟十年期公債次級市場殖利率算長短天期利差。依 year + month + category 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過），force 時整批刪除重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總列數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/monthly-money-market-rate', ingestMonthlyMoneyMarketRateController);

export default router;
