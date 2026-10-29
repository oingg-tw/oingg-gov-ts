import { Router } from 'ultimate-express';
import rootRouter from '@/domains/system/root';
import govBondYield10yRouter from '@/domains/govBondYield10y/route';
import monthlyFiveMajorBankRateRouter from '@/domains/monthlyFiveMajorBankRate/route';
import cbcPolicyRateRouter from '@/domains/cbcPolicyRate/route';
import monthlyMonetaryAggregateRouter from '@/domains/monthlyMonetaryAggregate/route';
import dailyUsdTwdRateRouter from '@/domains/dailyUsdTwdRate/route';
import quarterlyUsGnpDeflatorRouter from '@/domains/quarterlyUsGnpDeflator/route';
import usPolicyRateRouter from '@/domains/usPolicyRate/route';
import ecbPolicyRateRouter from '@/domains/ecbPolicyRate/route';
import monthlyStockMarketSummaryRouter from '@/domains/monthlyStockMarketSummary/route';
import laborBrokerLicenseRouter from '@/domains/laborBrokerLicense/route';
import laborBrokerEvaluationRouter from '@/domains/laborBrokerEvaluation/route';
import laborBrokerTaxRegistrationRouter from '@/domains/laborBrokerTaxRegistration/route';
import monthlyCpiRouter from '@/domains/monthlyCpi/route';
import quarterlyGdpRouter from '@/domains/quarterlyGdp/route';
import monthlyUnemploymentRateRouter from '@/domains/monthlyUnemploymentRate/route';
import monthlyBusinessCycleIndicatorRouter from '@/domains/monthlyBusinessCycleIndicator/route';
import businessCycleReferenceDateRouter from '@/domains/businessCycleReferenceDate/route';
import fundBasicInfoRouter from '@/domains/fundBasicInfo/route';
import fundDailyNavRouter from '@/domains/fundDailyNav/route';
import { requireTaskSecret } from '@/shared/middleware';
import { ingestRateLimit } from '@/shared/rateLimiter';
// 每新增一個 domain（例如 exchangeRate、interestRate），在這裡 import 其 route.ts 並掛進 ingestRouter。
//
// 2026-10-07 起 gov-ts 只有 /api/ingest，而且每一支都是排程觸發的——沒有查詢面，也沒有需要
// 外部帶 body 呼叫的端點。
//
// 兩波移除的紀錄：
// - 2026-10-02 拿掉 /api/query 的 7 支端點（companyProfile 查詢、companyBusinessItems、
//   taxIndustryClassification）。查過 twse-ts / tpex-ts / mops-ts / analysis-ts / bff-ts 都沒有呼叫。
// - 2026-10-07 拿掉公司產業分類整組（companyProfile 的 ingest、companyIndustryClassification、
//   GCIS adapter、三張表與 export view）。那組是為了「用財政部稅籍行業別做公司產業分類」而建的，
//   唯一的下游是 analysis-ts 的 Altman Z″ 製造業判斷；analysis-ts 2026-10-07 改用交易所類股，
//   兩市統一，不再讀 gov 任何產業分類 view（理由是上市用稅籍、上櫃用交易所分類會讓兩市的
//   「非製造業」定義不一致）。使用者裁定整組刪除。要重建的話 git 歷史在 7490e4d 之前。
//
// ingestRouter 整層掛了 requireTaskSecret + ingestRateLimit（跟 oingg-mops-ts 的做法一致：掛在
// router 層級一次涵蓋全部現有跟未來的 /api/ingest/*，不用每個 route.ts 各自標註）——這幾個端點會
// 真的去打 GCIS/CBC/財政部（company-industry-classification 甚至會下載 322MB 檔案），沒有保護的
// 話任何人知道 URL 就能觸發，見 oingg-conductor-ts 的 docs/conventions.md「TASK_SECRET」一節。

const router = Router();

// --- System & Root Routes ---
router.use(rootRouter);

// --- API Routes ---
const ingestRouter = Router();
ingestRouter.use(requireTaskSecret, ingestRateLimit);
ingestRouter.use(govBondYield10yRouter);
ingestRouter.use(monthlyFiveMajorBankRateRouter);
ingestRouter.use(cbcPolicyRateRouter);
ingestRouter.use(monthlyMonetaryAggregateRouter);
ingestRouter.use(dailyUsdTwdRateRouter);
ingestRouter.use(quarterlyUsGnpDeflatorRouter);
ingestRouter.use(usPolicyRateRouter);
ingestRouter.use(ecbPolicyRateRouter);
ingestRouter.use(monthlyStockMarketSummaryRouter);
ingestRouter.use(laborBrokerLicenseRouter);
ingestRouter.use(laborBrokerEvaluationRouter);
ingestRouter.use(laborBrokerTaxRegistrationRouter);
ingestRouter.use(monthlyCpiRouter);
ingestRouter.use(quarterlyGdpRouter);
ingestRouter.use(monthlyUnemploymentRateRouter);
ingestRouter.use(monthlyBusinessCycleIndicatorRouter);
ingestRouter.use(businessCycleReferenceDateRouter);
ingestRouter.use(fundBasicInfoRouter);
ingestRouter.use(fundDailyNavRouter);

router.use('/api/ingest', ingestRouter);

export default router;
