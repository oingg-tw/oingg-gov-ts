import { Router, type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestEcbPolicyRate } from '@/domains/ecbPolicyRate/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/ecb-policy-rate',
  summary: '向 ECB Data Portal 抓取歐洲央行三大政策利率的歷次調整事件',
  description:
    '透過 ECB Data Portal 的 SDMX REST API（免 API key）抓取四支日頻率序列並縫合：DFR（存款機制利率）、MLFR（邊際貸款機制利率），以及主要再融資利率的兩支——MRR_FR（固定利率標售，1999-01-01~2000-06-27、2008-10-15 起）與 MRR_MBR（最低投標利率，2000-06-28~2008-10-14，ECB 改採變動利率標售的那段）。刻意不走 FRED 的 ECBMRRFR 鏡像：那支把最低投標利率那 3,031 天填成字面上的 0.00，跟 2016-2022 真正的 0% 無法分辨。原始資料是每日持平值（10,134 天），本服務 diff 成「每列一次調整」的事件序列（約 69 筆），形狀跟 cbc_policy_rate / us_policy_rate 一致。三支利率不一定同步調整——ECB 有時只調整利率走廊寬度。沒有 force 參數，每次整批重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳事件筆數。' },
    502: { description: '向 ECB Data Portal 抓取或解析失敗。' },
  },
});

router.post('/ecb-policy-rate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestEcbPolicyRate();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch ECB key interest rates from the ECB Data Portal.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt ECB policy rate changes: ${result.totalPoints} events.`, ...result });
  } catch (error) {
    console.error('ECB policy rate ingestion failed:', error);
    next(error);
  }
});

export default router;
