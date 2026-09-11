-- CreateTable
CREATE TABLE "fund_basic_info" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "company_name" TEXT NOT NULL,
    "fund_name" TEXT NOT NULL,
    "fund_tax_id" TEXT NOT NULL,
    "fund_inception_date" TEXT NOT NULL,
    "fund_size_date" TEXT NOT NULL,
    "fund_size_currency" TEXT NOT NULL,
    "class_size_amount" DECIMAL(20,4),
    "fund_size_amount" DECIMAL(20,4),
    "fund_type" TEXT NOT NULL,
    "investment_region" TEXT NOT NULL,
    "dividend_policy" TEXT NOT NULL,
    "isin_code" TEXT NOT NULL,
    "custodian_domestic" TEXT,
    "custodian_foreign" TEXT,
    "denomination_currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "fund_daily_nav" (
    "trade_date" DATE NOT NULL,
    "member_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "fund_tax_id" TEXT NOT NULL,
    "fund_code" TEXT NOT NULL,
    "fund_name" TEXT NOT NULL,
    "nav_value" DECIMAL(14,4),
    "change_value" DECIMAL(14,4),
    "change_percent" DECIMAL(10,5),
    "type_code" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "beneficiary_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "fund_basic_info_fund_tax_id_idx" ON "fund_basic_info"("fund_tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "fund_basic_info_year_month_isin_code_key" ON "fund_basic_info"("year", "month", "isin_code");

-- CreateIndex
CREATE INDEX "fund_daily_nav_fund_tax_id_idx" ON "fund_daily_nav"("fund_tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "fund_daily_nav_trade_date_beneficiary_code_key" ON "fund_daily_nav"("trade_date", "beneficiary_code");
