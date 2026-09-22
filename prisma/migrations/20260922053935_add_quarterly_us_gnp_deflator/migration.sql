-- CreateTable
CREATE TABLE "quarterly_us_gnp_deflator" (
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "index_value" DECIMAL(10,3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarterly_us_gnp_deflator_pkey" PRIMARY KEY ("year","quarter")
);
