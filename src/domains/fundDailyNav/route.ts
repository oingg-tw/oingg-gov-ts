import { Router } from 'ultimate-express';
import { ingestFundDailyNavController } from '@/domains/fundDailyNav/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/fund-daily-nav',
  summary: '向投信投顧公會(SITCA)抓取境內基金每日淨值',
  description:
    '透過 data.gov.tw 登記的 SITCA 開放資料集（11109）固定路徑 CSV（無查詢式 API）抓取，涵蓋每檔基金（含 ETF）當日淨值、漲跌、漲跌幅。已用真實檔案核對過：單次回應含 2 個交易日（滾動窗口，不是只有最新一天），下次 ingest 會有 1 天重疊，靠唯一約束處理不會重複寫入。依 (trade_date, beneficiary_code) 為主鍵；已存在且未帶 force 就跳過，不覆寫。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總筆數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 SITCA 抓取或解析失敗。' },
  },
});

router.post('/fund-daily-nav', ingestFundDailyNavController);

export default router;
