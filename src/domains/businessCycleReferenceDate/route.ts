import { Router, type Request, type Response, type NextFunction } from 'ultimate-express';
import { ingestBusinessCycleReferenceDate } from '@/domains/businessCycleReferenceDate/service';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/business-cycle-reference-date',
  summary: '向國發會抓取台灣歷次景氣循環峰谷日期',
  description:
    '透過國發會固定路徑 CSV（data.gov.tw/dataset/39486「台灣歷次景氣循環峰谷日期」，GODL v1）抓取歷次景氣循環的谷底1、高峰、谷底2（年月粒度，存成該月 1 日）與擴張期、收縮期、全循環月數（照來源原值，不自行推算）。1954 年起，2026-10-10 實測 15 次循環。來源最後一列「平均」是彙總列，跳過不存。目前這次循環尚未認定的轉折點與月數為 null。⚠️ 這份開放資料落後國發會自己的公告：國發會 2025-02-05 新聞稿已認定第 15 循環谷底為 2023 年 4 月（收縮期 15 個月、全循環 86 個月）並宣布進入第 16 循環，但資料集最後更新 2024-03-22，第 15 循環的谷底2仍為空、也沒有第 16 循環（2026-10-10 核對）。使用者 2026-10-10 裁定可用國發會原始公告補足：只補資料集留空的欄位（資料集有值以資料集為準），每列的 supplemented_fields 記哪些欄位是補的、supplement_source 記出處（目前補了第 15 循環的谷底2／收縮期／全循環，並建立第 16 循環一列，出處皆為國發會 2025-02-05 新聞稿）。另有一筆更正（使用者 2026-10-21 核准）：資料集第 14 循環高峰寫 2014-01，但國發會 2016-01-18 新聞稿認定為 2014 年 10 月（該列自己的擴張 33／收縮 16 個月也只對得上 2014-10），改用公告值並同樣記在 supplemented_fields／supplement_source；只在資料集仍是 2014-01 時更正，資料集修好就自動失效，變成其他值則不動並記 log。每次整批刪除重建，沒有 force 參數——已認定的轉折點補上時既有列會被更新。',
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
