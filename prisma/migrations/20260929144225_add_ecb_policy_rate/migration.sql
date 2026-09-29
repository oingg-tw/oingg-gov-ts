-- CreateTable
CREATE TABLE "ecb_policy_rate" (
    "effective_date" DATE NOT NULL,
    "deposit_facility_rate" DECIMAL(8,4) NOT NULL,
    "main_refinancing_rate" DECIMAL(8,4) NOT NULL,
    "marginal_lending_rate" DECIMAL(8,4) NOT NULL,
    "main_refinancing_is_minimum_bid" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecb_policy_rate_pkey" PRIMARY KEY ("effective_date")
);
