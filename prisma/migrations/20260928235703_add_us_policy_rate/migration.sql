-- CreateTable
CREATE TABLE "us_policy_rate" (
    "effective_date" DATE NOT NULL,
    "target_upper" DECIMAL(8,4) NOT NULL,
    "target_lower" DECIMAL(8,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "us_policy_rate_pkey" PRIMARY KEY ("effective_date")
);
