import { Router } from 'ultimate-express';
import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestLaborBrokerEvaluation } from '@/domains/laborBrokerEvaluation/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/labor-broker-evaluation',
  summary: '向勞動部抓取私立就業服務機構（跨國人力仲介）評鑑結果',
  description:
    '透過勞動部開放資料 CSV（data.gov.tw/dataset/9332）抓取跨國人力仲介公司的年度評鑑成績：品質管理、違規處分（可為負分）、顧客服務、其他事項、總成績，以及「停業處分及申報暫停營業」「重大違法行為」兩個 Y/N 旗標。原始檔案用民國年，本服務統一轉成西元年存（跟其他 domain 一致）；目前涵蓋 2019/2020/2022/2023/2024 五個年度——2021（民國110）沒有辦評鑑，資料本來就跳號，不是抓漏。依 year + license_no 為主鍵，許可證號已正規化成跟許可名冊同一種格式可直接 join。每次呼叫整批刪除重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳評鑑紀錄筆數。' },
    502: { description: '向勞動部抓取或解析失敗。' },
  },
});

router.post('/labor-broker-evaluation', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestLaborBrokerEvaluation();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch labor broker evaluation results from MOL.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt labor broker evaluations: ${result.totalPoints} records.`, ...result });
  } catch (error) {
    console.error('Labor broker evaluation ingestion failed:', error);
    next(error);
  }
});

export default router;
