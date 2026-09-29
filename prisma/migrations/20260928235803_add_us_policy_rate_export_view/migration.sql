-- CreateView
-- analysis-ts 的 export 契約層新增美國政策利率 view，跟 export.cbc_policy_rate 是對稱的一對。
-- etl_reader 對 export schema 已有 ALTER DEFAULT PRIVILEGES 授權，不需要重新 GRANT。
CREATE VIEW "export"."us_policy_rate" AS
SELECT "effective_date", "target_upper", "target_lower", "updated_at"
FROM "public"."us_policy_rate";
