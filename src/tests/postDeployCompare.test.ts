import { describe, it, expect } from 'vitest';
import { compareSnapshots, NULL_CELL, VIEW_KEYS, type ViewSnapshot } from '@/shared/postDeployCompare';
import { DATASET_BY_JOB } from '@/shared/ingestDatasets';

// 部署後自動比對：逐列分同一期改值、少了、多了，門檻 max(5 列, 1%)；各欄空值率多 2 個百分點以上要列；只比兩邊都有的欄。
/** n 個鍵、每個鍵一個期別，每列各欄的雜湊都是 cells */
const view = (n: number, columns = ['x', 'y'], cells = 'aaaaaabbbbbb'): ViewSnapshot => ({
  columns,
  rows: Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, { '2026-10-01': cells }])),
});

describe('post-deploy compare', () => {
  it('counts changed, removed and added rows separately, with the max(5 rows, 1%) threshold', () => {
    const before = { a: view(100) };
    const after = { a: view(100) };
    for (let i = 0; i < 6; i += 1) after.a.rows[`k${i}`] = { '2026-10-01': 'aaaaaacccccc' }; // y 同一期改值 6 列 > 5
    after.a.rows.k10 = { '2026-10-01': 'aaaaaabbbbbb', '2026-11-01': 'aaaaaabbbbbb' }; // 多了新期別：正常，不算
    delete after.a.rows.k11; // 少了 1 列，沒超過
    const { results, flagged } = compareSnapshots(before, after);
    expect(results[0]).toMatchObject({ before: 100, after: 100, added: 1, changedColumns: { y: 6 }, removed: [['k11', '2026-10-01']] });
    expect(results[0]!.changed).toHaveLength(6);
    expect(flagged.map((r) => r.reasons)).toEqual([['同一期改值 6 列']]);
  });

  it('flags a 2-point rise in a column null rate and ignores columns the deploy added or dropped', () => {
    const before = { a: view(100) };
    // 部署加了 z（先加新名，舊列都是空值）、拿掉了 x：只比 y
    const after = { a: view(100, ['y', 'z'], `bbbbbb${NULL_CELL}`) };
    for (let i = 0; i < 3; i += 1) after.a.rows[`k${i}`] = { '2026-10-01': NULL_CELL + NULL_CELL }; // y 變空值 3 列
    const { results, flagged } = compareSnapshots(before, after);
    expect(results[0]!.changedColumns).toEqual({ y: 3 });
    expect(flagged.map((r) => r.reasons)).toEqual([['y 空值率多 3.0 個百分點']]);
  });

  it('counts every row of a view that disappeared as removed', () => {
    const { flagged } = compareSnapshots({ gone: view(20) }, {});
    expect(flagged.map((r) => r.reasons)).toEqual([['少了 20 列']]);
  });

  it('has a natural key for every dataset', () => {
    expect(Object.keys(VIEW_KEYS).sort()).toEqual(Object.values(DATASET_BY_JOB).sort());
  });
});
