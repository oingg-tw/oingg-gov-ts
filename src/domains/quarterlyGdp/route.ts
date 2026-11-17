import { Router } from 'ultimate-express';
import { ingestQuarterlyGdpController } from '@/domains/quarterlyGdp/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/quarterly-gdp',
  summary: '向主計總處抓取國民所得統計－GDP貢獻度－依支出分季資料',
  description:
    '透過主計總處固定路徑統計檔案（無正式 REST API，只能整份下載）抓取，涵蓋經濟成長率本身，加上國內需求（民間消費/政府消費/固定資本形成〈民間/公營/政府〉/存貨變動）跟國外淨需求（商品及服務輸出/進口）共 12 個項目，官方原始檔案就只有這 12 個，全部保留（不像 CPI 要從 81 個細項篩選）。單次請求就回傳 1981Q1 至今整段季資料，每個項目同時有「原始值」（百分點貢獻度）跟「年增率(%)」兩種數值，合併存成同一列。依 (year, quarter, category) 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過）。',
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

router.post('/quarterly-gdp', ingestQuarterlyGdpController);

export default router;
