// 部署後自動比對（PRD 上線配套 6，2026-11-11 使用者定案；照數據中台 oingg-data-rust tools/post-deploy-compare.mjs 的同一套）。
// push main 前存一份每個 export view 的快照，第一輪排程跑完再抓一次（scripts/postDeployCompare.ts），逐個 view 比筆數、各欄空值率，
// 逐列分成「同一期改值、少了、多了」，超過門檻的列出來，就是這次部署的影響範圍。
// 跟範本不同的地方：gov 的 view 每個期別各一列，範本的「換到新期別」在這裡算「多了」、「退回舊期別」算「少了」；
// 雜湊每欄各一個，部署加了欄（先加新名）或刪了欄只比兩邊都有的欄，不會整個 view 都算改值，也看得出改到哪幾欄。

/** 每個 export view 的自然鍵（對應 prisma/schema.prisma 的 @id／@@unique）：period 是期別欄，key 是期別以外的鍵 */
export const VIEW_KEYS: Record<string, { period?: string[]; key?: string[] }> = {
  v_business_cycle_reference_dates: { key: ['cycle_no'] },
  v_cbc_policy_rates: { period: ['effective_date'] },
  v_daily_usd_twd_rates: { period: ['trade_date'] },
  v_ecb_policy_rates: { period: ['effective_date'] },
  v_fund_daily_navs: { period: ['trade_date'], key: ['beneficiary_code'] },
  v_fund_profiles: { period: ['year_month'], key: ['isin_code'] },
  v_monthly_business_cycle_indicators: { period: ['year_month'] },
  v_monthly_cpis: { period: ['year_month'], key: ['category'] },
  v_monthly_five_major_bank_rates: { period: ['year_month'] },
  v_monthly_gov_bond_yields_10y: { period: ['year_month'] },
  v_monthly_monetary_aggregates: { period: ['year_month'] },
  v_monthly_stock_market_summaries: { period: ['year_month'] },
  v_monthly_unemployment_rates: { period: ['year_month'], key: ['category'] },
  v_quarterly_gdps: { period: ['year', 'quarter'], key: ['category'] },
  v_quarterly_us_gnp_deflators: { period: ['year', 'quarter'] },
  v_us_policy_rates: { period: ['effective_date'] },
};

/** 門檻：同一期改值、少了超過 max(5 列, 1%)；任一欄空值率多 2 個百分點以上 */
export const THRESHOLDS = { minRows: 5, share: 0.01, nullRatePoints: 2 };

/** 每欄的雜湊取 md5 前 6 碼，空值記成 NULL_CELL；一列就是各欄雜湊照 columns 的順序接起來 */
export const CELL = 6;
export const NULL_CELL = '-'.repeat(CELL);

/** 一個 view 的快照：columns 是算雜湊的欄（自然鍵和 updated_at 以外的全部），rows[鍵][期別] 是那列各欄的雜湊 */
export type ViewSnapshot = { columns: string[]; rows: Record<string, Record<string, string>> };
export type Snapshot = Record<string, ViewSnapshot>;

const EMPTY: ViewSnapshot = { columns: [], rows: {} };

/** 兩份快照逐個 view 比；flagged 是超過門檻的 view（依同一期改值、少了的列數排序） */
export const compareSnapshots = (before: Snapshot, after: Snapshot, t = THRESHOLDS) => {
  const results = [...new Set([...Object.keys(before), ...Object.keys(after)])].map((view) => {
    const b = before[view] ?? EMPTY;
    const a = after[view] ?? EMPTY;
    // 兩邊都有的欄：[欄名, 在部署前那列的位置, 在現在那列的位置]
    const shared = b.columns.filter((c) => a.columns.includes(c)).map((c) => [c, b.columns.indexOf(c) * CELL, a.columns.indexOf(c) * CELL] as const);
    const cell = (cells: string, at: number) => cells.slice(at, at + CELL);
    const count = (counts: Record<string, number>, column: string) => (counts[column] = (counts[column] ?? 0) + 1);
    const r = { view, before: 0, after: 0, changed: [] as [string, string][], changedColumns: {} as Record<string, number>, removed: [] as [string, string][], added: 0, reasons: [] as string[] };
    const nullsBefore: Record<string, number> = {};
    const nullsAfter: Record<string, number> = {};
    for (const [key, periods] of Object.entries(b.rows)) {
      for (const [period, cells] of Object.entries(periods)) {
        r.before += 1;
        for (const [column, at] of shared) if (cell(cells, at) === NULL_CELL) count(nullsBefore, column);
        const now = a.rows[key]?.[period];
        if (now === undefined) {
          r.removed.push([key, period]);
          continue;
        }
        const diff = shared.filter(([, at, nowAt]) => cell(cells, at) !== cell(now, nowAt));
        if (diff.length > 0) r.changed.push([key, period]);
        for (const [column] of diff) count(r.changedColumns, column);
      }
    }
    for (const [key, periods] of Object.entries(a.rows)) {
      for (const [period, cells] of Object.entries(periods)) {
        r.after += 1;
        for (const [column, , at] of shared) if (cell(cells, at) === NULL_CELL) count(nullsAfter, column);
        if (b.rows[key]?.[period] === undefined) r.added += 1;
      }
    }
    const limit = Math.max(t.minRows, Math.ceil(r.before * t.share));
    const rate = (n: number | undefined, total: number) => (total ? ((n ?? 0) / total) * 100 : 0);
    r.reasons = [
      r.changed.length > limit ? `同一期改值 ${r.changed.length} 列` : '',
      r.removed.length > limit ? `少了 ${r.removed.length} 列` : '',
      ...shared.map(([column]) => {
        const points = rate(nullsAfter[column], r.after) - rate(nullsBefore[column], r.before);
        return points >= t.nullRatePoints ? `${column} 空值率多 ${points.toFixed(1)} 個百分點` : '';
      }),
    ].filter(Boolean);
    return r;
  });
  const flagged = results
    .filter((r) => r.reasons.length > 0)
    .sort((x, y) => y.changed.length + y.removed.length - (x.changed.length + x.removed.length));
  return { results, flagged };
};
