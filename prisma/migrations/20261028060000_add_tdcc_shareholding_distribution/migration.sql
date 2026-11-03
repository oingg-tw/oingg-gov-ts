-- CreateTable
CREATE TABLE "tdcc_shareholding_distribution" (
    "symbol" TEXT NOT NULL,
    "data_date" DATE NOT NULL,
    "holding_level" INTEGER NOT NULL,
    "holder_count" BIGINT NOT NULL,
    "shares" BIGINT NOT NULL,
    "custody_pct" DECIMAL(6,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tdcc_shareholding_distribution_pkey" PRIMARY KEY ("symbol","data_date","holding_level")
);
