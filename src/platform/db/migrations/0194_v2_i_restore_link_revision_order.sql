/* Portable records are canonically ordered by identity, not revision number.
 * Keep the complete immutable predecessor chain enforced at transaction commit. */
ALTER TABLE finance.private_group_link_revision ALTER CONSTRAINT fk_private_link_previous DEFERRABLE INITIALLY DEFERRED;
