import { parseCbcRateTable, type CbcApiResponse } from '@/adapters/cbc';
import type { CapitalMarketRateCategory, MonthlyCapitalMarketRatePoint, MonthlyGovBondYield10yPoint } from '@/domains/govBondYield10y/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 目標欄位在 data.structure 裡的顯示名稱（已用真實回應核對過，2026-08-28）。用名稱比對找欄位索引，
// 不寫死數字位置（例如「第 20 欄」）——CBC 官方文件沒承諾欄位順序永遠不變，用名稱比對比較不會因為
// 表格改版而悄悄抓錯欄。這支只取這一欄（CAPM 無風險利率）；整張表 20 欄由下面的 parseMonthlyCapitalMarketRates 存。
const TARGET_COLUMN_NAME = "Bond market-10-year gov't bond rates in secondary market";

// data.dataSets 每一列是 [期間字串, ...20個欄位的字串數值或 "-"]，期間字串格式如 "2026M06"。
export const parseMonthlyGovBondYield10y = (raw: CbcApiResponse): MonthlyGovBondYield10yPoint[] => {
  const tableKey = Object.keys(raw.data?.structure ?? {})[0];
  const columns = tableKey ? raw.data.structure[tableKey] : undefined;
  if (!columns) {
    throw new Error('CBC EG43M01en 回應缺少 data.structure，格式可能已變更。');
  }

  const columnIndex = columns.findIndex((col) => col.data === TARGET_COLUMN_NAME);
  if (columnIndex === -1) {
    throw new Error(`CBC EG43M01en 回應的 data.structure 找不到欄位「${TARGET_COLUMN_NAME}」，格式可能已變更。`);
  }

  const rows = raw.data?.dataSets;
  if (!Array.isArray(rows)) {
    throw new Error('CBC EG43M01en 回應缺少 data.dataSets，格式可能已變更。');
  }

  const points: MonthlyGovBondYield10yPoint[] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const period = row[0];
    if (typeof period !== 'string') continue;

    const match = period.match(/^(\d{4})M(\d{2})$/);
    if (!match) continue; // 格式不符預期的期間，跳過而不是猜

    // +1：row[0] 是期間字串，不是資料欄；"-" 是 CBC 的缺值標記
    const yieldRate = parseSourceNumber(row[columnIndex + 1], ['-'], `CBC EG43M01en ${period}`);
    if (yieldRate === null) continue;

    points.push({ year: Number(match[1]), month: Number(match[2]), yieldRate });
  }

  return points;
};

// 整張表 20 欄的顯示名稱 → category（2026-11-23 用 11-12 的銅層檔核對過，順序同來源）。
const CAPITAL_MARKET_RATE_COLUMNS: Readonly<Record<string, CapitalMarketRateCategory>> = {
  'Government bonds-3-year': 'gov_bond_3y',
  'Government bonds-5-year': 'gov_bond_5y',
  'Government bonds-7-year': 'gov_bond_7y',
  'Government bonds-10-year': 'gov_bond_10y',
  'Government bonds-15-year': 'gov_bond_15y',
  'Corporate bonds-1-year': 'corporate_bond_1y',
  'Corporate bonds-2-year': 'corporate_bond_2y',
  'Corporate bonds-3-year': 'corporate_bond_3y',
  'Corporate bonds-4-year': 'corporate_bond_4y',
  'Corporate bonds-5-year': 'corporate_bond_5y',
  'Corporate bonds-6-year': 'corporate_bond_6y',
  'Corporate bonds-7-year': 'corporate_bond_7y',
  'Corporate bonds-10-year': 'corporate_bond_10y',
  'Bank debentures-2-year': 'bank_debenture_2y',
  'Bank debentures-3-year': 'bank_debenture_3y',
  'Bank debentures-5-year': 'bank_debenture_5y',
  'Securities issued by CBC-CDs-1-year': 'cbc_cd_1y',
  'Securities issued by CBC-CDs-2-year': 'cbc_cd_2y',
  'Securities issued by CBC-SB-1-year': 'cbc_savings_bond_1y',
  [TARGET_COLUMN_NAME]: 'gov_bond_10y_secondary_market',
};

// 長表：一個（月, category）一列；"-"（多半是當月沒發行）不存列。
export const parseMonthlyCapitalMarketRates = (raw: CbcApiResponse): MonthlyCapitalMarketRatePoint[] =>
  parseCbcRateTable(raw, 'EG43M01en', CAPITAL_MARKET_RATE_COLUMNS);
