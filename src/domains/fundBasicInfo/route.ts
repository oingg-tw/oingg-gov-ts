import { Router } from 'ultimate-express';
import { ingestFundBasicInfoController } from '@/domains/fundBasicInfo/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/fund-basic-info',
  summary: '向投信投顧公會(SITCA)抓取境內基金基本資料',
  description:
    '透過 data.gov.tw 登記的 SITCA 開放資料集（43476）固定路徑 CSV（無查詢式 API）抓取，涵蓋境內基金公司名稱、基金名稱、統編、成立日期、規模、基金類型別（含 ETF，已用真實資料驗證：389/4433 列符合 ETF 類型，含被動與主動式）、投資地區、配息規定、ISIN Code、保管銀行、計價幣別。這份檔案本身是「當月快照」，每次 ingest 只新增當月一批，不會補到過去的月份。依 (year, month, isin_code) 為主鍵；已存在且未帶 force 就跳過，不覆寫。',
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

router.post('/fund-basic-info', ingestFundBasicInfoController);

export default router;
