import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claims',true),'')::jsonb $$;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL);
 GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.jwt() TO authenticated,anon;`);
for (const name of (await readdir(new URL('supabase/migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()) {
  await db.exec(await readFile(new URL(`supabase/migrations/${name}`,import.meta.url),'utf8'));
}
const fixture = JSON.parse(await readFile(new URL('../../../contracts/salapiya/p4_finance.json',import.meta.url),'utf8'));
const actor = randomUUID(), other = randomUUID(), enrollment = randomUUID(), profile = fixture.profile;
for (const id of [actor, other]) {
  await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
  await db.query('INSERT INTO auth.sessions VALUES($1,$1)',[id]);
}
const rpc = (owner,name,args=[]) => db.transaction(async tx => {
  await tx.exec('SET LOCAL ROLE authenticated');
  await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[owner]);
  await tx.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner,session_id:owner})]);
  return (await tx.query(`SELECT ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) AS result`,args)).rows[0].result;
});
const canonical = (kind,values) => JSON.stringify({contract:1,authority:'local',owner:profile,expectedVersion:0,kind,
  values:Object.fromEntries(Object.entries(values).sort(([a],[b])=>a<b?-1:a>b?1:0))});
const submit = async (id,payload,owner=actor) => {
  const base = (await rpc(actor,'p2_profile_boundary')).revision;
  return rpc(owner,'p2_submit_command',[id,JSON.stringify({contract:2,profile_id:profile,payload,base_revision:base})]);
};
test('P4 full graph enrollment independently reproduces every Dart card plan', async () => {
  await rpc(actor,'p2_stage_enrollment',[enrollment,profile,'P4 parity',fixture.commands.map(c=>({id:c.id,payload:c.payload,recorded_at:'2026-10-26T00:00:00Z'}))]);
  assert.equal((await rpc(actor,'p2_publish_enrollment',[enrollment])).outcome,'published');
  const rows=(await db.query('SELECT * FROM public.p2_command WHERE profile_id=$1 ORDER BY sequence_no',[profile])).rows;
  assert.equal(rows.length,fixture.commands.length);
  for (let i=0;i<rows.length;i++) assert.deepEqual(JSON.parse(rows[i].plan),fixture.commands[i].plan,JSON.parse(rows[i].payload).kind);
});
test('P4 server caps, foreign ownership, preserved receipts and dependency rejection', async () => {
  const find=kind=>fixture.commands.find(c=>JSON.parse(c.payload).kind===kind).id;
  const card=find('creditCard'), purchase=find('expense'), statement=find('statement'), payment=find('cardPayment');
  const command=canonical('cardAllocation',{date:'2026-10-26',name:'Excess',card,payment,statement,amount:'0.01',verified:'true'});
  const id=randomUUID(), result=await submit(id,command);
  assert.equal(result.outcome,'rejected');
  const receipt=(await db.query('SELECT envelope FROM salapiya_p2.receipt WHERE owner_id=$1 AND id=$2',[actor,id])).rows[0].envelope;
  assert.deepEqual(await rpc(actor,'p2_submit_command',[id,JSON.stringify(receipt)]),result);
  assert.equal((await submit(randomUUID(),canonical('cardRefund',{date:'2026-10-26',name:'Foreign',card:randomUUID(),purchase,amount:'1.00',category:'category-food',reason:'Invalid'}))).outcome,'rejected');
  assert.equal((await submit(randomUUID(),canonical('financeReversal',{date:'2026-10-26',replace:purchase,replaceVersion:'1',reason:'Has dependencies'}))).outcome,'rejected');
  assert.equal((await submit(randomUUID(),canonical('cardPayment',{date:'2026-10-26',name:'Foreign payment',card,amount:'1.00',account:find('account')}),other)).outcome,'rejected');
  await assert.rejects(db.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('SELECT * FROM salapiya_p2.posting');}),/permission denied/);
});
test('P3 scenario 31: real immutable card purchase and refund retain one private liability', async () => {
  const group=randomUUID(), me=randomUUID(), person=randomUUID();let version=0;
  const groupPost=async(op,values,id=randomUUID())=>{
    const r=await rpc(actor,'p3_submit_command',[id,JSON.stringify({contract:3,group,op,version,values})]);
    assert.equal(r.outcome,'accepted',r.reason);version=r.version;return id;
  };
  const post=async(kind,values)=>{
    const id=randomUUID();const r=await submit(id,canonical(kind,{date:'2026-10-26',...values}));
    assert.equal(r.outcome,'accepted',`${kind}: ${r.reason}`);return id;
  };
  await groupPost('create',{name:'P4 card group',participant:me,display:'Private owner'});
  await groupPost('manual',{participant:person,name:'Manual consumer'});
  const card=await post('creditCard',{name:'Shared private card',issuer:'Synthetic issuer',amount:'0.00',limit:''});
  const purchase=await post('cardPurchase',{name:'Shared dinner',card,amount:'1200.00',postingDate:'2026-10-26',category:'category-food'});
  const bill=await groupPost('bill',{name:'Shared dinner',date:'2026-10-26',total:'120000',paid:{[me]:'120000'},shares:{[me]:'40000',[person]:'80000'},method:'exact'});
  const adoption=await post('shared',{name:'Card adoption',sharedMode:'bill',sharedAccounting:'2',sharedGroup:group,sharedKey:bill,sharedRevision:bill,funding:'card',card,fundingAmount:'1200.00',shareAmount:'400.00',account:'',category:'category-food',source:purchase,sourceVersion:'1',reason:'Adopt exact card purchase'});
  const refund=await post('cardRefund',{name:'Actual card credit',card,purchase:adoption,amount:'90.00',category:'category-food',reason:'Provider returned money'});
  const groupRefund=await groupPost('refund',{bill,revision:bill,date:'2026-10-26',total:'9000',received:{[me]:'9000'},credits:{[me]:'3000',[person]:'6000'},reason:'Provider refund'});
  await post('shared',{name:'Adopt exact credit',sharedMode:'refund',sharedAccounting:'2',sharedGroup:group,sharedKey:groupRefund,sharedRevision:groupRefund,funding:'card',card,fundingAmount:'90.00',shareAmount:'30.00',account:'',category:'category-food',source:refund,sourceVersion:'1',reason:'Adopt actual card credit',billSource:bill,billRevision:bill,coverage:'adopted'});
  const totals=(await db.query(`SELECT q.ledger,sum(q.amount_minor::numeric)::text AS amount FROM salapiya_p2.posting q JOIN salapiya_p2.current_revision r ON r.id=q.revision_id WHERE r.profile_id=$1 AND r.values_json->>'card'=$2 GROUP BY q.ledger`,[profile,card])).rows;
  assert.deepEqual(Object.fromEntries(totals.map(r=>[r.ledger,r.amount])),{card_liability:'-111000',expense:'37000',shared_receivable:'74000'});
  const projection=JSON.stringify((await db.query('SELECT document FROM p3_group WHERE group_id=$1',[group])).rows);
  assert.ok(!projection.includes(card));assert.ok(!projection.includes('Shared private card'));
});
after(()=>db.close());
