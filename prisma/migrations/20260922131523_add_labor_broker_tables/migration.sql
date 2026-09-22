-- CreateTable
CREATE TABLE "labor_broker_license" (
    "license_no" TEXT NOT NULL,
    "raw_license_no" TEXT NOT NULL,
    "agency_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "responsible_person" TEXT NOT NULL,
    "tax_id" TEXT,
    "professional_staff_count" INTEGER,
    "staff_count" INTEGER,
    "license_start_date" DATE,
    "license_end_date" DATE,
    "suspension_start_date" DATE,
    "suspension_end_date" DATE,
    "expected_resume_date" DATE,
    "terminated_date" DATE,
    "revoked_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labor_broker_license_pkey" PRIMARY KEY ("license_no")
);

-- CreateTable
CREATE TABLE "labor_broker_evaluation" (
    "year" INTEGER NOT NULL,
    "license_no" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "quality_score" DECIMAL(8,2),
    "violation_score" DECIMAL(8,2),
    "customer_service_score" DECIMAL(8,2),
    "other_score" DECIMAL(8,2),
    "total_score" DECIMAL(8,2),
    "has_suspension" BOOLEAN NOT NULL,
    "has_major_violation" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labor_broker_evaluation_pkey" PRIMARY KEY ("year","license_no")
);

-- CreateTable
CREATE TABLE "labor_broker_tax_registration" (
    "tax_id" TEXT NOT NULL,
    "industry_code" TEXT NOT NULL,
    "business_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "is_primary_industry" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "labor_broker_tax_registration_pkey" PRIMARY KEY ("tax_id","industry_code")
);

-- CreateIndex
CREATE INDEX "labor_broker_license_tax_id_idx" ON "labor_broker_license"("tax_id");

-- CreateIndex
CREATE INDEX "labor_broker_evaluation_license_no_idx" ON "labor_broker_evaluation"("license_no");

-- CreateIndex
CREATE INDEX "labor_broker_tax_registration_industry_code_idx" ON "labor_broker_tax_registration"("industry_code");
