/* SELECT FOR SHARE also evaluates UPDATE policies. These owner-only policies
 * support the narrow SECURITY DEFINER lock; no runtime core UPDATE is granted. */
CREATE POLICY notification_identity_lock ON core.user_profile FOR UPDATE TO migration_owner USING(user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
CREATE POLICY notification_identity_lock ON core.workspace FOR UPDATE TO migration_owner USING(id=NULLIF(current_setting('app.workspace_id',true),'')::uuid AND owner_user_id=NULLIF(current_setting('app.user_id',true),'')::uuid);
