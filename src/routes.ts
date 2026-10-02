import { Router } from 'ultimate-express';
import rootRouter from '@/domains/system/root';
import govBondYield10yRouter from '@/domains/govBondYield10y/route';
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
import fundBasicInfoRouter from '@/domains/fundBasicInfo/route';
import fundDailyNavRouter from '@/domains/fundDailyNav/route';
import companyProfileIngestRouter from '@/domains/companyProfile/ingestRoute';
import companyIndustryClassificationRouter from '@/domains/companyIndustryClassification/route';
import { requireTaskSecret } from '@/shared/middleware';
import { ingestRateLimit } from '@/shared/rateLimiter';
// 每新增一個 domain（例如 exchangeRate、interestRate），在這裡 import 其 route.ts 並掛進 ingestRouter。
//
// 2026-10-02 起只剩 /api/ingest 一個掛載點。原本還有 /api/query 掛三個查詢型 domain
// （companyProfile 的 queryRoute、companyBusinessItems、taxIndustryClassification，共 7 支端點），
// 整組移除——查過 twse-ts / tpex-ts / mops-ts / analysis-ts / bff-ts 的原始碼都沒有呼叫，
// analysis-ts 是直接讀 export schema 繞過 HTTP，bff-ts 則是硬規則只跟 analysis-ts 溝通。
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
ingestRouter.use(fundBasicInfoRouter);
ingestRouter.use(fundDailyNavRouter);
ingestRouter.use(companyProfileIngestRouter);
ingestRouter.use(companyIndustryClassificationRouter);

router.use('/api/ingest', ingestRouter);

export default router;
