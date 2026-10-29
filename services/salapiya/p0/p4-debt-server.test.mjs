import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const db=new PGlite();
await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;`);
for(const file of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('supabase/migrations/'+file,import.meta.url),'utf8'));
const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p4_debt_components.json',import.meta.url),'utf8'));
const actor=randomUUID(),profile=fixture.profile;
await db.query('INSERT INTO auth.users(id) VALUES($1)',[actor]);await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[actor]);
const rpc=(name,args=[])=>db.transaction(async tx=>{
 await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",[actor,JSON.stringify({sub:actor,session_id:actor})]);
 return (await tx.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS r`,args)).rows[0].r;
});
const envelope=async payload=>JSON.stringify({contract:2,profile_id:profile,payload,base_revision:(await rpc('p2_profile_boundary')).revision});
test('independent PostgreSQL plans match versioned principal, charge source allocation, waiver, avoided charge, residual and payoff evidence',async()=>{
 const enrollment=randomUUID();await rpc('p2_stage_enrollment',[enrollment,profile,'P4 debt component parity',[]]);await rpc('p2_publish_enrollment',[enrollment]);
 for(const c of fixture.commands) {
  const raw=await envelope(c.payload),r=await rpc('p2_submit_command',[c.id,raw]);assert.equal(r.outcome,'accepted',`${JSON.parse(c.payload).kind}: ${r.reason}`);
  const plan=JSON.parse((await db.query('SELECT plan FROM p2_command WHERE id=$1',[c.id])).rows[0].plan);assert.deepEqual(plan,c.plan);
  assert.deepEqual(await rpc('p2_submit_command',[c.id,raw]),r);
  if(JSON.parse(c.payload).kind==='debtPayment'){
   const debt=fixture.commands.find(x=>JSON.parse(x.payload).kind==='debtImport').id;
   const values={date:'2026-10-21',name:'Unsupported opening waiver',debt,amount:'800.01',adjustmentKind:'recognized_waiver',waiverBasis:'imported_unknown',reason:'May not waive separately posted charge as opening equity',reference:'negative-cap',verified:'true'};
   const payload=JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:0,kind:'debtAdjustment',values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
   const id=randomUUID(),deniedRaw=await envelope(payload),denied=await rpc('p2_submit_command',[id,deniedRaw]);
   assert.equal(denied.outcome,'rejected');
   await assert.rejects(db.query('SELECT salapiya_p2.plan($1,$2,$3::jsonb,$4)',[profile,id,payload,5]),/opening/i);
   assert.deepEqual(await rpc('p2_submit_command',[id,deniedRaw]),denied);
  }
 }
 const debt=fixture.commands.find(c=>JSON.parse(c.payload).kind==='debtImport').id;
 const range=(await db.query("SELECT * FROM salapiya_p2.p4_principal_range($1,(SELECT r FROM salapiya_p2.revision r WHERE id=$2),'2026-10-21')",[profile,debt])).rows[0];
 assert.equal(String(range.lower_bound),'0');assert.equal(String(range.upper_bound),'0');
});
test('a retained reconciled payoff prevents reversal from silently reopening liability',async()=>{
 const payment=fixture.commands.find(c=>JSON.parse(c.payload).kind==='debtPayment').id;
 const values={date:'2026-10-21',debtComponentContract:'1',replace:payment,replaceVersion:'1',reason:'May not reopen a retained exact closure'};
 const payload=JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:fixture.commands.length,kind:'financeReversal',values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
 const id=randomUUID(),raw=await envelope(payload),result=await rpc('p2_submit_command',[id,raw]);assert.equal(result.outcome,'rejected');assert.deepEqual(await rpc('p2_submit_command',[id,raw]),result);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM p2_command WHERE id=$1',[id])).rows[0].n,0);
});
after(()=>db.close());
