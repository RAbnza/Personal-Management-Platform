/* A successful self-exit must still validate and replay the actor's own
 * receipt. Audit payloads contain only the group command version. */
ALTER POLICY audit_read ON audit.group_revision USING(sharing.active(group_id) OR actor_participant_id=sharing.actor(group_id) OR (subject_kind='expense' AND sharing.can_read_expense(group_id,subject_id)));
