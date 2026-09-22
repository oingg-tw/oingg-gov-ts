import { Router } from 'ultimate-express';
import { type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestLaborBrokerTaxRegistration } from '@/domains/laborBrokerTaxRegistration/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/labor-broker-tax-registration',
  summary: '從財政部稅籍登記檔篩出登記為人力仲介/供應業的業者',
  description:
    '串流下載財政部《全國營業(稅籍)登記資料集》（約 322MB、171 萬列，無查詢式 API 只能整份下載），只保留行業代號屬於 7810-11 移工仲介 / 7810-99 其他人力仲介 / 7820-00 人力供應的總公司登記列。價值在於：**稅籍行業代號是唯一能用公開資料指認「這家公司實際在做移工仲介」的欄位**，公司名稱看不出來（實測登記為移工仲介的業者裡，名稱不含「人力/仲介/就業」的佔多數）。跟 labor_broker_license 交叉比對即可找出「有登記行業別但不在許可名冊上」的業者。只收總公司（分支機構跟著總公司的許可證走）。單次執行約需數分鐘（要掃完整份檔案），呼叫端請設足夠的逾時。每次整批刪除重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳掃描列數、寫入筆數與各行業代號筆數。' },
    502: { description: '下載或處理財政部稅籍登記資料失敗。' },
  },
});

router.post('/labor-broker-tax-registration', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestLaborBrokerTaxRegistration();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to process FIA business tax registry for labor brokers.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt labor broker tax registrations: ${result.totalPoints} businesses from ${result.scannedRows} rows.`, ...result });
  } catch (error) {
    console.error('Labor broker tax registration ingestion failed:', error);
    next(error);
  }
});

export default router;
