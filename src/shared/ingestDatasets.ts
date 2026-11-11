import { EXPORT_DATASET as businessCycleReferenceDate } from '@/domains/businessCycleReferenceDate/service';
import { EXPORT_DATASET as cbcPolicyRate } from '@/domains/cbcPolicyRate/service';
import { EXPORT_DATASET as dailyUsdTwdRate } from '@/domains/dailyUsdTwdRate/service';
import { EXPORT_DATASET as ecbPolicyRate } from '@/domains/ecbPolicyRate/service';
import { EXPORT_DATASET as fundBasicInfo } from '@/domains/fundBasicInfo/service';
import { EXPORT_DATASET as fundDailyNav } from '@/domains/fundDailyNav/service';
import { EXPORT_DATASET as govBondYield10y } from '@/domains/govBondYield10y/service';
import { EXPORT_DATASET as laborBrokerEvaluation } from '@/domains/laborBrokerEvaluation/service';
import { EXPORT_DATASET as laborBrokerLicense } from '@/domains/laborBrokerLicense/service';
import { EXPORT_DATASET as laborBrokerTaxRegistration } from '@/domains/laborBrokerTaxRegistration/service';
import { EXPORT_DATASET as monthlyBusinessCycleIndicator } from '@/domains/monthlyBusinessCycleIndicator/service';
import { EXPORT_DATASET as monthlyCpi } from '@/domains/monthlyCpi/service';
import { EXPORT_DATASET as monthlyFiveMajorBankRate } from '@/domains/monthlyFiveMajorBankRate/service';
import { EXPORT_DATASET as monthlyMonetaryAggregate } from '@/domains/monthlyMonetaryAggregate/service';
import { EXPORT_DATASET as monthlyStockMarketSummary } from '@/domains/monthlyStockMarketSummary/service';
import { EXPORT_DATASET as monthlyUnemploymentRate } from '@/domains/monthlyUnemploymentRate/service';
import { EXPORT_DATASET as quarterlyGdp } from '@/domains/quarterlyGdp/service';
import { EXPORT_DATASET as quarterlyUsGnpDeflator } from '@/domains/quarterlyUsGnpDeflator/service';
import { EXPORT_DATASET as usPolicyRate } from '@/domains/usPolicyRate/service';

// /api/ingest/<job> → ingestion_runs.dataset（= export view 名），直接引用各服務的 EXPORT_DATASET，不手抄。
// 銅層寫入失敗的 log 用它標資料集，shared/bronzeRun.ts 用它驗證重跑的紀錄是這個 job 的，
// scripts/replayIngest.ts 用它從資料集找回端點。
export const DATASET_BY_JOB: Record<string, string> = {
  'business-cycle-reference-date': businessCycleReferenceDate,
  'cbc-policy-rate': cbcPolicyRate,
  'daily-usd-twd-rate': dailyUsdTwdRate,
  'ecb-policy-rate': ecbPolicyRate,
  'fund-basic-info': fundBasicInfo,
  'fund-daily-nav': fundDailyNav,
  'gov-bond-yield-10y': govBondYield10y,
  'labor-broker-evaluation': laborBrokerEvaluation,
  'labor-broker-license': laborBrokerLicense,
  'labor-broker-tax-registration': laborBrokerTaxRegistration,
  'monthly-business-cycle-indicator': monthlyBusinessCycleIndicator,
  'monthly-cpi': monthlyCpi,
  'five-major-bank-rate': monthlyFiveMajorBankRate,
  'monthly-monetary-aggregate': monthlyMonetaryAggregate,
  'monthly-stock-market-summary': monthlyStockMarketSummary,
  'monthly-unemployment-rate': monthlyUnemploymentRate,
  'quarterly-gdp': quarterlyGdp,
  'quarterly-us-gnp-deflator': quarterlyUsGnpDeflator,
  'us-policy-rate': usPolicyRate,
};

// 重跑一段日期（scripts/replayIngest.ts）：SITCA 兩支的檔案只涵蓋最近 2 個交易日／當月，區間裡每一次都要依序重跑；
// 其他來源每個檔就是整段歷史或整份現況，只重跑最後一次就好（依序全跑，最後留下的也是最後那次）。
const SNAPSHOT_WINDOW_DATASETS = new Set([fundDailyNav, fundBasicInfo]);
export const pickRunsToReplay = <T>(dataset: string, runsInOrder: T[]): T[] =>
  SNAPSHOT_WINDOW_DATASETS.has(dataset) ? runsInOrder : runsInOrder.slice(-1);
