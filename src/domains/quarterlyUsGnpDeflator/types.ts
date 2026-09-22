export interface QuarterlyUsGnpDeflatorPoint {
  year: number; // 西元年
  quarter: number; // 1-4
  indexValue: number; // GNP 隱含物價平減指數，FRED 原值，2017 = 100
}
