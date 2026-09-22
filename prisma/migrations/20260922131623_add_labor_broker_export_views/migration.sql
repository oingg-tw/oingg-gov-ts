-- CreateView
-- analysis-ts 的 export 契約層新增三個人力仲介相關 view，對應這次一起建的三張表。gov-ts 只負責把
-- 三份來源原樣擷取出來；「稅籍有登記但不在許可名冊上」這類交叉比對與狀態判定屬於數據中台的職責，
-- 刻意不在這裡做成 view（2026-09-22 使用者裁定）。join key：
--   labor_broker_evaluation.license_no = labor_broker_license.license_no（兩邊都已正規化去前導零）
--   labor_broker_license.tax_id        = labor_broker_tax_registration.tax_id
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."labor_broker_license" AS
SELECT
  "license_no", "raw_license_no",
  "agency_name", "address", "phone", "responsible_person", "tax_id",
  "professional_staff_count", "staff_count",
  "license_start_date", "license_end_date",
  "suspension_start_date", "suspension_end_date", "expected_resume_date",
  "terminated_date", "revoked_date",
  "updated_at"
FROM "public"."labor_broker_license";

CREATE VIEW "export"."labor_broker_evaluation" AS
SELECT
  "year", "license_no", "company_name", "region", "address",
  "quality_score", "violation_score", "customer_service_score", "other_score", "total_score",
  "has_suspension", "has_major_violation",
  "updated_at"
FROM "public"."labor_broker_evaluation";

CREATE VIEW "export"."labor_broker_tax_registration" AS
SELECT
  "tax_id", "industry_code", "business_name", "address", "is_primary_industry",
  "updated_at"
FROM "public"."labor_broker_tax_registration";
