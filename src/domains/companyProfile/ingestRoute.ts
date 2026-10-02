import { Router } from 'ultimate-express';
import { registerCompanyProfileController, refreshTrackedCompanyProfilesController, registerBodySchema } from '@/domains/companyProfile/controller';
import { registry } from '@/adapters/swagger/registry';

const router = Router();

registry.registerPath({
  method: 'post',
  path: '/api/ingest/company-profile',
  summary: '批次登記公司主檔（證券代碼＋統編陣列），並向 GCIS 抓取營業項目存檔',
  description:
    '外部一次把整批「證券代碼＋統一編號」配對傳進來（最多 200 筆，超過請分批送），呼叫端自行保證配對正確，本服務不驗證兩者是否真的對應同一家公司。陣列進到 gov 之後逐筆序列處理（不平行送），每一筆都用統編向 GCIS 商工登記資料查詢，把公司基本資料（名稱/狀態/設立日期）存進 company_profiles。GCIS 同一個回應也附帶營業項目，2026-10-02 起不再落地（原本存在 company_business_items，隨那個沒做成的橋接功能一起移除）。單一統編若已有資料，預設直接跳過、不打 GCIS；帶 force=true 才會整批都重新抓取並覆寫（含 stockCode）。對 GCIS 的請求本身有節流，同一 process 內每次呼叫至少間隔 1 秒，避免短時間連續打被暫時鎖——這也是逐筆序列處理而非平行處理的原因之一。對 GCIS 的請求失敗（連不上、非 200）會自動重試最多 2 次（間隔遞增 2s/4s）；「查無此統編」不算失敗，不會重試。單筆處理失敗（重試後仍失敗、stockCode 衝突等）不會中斷整批，會照實記錄在該筆的 result 裡，繼續處理下一筆。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  request: {
    body: { content: { 'application/json': { schema: registerBodySchema } } },
  },
  responses: {
    200: { description: '批次處理完成，回傳整體統計（total/succeeded/skipped/failed）與逐筆 results。' },
    400: { description: '請求格式錯誤（例如陣列為空、超過 200 筆、代碼格式不對）。' },
  },
});

router.post('/company-profile', registerCompanyProfileController);

registry.registerPath({
  method: 'post',
  path: '/api/ingest/company-profile/refresh-tracked',
  summary: '重新抓取目前所有已追蹤公司的 GCIS 營業項目',
  description:
    '不需要外部提供清單——清單直接從 company_profiles 現有資料撈（目前有多少家就處理多少家，不寫死數字），對每一家強制 force=true 重新向 GCIS 抓取並覆寫（公司登記狀態可能變動過，這個端點存在的目的就是刷新，不是像 POST /company-profile 那樣有「已存在就跳過」的邏輯）。逐筆序列處理，同樣受 GCIS client 的節流與重試保護。目前追蹤清單有 1000+ 家，這是同步、long-running 的請求——GCIS 節流下大約每家 1 秒，全部跑完可能要 15-20 分鐘，呼叫端（例如排程器）要設夠長的逾時時間。回應不含每筆的完整 profile（避免回應本體過大），只回統計數字與失敗清單。注意這支**只能刷新，不會長出新公司**——清單來源就是 company_profiles 自己。',
  tags: ['Ingestion'],
  security: [{ TaskSecret: [] }],
  responses: {
    200: { description: '處理完成，回傳整體統計（total/succeeded/failed）與失敗清單。' },
  },
});

router.post('/company-profile/refresh-tracked', refreshTrackedCompanyProfilesController);

export default router;
