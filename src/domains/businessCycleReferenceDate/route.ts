import { Router, type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestBusinessCycleReferenceDate } from '@/domains/businessCycleReferenceDate/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/business-cycle-reference-date',
  summary: '向國發會抓取台灣歷次景氣循環峰谷日期',
  description:
    '透過國發會固定路徑 CSV（data.gov.tw/dataset/39486「台灣歷次景氣循環峰谷日期」，GODL v1）抓取歷次景氣循環的谷底1、高峰、谷底2（年月粒度，存成該月 1 日）與擴張期、收縮期、全循環月數（照來源原值，不自行推算）。1954 年起，2026-10-10 實測 15 次循環。來源最後一列「平均」是彙總列，跳過不存。目前這次循環尚未認定的轉折點與月數為 null。⚠️ 這份開放資料落後國發會自己的公告：國發會 2025-02-05 新聞稿已認定第 15 循環谷底為 2023 年 4 月（收縮期 15 個月、全循環 86 個月）並宣布進入第 16 循環，但資料集最後更新 2024-03-22，第 15 循環的谷底2仍為空、也沒有第 16 循環（2026-10-10 核對）。本服務只照來源原樣落地，不手動補值。每次整批刪除重建，沒有 force 參數——已認定的轉折點補上時既有列會被更新。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '重建完成，回傳循環數。' },
    502: { description: '向國發會抓取或解析失敗。' },
  },
});

router.post('/business-cycle-reference-date', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await ingestBusinessCycleReferenceDate();
    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch business cycle reference dates from NDC.', error: result.error });
    }
    res.status(200).json({ message: `Rebuilt business cycle reference dates: ${result.totalPoints} cycles.`, ...result });
  } catch (error) {
    console.error('Business cycle reference date ingestion failed:', error);
    next(error);
  }
});

export default router;
