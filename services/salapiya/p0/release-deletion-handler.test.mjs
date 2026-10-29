import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deletionHandler} from './supabase/functions/delete-account/handler.mjs';
const id='11111111-1111-4111-8111-111111111111';
const request=(body={confirmation:'DELETE CONNECTED ACCOUNT'})=>new Request('https://test/delete-account',{
 method:'POST',headers:{Authorization:'Bearer synthetic-user-token'},body:JSON.stringify(body)});
test('deletion endpoint rejects foreign IDs, unsigned calls and failed reauthentication before using admin authority',async()=>{
 let calls=0;
 const handle=deletionHandler({url:'https://test',publicKey:'public',serviceKey:'synthetic-service',fetcher:async()=>{calls++;return new Response('{}',{status:401});}});
 assert.equal((await handle(request({confirmation:'DELETE CONNECTED ACCOUNT',user_id:id}))).status,400);
 assert.equal((await handle(new Request('https://test',{method:'POST',body:'{}'}))).status,401);
 assert.equal(calls,0);
 assert.equal((await handle(request())).status,401);assert.equal(calls,2);
});
test('response loss after provider deletion reads only the original signed-subject outcome',async()=>{
 const calls=[];
 const handle=deletionHandler({url:'https://test',publicKey:'public',serviceKey:'synthetic-service',fetcher:async(url)=>{
  calls.push(url);return url.endsWith('/user')?new Response('{}',{status:401}):Response.json({application_deleted:true,auth_cleanup_pending:false});
 }});
 const result=await handle(request());assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{application_deleted:true,auth_cleanup_pending:false});
 assert.equal(calls.length,2);assert(calls[1].endsWith('/rpc/p7_deletion_status'));
 assert(!calls.some(url=>url.includes('/admin/')));
});
test('provider cleanup uses only verified identity after committed application deletion; failure remains explicit and retryable',async()=>{
 for(const fail of [false,true]){
  const calls=[];
  const handle=deletionHandler({url:'https://test',publicKey:'public',serviceKey:'synthetic-service',fetcher:async(url,options)=>{
   calls.push({url,options});
   if(url.endsWith('/user'))return Response.json({id});
   if(url.includes('/rpc/'))return Response.json({application_deleted:true});
   return new Response('{}',{status:fail?500:200});
  }});
  const result=await handle(request());assert.equal(result.status,fail?202:200);
  assert.deepEqual(await result.json(),{application_deleted:true,auth_cleanup_pending:fail});
  assert.equal(calls[2].url,`https://test/auth/v1/admin/users/${id}`);
  assert.equal(calls[2].options.headers.Authorization,'Bearer synthetic-service');
  assert.equal(calls[1].options.headers.Authorization,'Bearer synthetic-user-token');
 }
});
