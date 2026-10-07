-- CreateTable
CREATE TABLE "monthly_five_major_bank_rate" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "deposit_rate_1m" DECIMAL(8,4) NOT NULL,
    "deposit_rate_1y" DECIMAL(8,4) NOT NULL,
    "base_lending_rate" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_five_major_bank_rate_pkey" PRIMARY KEY ("year","month")
);
