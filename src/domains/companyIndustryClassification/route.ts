import { Router } from 'ultimate-express';
import { ingestCompanyIndustryClassificationController } from '@/domains/companyIndustryClassification/controller';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/company-industry-classification',
  summary: '為已登記的公司回填官方行業分類代碼',
  description:
    '對 company_profiles 裡目前追蹤的每一家公司，下載財政部財政資訊中心《全國營業(稅籍)登記資料集》（data.gov.tw/dataset/9400，約 322MB、171 萬列全國登記營業人，無查詢式 API，只能整份下載再過濾——用串流逐行處理，不會整份載進記憶體），找出該統編「總公司本身」的登記列（統一編號=自己、總機構統一編號=空白），取其行業代號（一列最多 4 組：主要+次要1/2/3，實測驗證過台積電同一列就有 3 組），逐組轉換成 tax_industry_classification 的 subclass 代碼格式後整批寫進 company_industry_classifications（用 rank 欄位區分 0=主要、1/2/3=次要；每次重新 ingest 對該公司整批刪除重建，不逐筆比對更新）。這是官方稅籍登記指派的行業別，不是拿 GCIS 營業項目反推——後者一家公司常十幾筆、且代碼系統跟 tax_industry_classification 不同，雜訊很大（已用亞洲水泥實測驗證過兩者對不起來）；那條橋接沒有做成，落地用的 company_business_items 已於 2026-10-02 移除。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '回填完成，回傳追蹤家數、成功比對數（家）、實際寫入的分類列數（含次要代碼）、稅籍檔裡找不到的家數、行業代號對不到分類表的家數。' },
    502: { description: '下載或處理財政部稅籍登記資料失敗。' },
  },
});

router.post('/company-industry-classification', ingestCompanyIndustryClassificationController);

export default router;
