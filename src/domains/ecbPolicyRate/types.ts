export interface EcbPolicyRatePoint {
  effectiveDate: Date; // 利率生效日（UTC 午夜）
  // 三個百分比數字（2.50 代表 2.50%），可以是負的——歐元區 2014-06 ~ 2022-07 存款機制利率為負。
  depositFacilityRate: number;
  mainRefinancingRate: number;
  marginalLendingRate: number;
  // mainRefinancingRate 這個數字來自「最低投標利率」（變動利率標售）而不是「固定標售利率」時為 true。
  // 見 parser.ts；這是 ECB 自己拆成兩支序列的區別，不要在這裡抹平。
  mainRefinancingIsMinimumBid: boolean;
}
