import { Router, type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestTdccShareholdingDistribution } from '@/domains/tdccShareholdingDistribution/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/tdcc-shareholding-distribution',
  summary: '向集保結算所抓取集保戶股權分散表',
  description:
    '透過 data.gov.tw/dataset/11452「集保戶股權分散表」登記的集保固定路徑 CSV（政府資料開放授權條款第 1 版）抓取全市場每檔證券的 17 個持股分級：人數、股數、占集保庫存數比例（%）。來源只給最新一期（週資料，資料日落在該週最後一個營業日），官方拿不到全市場歷史，所以每天抓、只新增不刪除：依 (symbol, data_date, holding_level) 為主鍵，已存在就跳過，同一期事後若有修正保留第一次抓到的版本；沒有 force 參數（整批重建會清掉補不回來的舊期數）。第 16 級是差異數調整、第 17 級是合計，都不是持股級距，照原樣存（全部加總會算成兩倍），export view 的 level_kind 標出 bracket／adjustment／total。全 0 的列也保留。2026-10-28 從 oingg-sitca-ts 接手。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '抓取完成，回傳總筆數、實際寫入筆數與跳過筆數。' },
    502: { description: '向集保抓取或解析失敗。' },
  },
});

router.post('/tdcc-shareholding-distribution', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestTdccShareholdingDistribution();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch shareholding distribution data from TDCC.', error: result.error });
    }
    res.status(200).json({
      message: `Ingested TDCC shareholding distribution: ${result.fetched} fetched, ${result.skipped} skipped (of ${result.totalPoints} points total).`,
      ...result,
    });
  } catch (error) {
    console.error('TDCC shareholding distribution ingestion failed:', error);
    next(error);
  }
});

export default router;
