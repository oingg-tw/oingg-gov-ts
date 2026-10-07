import { Router } from 'ultimate-express';
import { ingestFiveMajorBankRate } from '@/domains/monthlyFiveMajorBankRate/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/five-major-bank-rate',
  summary: '向央行統計資料庫抓取五大銀行存款利率與基準放款利率月資料',
  description:
    '透過 CBC 統計資料庫 API（FileName=EG2BM01en，"Rates by five major banks By Period"）抓取整份三欄：一個月期定存、一年期定存、基準放款利率。單次請求就回傳 1987-M1 至今整段月資料（實測 476 列、零缺值），所以沒有單筆/backfill 的區分。存的是百分比數字（1.70 代表 1.70%）。依 year + month 為主鍵；已存在且未帶 force 就跳過，不覆寫。\n\n用途是**短天期無風險利率**：Sharpe／Sortino／Jensen α 這類風險調整後指標的無風險利率必須配衡量區間，用 10 年期公債（monthly_gov_bond_yield_10y）會把存續期風險溢酬算進超額報酬裡，而那正是這些指標要扣掉的東西。台灣沒有可用的國庫券序列可以照搬 Morningstar 的「3 個月國庫券」做法（CBC EG41M01en 的國庫券初級市場兩欄近期整段是 "-"，2026-10-07 實測），而定存是台灣在市場語言與法規層面的共同慣例——基金夏普值的定義是「過去 1 年平均月報酬率超過平均月定存利率的部分」，勞工退休金條例第 23 條的保證收益也是用「當地銀行二年期定期存款利率之平均數」。下游依窗口自己選天期：月報酬用一個月期，年窗口用一年期。基準放款利率跟無風險利率無關，是同一份回應附帶的，一起存。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總月數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向 CBC 抓取或解析失敗。' },
  },
});

router.post('/five-major-bank-rate', ingestFiveMajorBankRate);

export default router;
