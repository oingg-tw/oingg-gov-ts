import type { CbcApiResponse } from '@/adapters/cbc';
import type { MonthlyGovBondYield10yPoint } from '@/domains/govBondYield10y/types';
import { parseSourceNumber } from '@/shared/parseSourceValue';

// 目標欄位在 data.structure 裡的顯示名稱（已用真實回應核對過，2026-08-28）。用名稱比對找欄位索引，
// 不寫死數字位置（例如「第 20 欄」）——CBC 官方文件沒承諾欄位順序永遠不變，用名稱比對比較不會因為
// 表格改版而悄悄抓錯欄。刻意只取這一欄：EG43M01en 整份「資本市場利率」表還有 19 個公司債/銀行債/
// 央行存單欄位，都跟 CAPM 無風險利率這個用途無關，不在這裡處理。
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
