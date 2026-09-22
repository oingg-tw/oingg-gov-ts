import { Router } from 'ultimate-express';
import rootRouter from '@/domains/system/root';
import govBondYield10yRouter from '@/domains/govBondYield10y/route';
import cbcPolicyRateRouter from '@/domains/cbcPolicyRate/route';
import monthlyMonetaryAggregateRouter from '@/domains/monthlyMonetaryAggregate/route';
import dailyUsdTwdRateRouter from '@/domains/dailyUsdTwdRate/route';
import quarterlyUsGnpDeflatorRouter from '@/domains/quarterlyUsGnpDeflator/route';
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
import companyBusinessItemsRouter from '@/domains/companyBusinessItems/route';
import taxIndustryClassificationRouter from '@/domains/taxIndustryClassification/route';
import companyProfileIngestRouter from '@/domains/companyProfile/ingestRoute';
import companyProfileQueryRouter from '@/domains/companyProfile/queryRoute';
import companyIndustryClassificationRouter from '@/domains/companyIndustryClassification/route';
import { requireTaskSecret } from '@/shared/middleware';
import { ingestRateLimit } from '@/shared/rateLimiter';
// 每新增一個 domain（例如 exchangeRate、interestRate），在這裡 import 其 route.ts。
// 會寫入資料庫的 ingest 型 domain 掛進 ingestRouter（/api/ingest）；單純即時查詢、不落地的
// query 型 domain（例如 companyBusinessItems、taxIndustryClassification）掛進 queryRouter（/api/query）。
// 像 companyProfile 這種兩邊都有的 domain，拆成 ingestRoute.ts / queryRoute.ts 兩個檔案分別掛。
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

const queryRouter = Router();
queryRouter.use(companyBusinessItemsRouter);
queryRouter.use(taxIndustryClassificationRouter);
queryRouter.use(companyProfileQueryRouter);

router.use('/api/ingest', ingestRouter);
router.use('/api/query', queryRouter);

export default router;
