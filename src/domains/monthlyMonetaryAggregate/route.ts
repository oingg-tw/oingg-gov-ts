import { Router } from 'ultimate-express';
import { ingestMonthlyMonetaryAggregateHandler } from '@/domains/monthlyMonetaryAggregate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/monthly-monetary-aggregate',
  summary: '向央行統計資料庫抓取貨幣總計數（M1A/M1B/M2）月資料',
  description:
    '透過 CBC 統計資料庫 API（FileName=EF15M01en，"Monetary Aggregates-A.Averages of Daily Figures"）抓取，v_monthly_monetary_aggregates 放 M1A/M1B/M2 三個總計數的餘額（百萬新台幣）與年增率（%）；全部 15 項（含通貨、各類存款、準貨幣細項）2026-11-23 起另存 v_monthly_monetary_aggregate_components（長表）。刻意取「日平均」而非「月底餘額」——市場慣用的 M1B/M2 年增率與黃金交叉是用日平均算的。單次請求回傳 1987-M5 至今整段月資料，沒有 backfill 的區分。年增率在資料起始年份為 null（無前一年可比）。依 year + month 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過）。CBC 會回頭修正近期月份的數字，同鍵覆寫會自動吸收修正值。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: { body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } } },
  responses: {
    200: { description: '抓取完成，回傳總月數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/monthly-monetary-aggregate', ingestMonthlyMonetaryAggregateHandler);

export default router;
