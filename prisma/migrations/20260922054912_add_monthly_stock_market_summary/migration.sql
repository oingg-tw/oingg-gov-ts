-- CreateTable
CREATE TABLE "monthly_stock_market_summary" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "listed_companies" INTEGER NOT NULL,
    "total_par_value" DECIMAL(14,0) NOT NULL,
    "total_market_value" DECIMAL(14,0) NOT NULL,
    "total_trading_value" DECIMAL(14,0) NOT NULL,
    "avg_daily_trading_value" DECIMAL(14,0),
    "avg_taiex" DECIMAL(10,2) NOT NULL,
    "avg_taiex_yoy_percent" DECIMAL(8,3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_stock_market_summary_pkey" PRIMARY KEY ("year","month")
);
