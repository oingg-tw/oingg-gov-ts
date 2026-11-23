import { Router } from 'ultimate-express';
import { ingestQuarterlyGdpExpenditureController } from '@/domains/quarterlyGdpExpenditure/controller';
import { forceIngestBodySchema } from '@/shared/openapiSchemas';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/quarterly-gdp-expenditure',
  summary: '向主計總處抓取國內生產毛額及平減指數依支出分（季）',
  description:
    '抓取主計總處固定路徑 XML（na8102a6q.xml，國民所得統計「國內生產毛額及平減指數依支出分-季(1981以後)」），1981Q1 至今整段歷史。17 個項目（民間消費、政府消費、資本形成、固定資本形成、存貨變動、輸出入及其商品／其他、國內需求、國外淨需求、GDP、國外要素所得淨額、對外貿易條件變動損益、GNI），每季每項一列，三組值各帶年增率：當期價格（新台幣百萬元）、連鎖實質值（目前以 2021 為參考年，新台幣百萬元；它的年增率就是各項目的實質成長率）、平減指數（目前 2021 = 100）。來源空字串存 null（例如存貨變動、國外淨需求沒有年增率）。跟 /quarterly-gdp（貢獻度）是不同檔：那份檔的「年增率」是貢獻度本身的年增率，不是各項目的成長率。依 year + quarter + category 為主鍵；未帶 force 時同鍵覆寫（新鍵插入、值變了才更新、沒變的跳過），force 時整批刪除重建。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { required: false, content: { 'application/json': { schema: forceIngestBodySchema } } },
  },
  responses: {
    200: { description: '抓取完成，回傳總列數、實際寫入筆數與跳過筆數。' },
    400: { description: '請求的參數格式錯誤。' },
    502: { description: '向主計總處抓取或解析失敗。' },
  },
});

router.post('/quarterly-gdp-expenditure', ingestQuarterlyGdpExpenditureController);

export default router;
