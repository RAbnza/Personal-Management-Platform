import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createHash,randomBytes} from 'node:crypto';
import {reconcileSecurityJournal} from './release-backup.mjs';

const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
 $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`);
for(const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
 await db.exec(await readFile(new URL(`supabase/migrations/${name}`,import.meta.url),'utf8'));
const a=randomUUID(),b=randomUUID(),s1=randomUUID(),s2=randomUUID(),sb=randomUUID(),profile=randomUUID();
for(const id of [a,b])await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[id,id+'@example.test']);
for(const [id,user]of [[s1,a],[s2,a],[sb,b]])await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[id,user]);
await db.query('INSERT INTO p2_profile VALUES($1,$2,$3,0)',[profile,a,'Synthetic lifecycle']);
const asUser=(user,session,fn,extra={})=>db.transaction(async tx=>{
 await tx.exec('SET LOCAL ROLE authenticated');
 await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
 [user,JSON.stringify({sub:user,session_id:session,...extra})]);return fn(tx);
});
const rpc=(user,session,name,args=[],extra={})=>asUser(user,session,tx=>tx.query(`SELECT public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args),extra).then(r=>r.rows[0].r);

test('device authority uses live provider sessions; labels cannot forge identity or expose another account',async()=>{
 assert.equal((await rpc(a,s1,'p7_register_device',['Windows test'])).session_id,s1);
 await rpc(a,s2,'p7_register_device',['Android test']);
 await rpc(b,sb,'p7_register_device',['Foreign test']);
 const devices=await rpc(a,s1,'p7_devices');
 assert.equal(devices.length,2);assert.equal(devices.filter(d=>d.current).length,1);
 await assert.rejects(rpc(b,sb,'p7_revoke_device',[s1]),/owned registered session/);
 await assert.rejects(rpc(b,s1,'p7_register_device',['Forged']),/current session/);
 await assert.rejects(asUser(a,s1,tx=>tx.query('SELECT * FROM salapiya_lifecycle.device_session')),/permission denied/);
 await assert.rejects(asUser(a,s1,tx=>tx.query('DELETE FROM auth.sessions')),/permission denied/);
});

test('revocation blocks stale commands, RLS, registration and restored old session; peer remains authorized',async()=>{
 assert.equal((await rpc(a,s1,'p7_revoke_device',[s2])).revoked,true);
 assert.equal((await rpc(a,s1,'p7_revoke_device',[s2])).revoked,true);
 await assert.rejects(rpc(a,s2,'p2_profile_boundary'),/current session/);
 const payload=JSON.stringify({contract:2,profile_id:profile,payload:'{}',base_revision:0});
 await assert.rejects(rpc(a,s2,'p2_submit_command',[randomUUID(),payload]),/current session/);
 assert.equal((await asUser(a,s2,tx=>tx.query('SELECT * FROM p2_profile'))).rows.length,0);
 assert.equal((await rpc(a,s1,'p2_profile_boundary')).id,profile);
 // Simulate an operator restoring an old auth-session row without the current
 // revocation register. A correctly reconciled register still denies it.
 await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[s2,a]);
 await assert.rejects(rpc(a,s2,'p7_register_device',['Restored device']),/revoked/);
 assert.equal((await asUser(a,s2,tx=>tx.query('SELECT * FROM p2_profile'))).rows.length,0);
 assert.equal((await rpc(a,s1,'p7_devices')).find(d=>d.session_id===s2).active,false);
});
test('account deletion requires recent Google authentication, rolls back interruption, purges private data and never resurrects',async()=>{
 const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p2_finance.json',import.meta.url),'utf8'));
 // Use a new actor and the real complete private financial graph (including
 // immutable revisions, references and exact postings), not an empty profile.
 const user=randomUUID(),session=randomUUID(),enrollment=randomUUID();
 await db.query('INSERT INTO auth.users(id,email,email_confirmed_at) VALUES($1,$2,now())',[user,user+'@example.test']);
 await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[session,user]);
 const snapshot=fixture.commands.map(c=>({id:c.id,payload:c.payload,recorded_at:'2026-10-25T00:00:00Z'}));
 assert.equal((await rpc(user,session,'p2_stage_enrollment',[enrollment,fixture.profile,'Deletion fixture',JSON.stringify(snapshot)])).outcome,'staged');
 assert.equal((await rpc(user,session,'p2_publish_enrollment',[enrollment])).outcome,'published');
 const group=randomUUID(),person=randomUUID(),peerPerson=randomUUID();let groupVersion=0;
 const groupRpc=async(who,sid,op,values)=>{
  const r=await rpc(who,sid,'p3_submit_command',[randomUUID(),JSON.stringify({contract:3,group,version:groupVersion,op,values})]);
  assert.equal(r.outcome,'accepted',r.reason);groupVersion=r.version;return r;
 };
 await groupRpc(user,session,'create',{name:'Deletion retention group',participant:person,display:'Deleting owner'});
 const token=randomBytes(32).toString('hex');
 await groupRpc(user,session,'invite',{email:b+'@example.test',hash:createHash('sha256').update(token).digest('hex')});
 await groupRpc(b,sb,'accept',{token,consent:true,display:'Retained peer',participant:peerPerson});
 await groupRpc(user,session,'bill',{name:'Retained shared bill',date:'2026-10-29',total:'10000',paid:{[person]:'10000'},shares:{[person]:'5000',[peerPerson]:'5000'},method:'exact'});
 const beforeDeletion=await db.dumpDataDir();
 const confirmation=['DELETE CONNECTED ACCOUNT'];
 await assert.rejects(rpc(user,session,'p7_delete_account',confirmation),/recent Google/);
 const recent={amr:[{method:'oauth',timestamp:Math.floor(Date.now()/1000)}]};
 await assert.rejects(rpc(user,session,'p7_delete_account',['wrong'],recent),/confirmation/);
 await assert.rejects(rpc(user,session,'p7_delete_account',confirmation,{amr:[{method:'oauth',timestamp:Math.floor(Date.now()/1000)-301}]}),/recent Google/);
 await db.exec(`CREATE FUNCTION public.fail_erasure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected erasure failure'; END $$;
 CREATE TRIGGER fail_erasure BEFORE DELETE ON public.p2_profile FOR EACH ROW EXECUTE FUNCTION public.fail_erasure();`);
 await assert.rejects(rpc(user,session,'p7_delete_account',confirmation,recent),/injected erasure failure/);
 assert.equal((await rpc(user,session,'p2_profile_boundary')).id,fixture.profile);
 assert.equal((await db.query('SELECT count(*)::int n FROM p2_command WHERE owner_id=$1',[user])).rows[0].n,fixture.commands.length);
 assert.equal((await db.query('SELECT count(*)::int n FROM salapiya_lifecycle.deleted_account WHERE owner_id=$1',[user])).rows[0].n,0);
 await db.exec('DROP TRIGGER fail_erasure ON public.p2_profile; DROP FUNCTION public.fail_erasure()');
 const result=await rpc(user,session,'p7_delete_account',confirmation,recent);
 assert.equal(result.application_deleted,true);
 assert.deepEqual(await rpc(user,session,'p7_delete_account',confirmation,recent),result);
 for(const table of ['public.p2_profile','public.p2_command','salapiya_p2.receipt','salapiya_p2.enrollment'])
  assert.equal((await db.query(`SELECT count(*)::int n FROM ${table} WHERE owner_id=$1`,[user])).rows[0].n,0,table);
 assert.equal((await db.query('SELECT count(*)::int n FROM salapiya_p2.posting WHERE profile_id=$1',[fixture.profile])).rows[0].n,0);
 // An old archive or restored auth session still cannot enroll or read.
 await db.query('INSERT INTO auth.sessions VALUES($1,$2)',[session,user]);
 await assert.rejects(rpc(user,session,'p2_stage_enrollment',[enrollment,fixture.profile,'Old archive',JSON.stringify(snapshot)]),/deleted/);
 assert.equal((await asUser(user,session,tx=>tx.query('SELECT * FROM p2_command'))).rows.length,0);
 assert.equal((await rpc(a,s1,'p2_profile_boundary')).id,profile);
 const shared=(await db.query('SELECT document FROM salapiya_p3.groups WHERE id=$1',[group])).rows[0].document;
 assert.equal(shared.archived,true);assert.equal(shared.owner,person);
 assert.equal(shared.people[person].kind,'deleted');assert.equal(shared.people[person].user,null);
 assert.equal(Object.keys(shared.bills).length,1);
 assert.equal((await asUser(b,sb,tx=>tx.query('SELECT count(*)::int n FROM p3_group WHERE group_id=$1',[group]))).rows[0].n,1);
 assert.equal((await db.query('SELECT count(*)::int n FROM p3_group WHERE owner_id=$1',[user])).rows[0].n,0);
 // Restore a genuine pre-deletion PostgreSQL snapshot into another isolated
 // engine, then overlay the current independently obtained security register.
 const obsolete=new PGlite({loadDataDir:beforeDeletion});
 try {
  assert.equal((await obsolete.query('SELECT count(*)::int n FROM p2_command WHERE owner_id=$1',[user])).rows[0].n,fixture.commands.length);
  const measuredAt=new Date().toISOString();
  const journal={measuredAt,deletedAccounts:(await db.query('SELECT * FROM salapiya_lifecycle.deleted_account')).rows,
   revokedSessions:(await db.query('SELECT * FROM salapiya_lifecycle.device_session WHERE revoked_at IS NOT NULL')).rows};
  await assert.rejects(reconcileSecurityJournal(obsolete,{...journal,measuredAt:'2020-01-01'}, {notOlderThan:measuredAt}),/current independent/);
  await reconcileSecurityJournal(obsolete,journal,{notOlderThan:measuredAt});
  assert.equal((await obsolete.query('SELECT count(*)::int n FROM p2_command WHERE owner_id=$1',[user])).rows[0].n,0);
  assert.equal((await obsolete.query('SELECT count(*)::int n FROM auth.sessions')).rows[0].n,0);
  assert.equal((await obsolete.query('SELECT count(*)::int n FROM p7_sync_session')).rows[0].n,0);
  await assert.rejects(obsolete.query('INSERT INTO p2_profile VALUES($1,$2,$3,0)',[fixture.profile,randomUUID(),'Stale deleted identity']),/deleted profile identity/);
 } finally {await obsolete.close();}
});
after(()=>db.close());
