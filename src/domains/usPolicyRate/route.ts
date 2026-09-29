import { Router, type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestUsPolicyRate } from '@/domains/usPolicyRate/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/us-policy-rate',
  summary: '向 FRED 抓取美國聯邦基金目標利率的歷次調整事件',
  description:
    '透過 FRED 固定路徑 CSV（免 API key）抓取三個序列並縫合成一條事件序列：DFEDTAR（單一目標值，1982-09-27 → 2008-12-15）＋ DFEDTARU/DFEDTARL（目標區間上下限，2008-12-16 起）。Fed 在 2008-12-16 把制度從單一目標改為目標區間，所以歷史必須跨這條分界縫合；單一目標值那段把上下限存成同一個數字，讓下游一套欄位邏輯就能通用。FRED 原始資料是每日持平值（9,577 + 6,495 個日資料點），本服務 diff 相鄰值轉成「每列一次調整」的事件序列（約 190 筆），形狀跟 cbc_policy_rate 一致，下游不用自己找變動點。沒有 force 參數，每次整批重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳事件筆數。' },
    502: { description: '向 FRED 抓取或解析失敗。' },
  },
});

router.post('/us-policy-rate', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestUsPolicyRate();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch US federal funds target rate from FRED.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt US policy rate changes: ${result.totalPoints} events.`, ...result });
  } catch (error) {
    console.error('US policy rate ingestion failed:', error);
    next(error);
  }
});

export default router;
