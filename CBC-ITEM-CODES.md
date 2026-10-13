# CBC Statistical Database — Item Code Catalog

Transcribed from the Central Bank of the Republic of China (Taiwan)'s official
document *"Introduction to the API of the CBC Statistical Database"*. This is
the source-of-truth for which `ItemCode` to pass to the query endpoint below —
use it instead of guessing codes.

## Query syntax

```
GET https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName={ItemCode}
```

Example: NTD-USD daily exchange rate is `BP01D01en`, so:
`https://cpx.cbc.gov.tw/API/DataAPI/Get?FileName=BP01D01en`

The response is JSON with three parts:

1. **header** — basic info about the item.
2. **dataset** — the actual data series.
3. **structure** — dimensional/column info for the dataset.

The exact shape of each part is not documented and appears to vary by item —
fetch a real item with `src/adapters/cbc/index.ts`'s `fetchCbcItem(itemCode)`
and inspect the real response before writing a parser (paste real JSON →
diff/fix, same workflow as oingg-mops-ts).

Item code suffixes encode the period: `Y` = Year, `Q` = Quarter, `M` = Month,
`D` = Day.

## ⚠️ Known anomalies in the source document

The source PDF lists the same code for two different periods in two places —
this looks like a typo in CBC's document, not a real API behavior:

- **Loans and Discounts at All Banks → By Amount**: both Year and Month rows
  are printed as `EI97Y01en`.
- **Bonds Market → Transactions**: both Year and Month rows are printed as
  `EG23Y01en`.

Verify these against a live request (or the CBC Statistical Database website)
before relying on them for the Month period.

## Item codes

### NTD-USD Exchange Rates
| Period | Code |
|---|---|
| Year | BP01Y01en |
| Month | BP01M01en |
| Day | BP01D01en |

### Key Financial Indicators
| Sub-item | Period | Code |
|---|---|---|
| Money | Year | EF01Y01en |
| Money | Month | EF01M01en |
| Deposits | Year | EF03Y01en |
| Deposits | Month | EF03M01en |
| Loans & Investments (measured at original costs) | Year | EFA4Y01en |
| Loans & Investments (measured at original costs) | Month | EFA4M01en |
| Financial Markets | Year | EF05Y01en |
| Financial Markets | Month | EF05M01en |
| Other | Year | EF07Y01en |
| Other | Month | EF07M01en |
| Seasonally Adjusted Key Financial Indicators | Month | EF10M01en |

### Money
| Sub-item | Period | Code |
|---|---|---|
| Reserve Money — Averages of Daily Figures | Year | EF11Y01en |
| Reserve Money — Averages of Daily Figures | Month | EF11M01en |
| Reserve Money — End of Month | Year | EF12Y01en |
| Reserve Money — End of Month | Month | EF12M01en |
| Reserve Money — Factors Responsible for Changes | Year | EF13Y01en |
| Reserve Money — Factors Responsible for Changes | Month | EF13M01en |
| Monetary Aggregates — Averages of Daily Figures | Year | EF15Y01en |
| Monetary Aggregates — Averages of Daily Figures | Month | EF15M01en |
| Monetary Aggregates — End of Month | Year | EF17Y01en |
| Monetary Aggregates — End of Month | Month | EF17M01en |
| Monetary Aggregates — Factors Responsible for Changes in M1B | Year | EF19Y01en |
| Monetary Aggregates — Factors Responsible for Changes in M1B | Month | EF19M01en |
| Monetary Aggregates — Factors Responsible for Changes in M2 | Year | EF21Y01en |
| Monetary Aggregates — Factors Responsible for Changes in M2 | Month | EF21M01en |
| Reserve Ratios | Day | EF71D01en |
| Reserve Requirements of Financial Institutions | Year | EF72Y01en |
| Reserve Requirements of Financial Institutions | Month | EF72M01en |
| Liquidity Ratio and Liquid Reserves of Other Monetary Financial Institutions | Year | EF73Y01en |
| Liquidity Ratio and Liquid Reserves of Other Monetary Financial Institutions | Month | EF73M01en |
| Liquid Liabilities | Year | EFA1Y01en |
| Liquid Liabilities | Month | EFA1M01en |

### Consolidated Assets and Liabilities — Financial Institutions
| Institution | Assets/Liabilities | Period | Code |
|---|---|---|---|
| Financial Institutions | Assets | Year | EF39Y01en |
| Financial Institutions | Assets | Month | EF39M01en |
| Financial Institutions | Liabilities | Year | EF41Y01en |
| Financial Institutions | Liabilities | Month | EF41M01en |
| Monetary Institutions | Assets | Year | EF35Y01en |
| Monetary Institutions | Assets | Month | EF35M01en |
| Monetary Institutions | Liabilities | Year | EF37Y01en |
| Monetary Institutions | Liabilities | Month | EF37M01en |
| Central Bank | Assets | Year | EF23Y01en |
| Central Bank | Assets | Month | EF23M01en |
| Central Bank | Liabilities | Year | EF25Y01en |
| Central Bank | Liabilities | Month | EF25M01en |
| Other Monetary Financial Banks | Assets | Year | EF27Y01en |
| Other Monetary Financial Banks | Assets | Month | EF27M01en |
| Other Monetary Financial Banks | Liabilities | Year | EF29Y01en |
| Other Monetary Financial Banks | Liabilities | Month | EF29M01en |
| Domestic Banks | Assets | Year | EF43Y01en |
| Domestic Banks | Assets | Month | EF43M01en |
| Domestic Banks | Liabilities | Year | EF45Y01en |
| Domestic Banks | Liabilities | Month | EF45M01en |
| Local Branches of Foreign Banks | Assets | Year | EF47Y01en |
| Local Branches of Foreign Banks | Assets | Month | EF47M01en |
| Local Branches of Foreign Banks | Liabilities | Year | EF49Y01en |
| Local Branches of Foreign Banks | Liabilities | Month | EF49M01en |
| Credit Cooperative Associations | Assets | Year | EF55Y01en |
| Credit Cooperative Associations | Assets | Month | EF55M01en |
| Credit Cooperative Associations | Liabilities | Year | EF57Y01en |
| Credit Cooperative Associations | Liabilities | Month | EF57M01en |
| Credit Departments of Farmers' and Fishermen's Associations | Assets | Year | EF59Y01en |
| Credit Departments of Farmers' and Fishermen's Associations | Assets | Month | EF59M01en |
| Credit Departments of Farmers' and Fishermen's Associations | Liabilities | Year | EF61Y01en |
| Credit Departments of Farmers' and Fishermen's Associations | Liabilities | Month | EF61M01en |
| Chunghwa Post Co. | Assets | Year | EF63Y01en |
| Chunghwa Post Co. | Assets | Month | EF63M01en |
| Chunghwa Post Co. | Liabilities | Year | EF64Y01en |
| Chunghwa Post Co. | Liabilities | Month | EF64M01en |
| Money Market Mutual Funds | Assets & Liabilities | Year | EG65Y01en |
| Money Market Mutual Funds | Assets & Liabilities | Month | EG65M01en |
| Trust and Investment Companies | Assets & Liabilities | Year | EF65Y01en |
| Trust and Investment Companies | Assets & Liabilities | Month | EF65M01en |
| Life Insurance Companies | Assets & Liabilities | Year | EF67Y01en |
| Life Insurance Companies | Assets & Liabilities | Month | EF67M01en |
| Property and Casualty Insurance Companies | Assets & Liabilities | Year | EG05Y01en |
| Property and Casualty Insurance Companies | Assets & Liabilities | Month | EG05M01en |
| Central Deposit Insurance Corporation | Assets & Liabilities | Year | EG03Y01en |
| Central Deposit Insurance Corporation | Assets & Liabilities | Month | EG03M01en |
| Bills Finance Companies | Assets & Liabilities | Year | EG07Y01en |
| Bills Finance Companies | Assets & Liabilities | Month | EG07M01en |
| Securities Finance Companies | Assets | Year | EGA9Y01en |
| Securities Finance Companies | Assets | Month | EGA9M01en |
| Securities Finance Companies | Liabilities | Year | EGB9Y01en |
| Securities Finance Companies | Liabilities | Month | EGB9M01en |
| Offshore Banking Units — Consolidated Assets and Liabilities | Assets & Liabilities | Month | EGA7M01en |
| Offshore Banking Units — Maturities of Major Assets and Liabilities | Assets & Liabilities | Quarter | EGC7Q01en |

### Deposits with All Banks
| Sub-item | Period | Code |
|---|---|---|
| By Account | Year | EI75Y01en |
| By Account | Month | EI75M01en |
| By Industry | Year | EI77Y01en |
| By Industry | Month | EI77M01en |
| By Sector | Year | EI79Y01en |
| By Sector | Month | EI79M01en |
| Time Deposits-By Maturity | Month | EI80M01en |
| Time Savings Deposits-By Maturity | Month | EI81M01en |
| Time Deposits-By Depositors | Month | EIA1M01en |
| Time Savings Deposits-By Depositors | Month | EI82M01en |
| Time Deposits-By Amount | Month | EI83M01en |
| Time Savings Deposits-By Amount | Month | EI84M01en |

### Loans and Discounts at All Banks
| Sub-item | Period | Code |
|---|---|---|
| By Account | Year | EI85Y01en |
| By Account | Month | EI85M01en |
| By Sector | Year | EI86Y01en |
| By Sector | Month | EI86M01en |
| By Industry | Year | EI87Y01en |
| By Industry | Month | EI87M01en |
| By Amount | Year | EI97Y01en |
| By Amount | Month | EI97Y01en ⚠️ (see anomalies) |
| By Maturity | Year | EI98Y01en |
| By Maturity | Month | EI98M01en |
| To Private & Government Enterprises in the Manufacturing Sector | Year | E95GY01en |
| To Private & Government Enterprises in the Manufacturing Sector | Month | E95GM01en |
| Consumer Loans and Loans for Construction | Year | EF99Y01en |
| Consumer Loans and Loans for Construction | Month | EF99M01en |
| Foreign Currency Loans at All Banks | Year | EG01Y01en |
| Foreign Currency Loans at All Banks | Month | EG01M01en |

### Interbank Call Loans
| Sub-item | Period | Code |
|---|---|---|
| Transactions by Institutions | Year | EG11Y01en |
| Transactions by Institutions | Month | EG11M01en |
| Transactions by Institutions | Day | EG11D01en |
| Amounts Outstanding by Institutions | Year | EG13Y01en |
| Amounts Outstanding by Institutions | Month | EG13M01en |
| Amounts Outstanding by Institutions | Day | EG13D01en |
| Transactions by Maturities | Year | EG15Y01en |
| Transactions by Maturities | Month | EG15M01en |
| Transactions by Maturities | Day | EG15D01en |
| Amounts Outstanding by Maturities | Year | EG16Y01en |
| Amounts Outstanding by Maturities | Month | EG16M01en |
| Amounts Outstanding by Maturities | Day | EG16D01en |

### Bills Market
| Sub-item | Period | Code |
|---|---|---|
| Transactions by Instruments | Year | EG17Y01en |
| Transactions by Instruments | Month | EG17M01en |
| Transactions by Customers | Year | EG19Y01en |
| Transactions by Customers | Month | EG19M01en |
| Issues, Redemptions and Amounts Outstanding of Bills | Year | EG21Y01en |
| Issues, Redemptions and Amounts Outstanding of Bills | Month | EG21M01en |

### Bonds Market
| Sub-item | Period | Code |
|---|---|---|
| Transactions | Year | EG23Y01en |
| Transactions | Month | EG23Y01en ⚠️ (see anomalies) |
| Issues, Redemptions and Amounts Outstanding of Government Bonds | Year | EGA4Y01en |
| Issues, Redemptions and Amounts Outstanding of Government Bonds | Month | EGA4M01en |
| Issues, Redemptions & Amounts Outstanding of Domestic Corporate Bonds and Bank Debentures | Year | EGB4Y01en |
| Issues, Redemptions & Amounts Outstanding of Domestic Corporate Bonds and Bank Debentures | Month | EGB4M01en |

### Stock Market
| Sub-item | Period | Code |
|---|---|---|
| Margin Trading | Year | EG25Y01en |
| Margin Trading | Month | EG25M01en |
| Transactions of Listed Stock and Stock Price Index | Year | EG27Y01en |
| Transactions of Listed Stock and Stock Price Index | Month | EG27M01en |

### Interest Rates
| Sub-item | Period | Code |
|---|---|---|
| Rates of Central Bank | Year | EG2AY01en |
| Rates of Central Bank | Month | EG2AM01en |
| Rates of Central Bank | Day | EG28D01en |
| Rates by five major banks | Year | EG2BY01en |
| Rates by five major banks | Month | EG2BM01en |
| Deposit Rates and Base Lending Rates Offered by Major Banks | Month | EG2WM01en |
| Deposit Rates and Base Lending Rate Offered by First Commercial Bank | Day | EG30D01en |
| Rates on Foreign Currency Deposits Offered by Authorized Foreign Exchange Banks | Month | EG3WM01en |
| Weighted Average Interest Rates on Deposits and Loans | Year | EG39Y01en |
| Weighted Average Interest Rates on Deposits and Loans | Quarter | EG39Q01en |
| New Loans and Interest Rates by Five Leading Banks | Year | EH45Y01en |
| New Loans and Interest Rates by Five Leading Banks | Month | EH45M01en |
| Interbank Call Loan Rates | Year | EG37Y01en |
| Interbank Call Loan Rates | Month | EG37M01en |
| Interbank Call Loan Rates | Day | EG37D01en |
| Money Market Interest Rates | Year | EG41Y01en |
| Money Market Interest Rates | Month | EG41M01en |
| Capital Market Interest Rates | Year | EG43Y01en |
| Capital Market Interest Rates | Month | EG43M01en |
| Interest Rates in Unorganized Money Markets | Month | EG45M01en |

### Foreign Exchange
| Sub-item | Period | Code |
|---|---|---|
| Export and Import Foreign Exchange Proceeds and Payments | Year | EG46Y01en |
| Export and Import Foreign Exchange Proceeds and Payments | Month | EG46M01en |
| Day Trading and Foreign Exchange Net Positions | Year | EG47Y01en |
| Day Trading and Foreign Exchange Net Positions | Month | EG47M01en |
| Taipei Foreign Currency Call Loan Market | Year | EG49Y01en |
| Taipei Foreign Currency Call Loan Market | Month | EG49M01en |
| Taipei Foreign Currency Call Loan Market | Day | EG49D01en |
| Spot Exchange Rates of the N.T. Dollar against the U.S. Dollar and Interest Rates on Accommodations for Usance Letter of Credit | Month | EG51M01en |
| Spot Exchange Rates of the N.T. Dollar against the U.S. Dollar and Interest Rates on Accommodations for Usance Letter of Credit | Day | EG51D01en |
| Spot Exchange Rates | Month | EG52M01en |
| Forward Exchange Rates of the N.T. Dollar against the U.S. Dollar | Year | EG55Y01en |
| Forward Exchange Rates of the N.T. Dollar against the U.S. Dollar | Month | EG55M01en |
| Forward Exchange Rates of the N.T. Dollar against the U.S. Dollar | Day | EG55D01en |

### Other
| Sub-item | Period | Code |
|---|---|---|
| Number of Financial Institutions | Year | EF09Y01en |
| Number of Financial Institutions | Month | EF09M01en |
| Open Market Transactions | Year | EG60Y01en |
| Open Market Transactions | Month | EG60M01en |
| Open Market Transactions | Day | EG60D01en |
| Bank Clearings and Dishonored Checks and Bills | Year | EF70Y01en |
| Bank Clearings and Dishonored Checks and Bills | Month | EF70M01en |
| Payment Systems | Year | EG77Y01en |
| Payment Systems | Month | EG77M01en |
| Debits and Deposit Turnover Rate of Domestic Banks | Year | EF69Y01en |
| Debits and Deposit Turnover Rate of Domestic Banks | Month | EF69M01en |
| Credit Card and ATM Transactions | Year | EG02Y01en |
| Credit Card and ATM Transactions | Month | EG02M01en |
| Loans & Investments Revalued - Monetary Financial Institutions | Year | EG75Y01en |
| Loans & Investments Revalued - Monetary Financial Institutions | Month | EG75M01en |
| Annual Growth Rates of Loans & Investments of Financial Institutions | Year | EG73Y01en |
| Annual Growth Rates of Loans & Investments of Financial Institutions | Month | EG73M01en |

### Macro / Balance of Payments
| Item | Period | Code |
|---|---|---|
| Balance of Payments | Year | BPP2Y01en |
| Balance of Payments | Quarter | BPP2Q01en |
| International Investment Position | Year | BPF4Y01en |
| Financial Transactions | Year | FL01_en |
| Financial Assets and Liabilities | Year | FL02_en |

