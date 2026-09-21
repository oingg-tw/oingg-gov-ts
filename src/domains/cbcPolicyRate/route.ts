import { Router } from 'ultimate-express';
import { ingestCbcPolicyRateHandler } from '@/domains/cbcPolicyRate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/cbc-policy-rate',
  summary: '向央行統計資料庫抓取政策利率（重貼現率等）的歷次調整事件',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG28D01en，"Rates of Central Bank By Period" 日頻率版本）抓取。這份回應不是每日快照，而是「每次利率調整的生效日」一列（1989-04-01 起，目前 77 列），三個欄位分別是重貼現率（央行升降息的基準利率）、擔保放款融通利率、短期融通利率，同日同步調整。用途是當作升息/降息事件日疊在股價序列上做事件研究；月頻率版本不另存，可從本表依生效日推出任一月份的利率水準。單次請求回傳全部歷史，沒有 backfill 的區分。存的是百分比數字（2.000 代表 2.000%）。依 effective_date 為主鍵；已存在且未帶 force 就跳過。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總事件數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/cbc-policy-rate', ingestCbcPolicyRateHandler);

export default router;
