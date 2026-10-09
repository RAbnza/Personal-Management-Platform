/* Review historical cash once at the one-way posted transition. The initial
 * building INSERT previously queued a second identical account-history scan
 * at commit, after UPDATE had already finalized the same revision. Ordinary
 * INSERT must still be building, posted revisions remain immutable, and
 * action_revision_commit_integrity still rejects every unfinished revision.
 * The deferred negative-balance validator itself is unchanged: all affected
 * historical periods and the durable acknowledgement remain enforced. */
DROP TRIGGER manual_negative_acknowledgement ON finance.action_revision;
CREATE CONSTRAINT TRIGGER manual_negative_acknowledgement
AFTER INSERT OR UPDATE ON finance.action_revision
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
WHEN (NEW.state='posted')
EXECUTE FUNCTION finance.validate_manual_negative_acknowledgement();
