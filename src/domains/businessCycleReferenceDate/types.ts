export interface BusinessCycleReferenceDatePoint {
  cycleNo: number; // 第幾次循環（1 起）
  // 來源是「年月」粒度（YYYYMM），存成該月 1 日的 DATE（UTC 午夜）。不是日期精度，下游別拿日來比。
  troughStart: Date; // 谷底1：循環起點
  peak: Date | null; // 高峰；新循環剛開始、尚未認定高峰時為 null
  troughEnd: Date | null; // 谷底2：循環終點；目前這次循環尚未認定谷底時為 null
  // 三個月數照來源原值存，不自己從日期推算（gov-ts 只落地，不衍生）。尚未認定的階段為 null。
  expansionMonths: number | null;
  contractionMonths: number | null;
  totalMonths: number | null;
}
