import { Router } from 'ultimate-express';
import { ingestMonthlyCpiController } from '@/domains/monthlyCpi/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/monthly-cpi',
  summary: '向主計總處抓取消費者物價基本分類指數(CPI)月資料',
  description:
    '透過主計總處固定路徑統計檔案（無正式 REST API，只能整份下載）抓取，只取「總指數」跟七大類指數（食物/衣著/居住/交通及通訊/醫藥保健/教養娛樂/雜項），不收官方原始檔案裡完整的 81 個細項子分類——這是總經篩選因子用途，不是 CPI 籃子研究。單次請求就回傳 1981M01 至今整段月資料，每個項目同時有「原始值」（指數，基期見官方標註）跟「年增率(%)」兩種數值，合併存成同一列。依 (year, month, category) 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過）。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總筆數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向主計總處抓取或解析失敗。' },
  },
});

router.post('/monthly-cpi', ingestMonthlyCpiController);

export default router;
