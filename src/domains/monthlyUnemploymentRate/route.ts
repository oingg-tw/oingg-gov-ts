import { Router } from 'ultimate-express';
import { ingestMonthlyUnemploymentRateController } from '@/domains/monthlyUnemploymentRate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/monthly-unemployment-rate',
  summary: '向主計總處抓取人力資源調查失業率月資料',
  description:
    '透過主計總處固定路徑統計檔案（無正式 REST API，只能整份下載）抓取，涵蓋總計/性別/年齡層（15-19至65歲以上）/教育程度共 21 個類別，官方檔案本來就有母子集重疊的分組（例如「國中及以下」包含「國小及以下」），這裡原樣保留全部類別，不做去重篩選。單次請求就回傳 1978 年至今整段月資料（第一列是年度摘要，沒有月份，會被跳過不收）。依 (year, month, category) 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過）。',
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

router.post('/monthly-unemployment-rate', ingestMonthlyUnemploymentRateController);

export default router;
