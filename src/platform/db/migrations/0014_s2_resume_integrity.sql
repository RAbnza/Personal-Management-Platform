/*
 * S2 resume-version integrity.
 *
 * career.resume_version represents the exact resume version associated with
 * applications. A resume may have descriptive metadata adjusted while it is
 * still unused, but once an application references the version its
 * reference/notes cannot be silently rewritten.
 *
 * archived_at remains mutable because archiving is lifecycle metadata and does
 * not change which resume version an existing application used.
 *
 * The architecture permits a future explicitly audited descriptive correction.
 * That exception is intentionally not implemented as an unrestricted UPDATE
 * path here. When such a correction command is introduced it must write the
 * required audit evidence in the same transaction under a reviewed contract.
 */

/*
 * ---------------------------------------------------------------------------
 * Resume creation timestamp and referenced evidence immutability
 * ---------------------------------------------------------------------------
 */

CREATE FUNCTION "career"."enforce_resume_version_integrity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  /*
   * created_at is historical evidence and is never ordinary editable metadata.
   */
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'career.resume_version.created_at is immutable'
      USING ERRCODE = '22023';
  END IF;

  /*
   * Before use, reference_url/notes may be corrected as ordinary draft-like
   * metadata. Once any application links this resume version, those values
   * describe the exact historical version used and may not be silently
   * rewritten.
   *
   * label and archived_at remain descriptive/lifecycle metadata and are not
   * part of this referenced-content lock.
   */
  IF (
    NEW.reference_url IS DISTINCT FROM OLD.reference_url
    OR NEW.notes IS DISTINCT FROM OLD.notes
  )
  AND EXISTS (
    SELECT 1
    FROM "career"."job_application" AS application
    WHERE
      application."workspace_id" = OLD.workspace_id
      AND application."resume_version_id" = OLD.id
  )
  THEN
    RAISE EXCEPTION
      'referenced resume version reference/notes are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION "career"."enforce_resume_version_integrity"()
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION "career"."enforce_resume_version_integrity"()
TO app_domain;

CREATE TRIGGER "resume_version_integrity"
BEFORE UPDATE OF
  "reference_url",
  "notes",
  "created_at"
ON "career"."resume_version"
FOR EACH ROW
EXECUTE FUNCTION "career"."enforce_resume_version_integrity"();