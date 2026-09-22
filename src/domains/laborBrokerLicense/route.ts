import { Router } from 'ultimate-express';
import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestLaborBrokerLicense } from '@/domains/laborBrokerLicense/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/labor-broker-license',
  summary: '向勞動部抓取跨國人力仲介公司許可名冊',
  description:
    '透過勞動部開放資料 CSV（data.gov.tw/dataset/6682，apiservice.mol.gov.tw 固定路徑，免 API key）抓取全部跨國人力仲介公司的許可證資料：許可證號、機構名稱/地址/電話、負責人、公司統一編號、專業及從業人員數、許可證起訖日、停業/復業/終止/廢止日期。**有統一編號**是這份資料的關鍵——可以跟財政部稅籍登記檔 join，查出「稅籍登記為移工仲介但不在許可名冊上」的業者。每次呼叫整批刪除重建（這是現況快照，許可證會展延/停業/廢止，不能只做新增），所以沒有 force 參數。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳許可證筆數。' },
    502: { description: '向勞動部抓取或解析失敗。' },
  },
});

router.post('/labor-broker-license', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestLaborBrokerLicense();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch cross-border labor broker license registry from MOL.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt labor broker license registry: ${result.totalPoints} licenses.`, ...result });
  } catch (error) {
    console.error('Labor broker license ingestion failed:', error);
    next(error);
  }
});

export default router;
