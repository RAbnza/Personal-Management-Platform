// No caller-supplied user identifier reaches the administrator API.
export function deletionHandler({url,publicKey,serviceKey,fetcher=fetch}) {
 return async request=>{
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'POST required'});
  const authorization=request.headers.get('authorization');
  if(!authorization?.startsWith('Bearer ')||authorization.length>16384)return reply(401,{error:'Authentication required'});
  // Read a bounded body; a Content-Length header alone is not trusted.
  const reader=request.body?.getReader();let text='',size=0;
  if(!reader)return reply(400,{error:'Explicit confirmation required'});
  try {
   const decoder=new TextDecoder();
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>1024){await reader.cancel();return reply(413,{error:'Request too large'});}text+=decoder.decode(value,{stream:true});}
   text+=decoder.decode();
   const body=JSON.parse(text);
   if(body.confirmation!=='DELETE CONNECTED ACCOUNT'||Object.keys(body).length!==1)return reply(400,{error:'Explicit confirmation required'});
  }catch{return reply(400,{error:'Invalid confirmation'});}
  const headers={apikey:publicKey,Authorization:authorization,'Content-Type':'application/json'};
  try {
   const userResponse=await fetcher(`${url}/auth/v1/user`,{headers,signal:AbortSignal.timeout(15000)});
   if(!userResponse.ok){
    // The previous request may have deleted Auth successfully before its response
    // was lost. PostgREST verifies the signed JWT independently; this RPC only
    // reads that subject's immutable deletion outcome and cannot initiate deletion.
    const receipt=await fetcher(`${url}/rest/v1/rpc/p7_deletion_status`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(15000)});
    if(receipt.ok){const outcome=await receipt.json();if(outcome.application_deleted===true)return reply(outcome.auth_cleanup_pending?202:200,outcome);}
    return reply(401,{error:'Online authentication required'});
   }
   const user=await userResponse.json();
   if(typeof user.id!=='string'||!/^[0-9a-f-]{36}$/.test(user.id))return reply(401,{error:'Invalid authenticated identity'});
   const deletion=await fetcher(`${url}/rest/v1/rpc/p7_delete_account`,{
    method:'POST',headers,body:JSON.stringify({confirmation:'DELETE CONNECTED ACCOUNT'}),signal:AbortSignal.timeout(45000)});
   if(!deletion.ok)return reply(deletion.status===403?403:409,{error:'Deletion was not confirmed. Reauthenticate with Google and review again.'});
   const result=await deletion.json();
   if(result.application_deleted!==true)return reply(409,{error:'Application deletion could not be verified'});
   const cleanup=await fetcher(`${url}/auth/v1/admin/users/${user.id}`,{method:'DELETE',
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},signal:AbortSignal.timeout(15000)});
   if(!cleanup.ok)return reply(202,{application_deleted:true,auth_cleanup_pending:true});
   return reply(200,{application_deleted:true,auth_cleanup_pending:false});
  }catch{
   // A request may have committed. The app keeps its local profile and original
   // evidence; repeat the identical operation, never infer a fresh empty account.
   return reply(503,{error:'Deletion outcome needs online verification. Local data has been preserved.'});
  }
 };
}
