import { parseCbcRateTable, type CbcApiResponse } from '@/adapters/cbc';
import type { MoneyMarketRateCategory, MonthlyMoneyMarketRatePoint } from '@/domains/monthlyMoneyMarketRate/types';

// 21 欄的顯示名稱 → category（2026-11-23 用真實回應核對過，順序同來源；中文欄名見 types.ts）。
const MONEY_MARKET_RATE_COLUMNS: Readonly<Record<string, MoneyMarketRateCategory>> = {
  'Interbank call loans': 'interbank_call_loan',
  'Commercial paper-Primary market-1-30 days': 'commercial_paper_primary_1_30d',
  'Commercial paper-Primary market-31-90 days': 'commercial_paper_primary_31_90d',
  'Commercial paper-Primary market-91-180 days': 'commercial_paper_primary_91_180d',
  'Commercial paper-Secondary market-1-30 days': 'commercial_paper_secondary_1_30d',
  'Commercial paper-Secondary market-31-90 days': 'commercial_paper_secondary_31_90d',
  'Commercial paper-Secondary market-91-180 days': 'commercial_paper_secondary_91_180d',
  'NCDs-Secondary market-1-90 days': 'negotiable_cd_secondary_1_90d',
  'NCDs-Secondary market-91-180 days': 'negotiable_cd_secondary_91_180d',
  "Bankers' acceptances-Secondary market-1-30 days": 'bankers_acceptance_secondary_1_30d',
  "Bankers' acceptances-Secondary market-31-90 days": 'bankers_acceptance_secondary_31_90d',
  "Bankers' acceptances-Secondary market-91-180 days": 'bankers_acceptance_secondary_91_180d',
  'Treasury bills-Primary market-1-91 days': 'treasury_bill_primary_1_91d',
  'Treasury bills-Primary market-92-182 days': 'treasury_bill_primary_92_182d',
  'Treasury bills-Primary market-183-364 days': 'treasury_bill_primary_183_364d',
  'Treasury bills-Secondary market-1-30 days': 'treasury_bill_secondary_1_30d',
  'Treasury bills-Secondary market-31-91 days': 'treasury_bill_secondary_31_91d',
  'Treasury bills-Secondary market-92-182 days': 'treasury_bill_secondary_92_182d',
  'RP on government bonds-Secondary market-1-30 days': 'gov_bond_repo_1_30d',
  'RP on government bonds-Secondary market-31-90 days': 'gov_bond_repo_31_90d',
  'RP on government bonds-Secondary market-91-180 days': 'gov_bond_repo_91_180d',
};

// 長表：一個（月, category）一列；"-" 不存列。
export const parseMonthlyMoneyMarketRates = (raw: CbcApiResponse): MonthlyMoneyMarketRatePoint[] =>
  parseCbcRateTable(raw, 'EG41M01en', MONEY_MARKET_RATE_COLUMNS);
