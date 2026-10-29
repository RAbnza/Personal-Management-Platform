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
const plan=values=>db.query('SELECT salapiya_p2.plan($1,$2,$3::jsonb,$4) AS r',[profile,randomUUID(),JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:2,kind:'debtSchedule',values}),9]);
test('debt schedule cadence is optional and validated with the native rules',async()=>{
 const enrollment=randomUUID();await rpc('p2_stage_enrollment',[enrollment,profile,'Debt cadence parity',[]]);await rpc('p2_publish_enrollment',[enrollment]);
 for(const c of fixture.commands.slice(0,2)){const r=await rpc('p2_submit_command',[c.id,await envelope(c.payload)]);assert.equal(r.outcome,'accepted',r.reason);}
 const debt=fixture.commands[1].id;
 const base={date:'2026-10-21',name:'Cadence schedule',debt,schedule:'Installment 1,2026-10-31,3200.00\nInstallment 2,2026-11-30,3200.00',verified:'true',reference:'letter'};
 const stored=async extra=>(await plan({...base,...extra})).rows[0].r.revision.values;
 assert.equal((await stored({})).frequency,undefined);
 const v=await stored({frequency:'monthly',firstDue:'2026-10-31',installmentAmount:'3200.00'});
 assert.equal(v.frequency,'monthly');assert.equal(v.installmentAmount,'3200.00');
 assert.equal((await stored({frequency:'custom',firstDue:'2026-10-31',intervalDays:'30'})).intervalDays,'30');
 assert.equal((await stored({frequency:'monthly',firstDue:'2026-10-31',splitMode:'varied'})).splitMode,'varied');
 assert.equal((await stored({frequency:'monthly',firstDue:'2026-10-31',splitMode:'divide',installmentAmount:'3200.00'})).splitMode,'divide');
 const bad={
  'frequency':[{frequency:'daily',firstDue:'2026-10-31'},/frequency/],
  'missing frequency':[{firstDue:'2026-10-31'},/frequency/],
  'missing first due':[{frequency:'weekly'},/first due/],
  'mismatched first due':[{frequency:'weekly',firstDue:'2026-11-01'},/first scheduled/],
  'custom zero':[{frequency:'custom',firstDue:'2026-10-31',intervalDays:'0'},/interval/],
  'custom decimal':[{frequency:'custom',firstDue:'2026-10-31',intervalDays:'2.5'},/whole/],
  'custom too long':[{frequency:'custom',firstDue:'2026-10-31',intervalDays:'3661'},/interval/],
  'interval without custom':[{frequency:'monthly',firstDue:'2026-10-31',intervalDays:'14'},/custom/],
  'unknown split':[{frequency:'monthly',firstDue:'2026-10-31',splitMode:'random'},/split/],
  'varied with single amount':[{frequency:'monthly',firstDue:'2026-10-31',splitMode:'varied',installmentAmount:'100.00'},/single/],
  'split without frequency':[{splitMode:'equal'},/frequency/],
  'zero amount':[{frequency:'monthly',firstDue:'2026-10-31',installmentAmount:'0.00'},/./]
 };
 for(const [name,[extra,pattern]] of Object.entries(bad))await assert.rejects(plan({...base,...extra}),pattern,name);
});
after(()=>db.close());
