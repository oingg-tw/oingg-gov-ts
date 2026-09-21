import { Router } from 'ultimate-express';
import { ingestDailyUsdTwdRateHandler } from '@/domains/dailyUsdTwdRate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/daily-usd-twd-rate',
  summary: '向央行統計資料庫抓取新台幣兌美元即期匯率日資料',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG51D01en，"Spot Exchange Rates and Interest Rates on Accommodations for Usance L/C" 日頻率版本）抓取，取銀行對客戶買匯/賣匯與台北外匯市場收盤價三欄，單位是每 1 美元兌新台幣元。注意這份是隨 CBC《金融統計月報》按月批次補上的，日資料但落後約一個月，適合歷史上跟股價日線對照，不是即時報價。代碼表上的 BP01D01en 是停更序列（只到 2012-05），不能用。單次請求回傳 1992-01-04 至今全部交易日（約 9,000 筆）。依 trade_date 為主鍵；已存在且未帶 force 就跳過。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: { body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } } },
  responses: {
    200: { description: '抓取完成，回傳總交易日數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/daily-usd-twd-rate', ingestDailyUsdTwdRateHandler);

export default router;
