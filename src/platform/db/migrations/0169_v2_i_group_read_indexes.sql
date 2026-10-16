-- Custom SQL migration file, put your code below! --
REVOKE ALL ON SCHEMA sharing FROM PUBLIC,auth_adapter,queue_broker,worker_domain;
CREATE INDEX ix_contribution_person ON sharing.payer_contribution(group_id,participant_id,expense_revision_id);
CREATE INDEX ix_share_person ON sharing.participant_share(group_id,participant_id,expense_revision_id);
CREATE INDEX ix_membership_person_history ON sharing.membership(group_id,participant_id,joined_at DESC);
