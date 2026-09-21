-- CreateTable
CREATE TABLE "cbc_policy_rate" (
    "effective_date" DATE NOT NULL,
    "discount_rate" DECIMAL(8,4) NOT NULL,
    "collateral_accommodation_rate" DECIMAL(8,4) NOT NULL,
    "unsecured_accommodation_rate" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cbc_policy_rate_pkey" PRIMARY KEY ("effective_date")
);
