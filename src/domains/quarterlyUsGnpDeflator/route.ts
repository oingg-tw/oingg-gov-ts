import { Router } from 'ultimate-express';
import { ingestQuarterlyUsGnpDeflatorHandler } from '@/domains/quarterlyUsGnpDeflator/controller';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/quarterly-us-gnp-deflator',
  summary: '向 FRED 抓取美國 GNP 隱含物價平減指數季資料（GNPDEF）',
  description:
    '透過 FRED（美國聖路易聯邦準備銀行）序列頁面的固定路徑 CSV（fredgraph.csv?id=GNPDEF，免 API key）抓取，1947Q1 起，指數基期 2017 = 100。這是 gov-ts 第一個非台灣來源，用途是 analysis-ts 的 Ohlson O-Score：SIZE = log(總資產 × 美元匯率 ÷ GNP 物價指數)，指數要以 1968 年（四季平均）為基準重新標準化，這件事由下游做，本表存 FRED 原值。沒有 force 參數——BEA 每季發布後接下來兩個月各修正一次，FRED 整份重發，所以每次呼叫都整批刪除重建（300 多筆），確保修正值進來。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳季數。' },
    502: { description: '向 FRED 抓取或解析失敗。' },
  },
});

router.post('/quarterly-us-gnp-deflator', ingestQuarterlyUsGnpDeflatorHandler);

export default router;
