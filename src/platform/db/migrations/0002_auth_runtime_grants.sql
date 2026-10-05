/*
 * Better Auth runtime privileges.
 *
 * migration_owner continues to own the auth schema and its tables.
 * auth_adapter receives only the schema/table privileges required for
 * Better Auth's supported runtime lifecycle operations.
 *
 * Other application runtime roles intentionally receive no access to
 * authentication credentials, sessions, verification tokens, or rate-limit
 * state.
 */

REVOKE ALL ON SCHEMA "auth" FROM PUBLIC;
REVOKE ALL ON SCHEMA "auth"
FROM app_domain, queue_broker, worker_domain, lifecycle_operator;

REVOKE ALL PRIVILEGES
ON TABLE
  "auth"."user",
  "auth"."session",
  "auth"."account",
  "auth"."verification",
  "auth"."rate_limit"
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE
  "auth"."user",
  "auth"."session",
  "auth"."account",
  "auth"."verification",
  "auth"."rate_limit"
FROM
  app_domain,
  auth_adapter,
  queue_broker,
  worker_domain,
  lifecycle_operator;

GRANT USAGE ON SCHEMA "auth" TO auth_adapter;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  "auth"."user",
  "auth"."session",
  "auth"."account",
  "auth"."verification",
  "auth"."rate_limit"
TO auth_adapter;