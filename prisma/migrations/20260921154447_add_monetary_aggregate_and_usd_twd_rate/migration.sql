-- CreateTable
CREATE TABLE "monthly_monetary_aggregate" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "m1a_amount" DECIMAL(14,0) NOT NULL,
    "m1a_yoy_percent" DECIMAL(8,2),
    "m1b_amount" DECIMAL(14,0) NOT NULL,
    "m1b_yoy_percent" DECIMAL(8,2),
    "m2_amount" DECIMAL(14,0) NOT NULL,
    "m2_yoy_percent" DECIMAL(8,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_monetary_aggregate_pkey" PRIMARY KEY ("year","month")
);

-- CreateTable
CREATE TABLE "daily_usd_twd_rate" (
    "trade_date" DATE NOT NULL,
    "bank_buying_rate" DECIMAL(8,3),
    "bank_selling_rate" DECIMAL(8,3),
    "interbank_closing_rate" DECIMAL(8,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_usd_twd_rate_pkey" PRIMARY KEY ("trade_date")
);
