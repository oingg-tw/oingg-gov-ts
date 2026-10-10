-- CreateTable
CREATE TABLE "business_cycle_reference_date" (
    "cycle_no" INTEGER NOT NULL,
    "trough_start" DATE NOT NULL,
    "peak" DATE,
    "trough_end" DATE,
    "expansion_months" INTEGER,
    "contraction_months" INTEGER,
    "total_months" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_cycle_reference_date_pkey" PRIMARY KEY ("cycle_no")
);
