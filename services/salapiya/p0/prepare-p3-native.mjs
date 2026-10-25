import path from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fixtures,signIn,rest} from './auth-fixtures.mjs';
import {connectHosted} from './database.mjs';
import {privateDir} from './private-state.mjs';
import {powersyncClient} from './powersync-client.mjs';
import {report,ref} from './cloud.mjs';
try{
 const role=process.argv[2];if(!['windows','android'].includes(role))throw Error('Choose native target');
 const {keys,state}=await fixtures();if(!state.p3)throw Error('Run the isolated hosted P3 fixture first');
 const [owner,other]=await Promise.all([signIn(state.users.ownerA,keys.client),signIn(state.users.ownerB,keys.client)]);
 const {client,context}=await powersyncClient();const status=await client.getInstanceStatus(context);
 const config={url:`https://${ref}.supabase.co`,publicKey:keys.client,endpoint:status.instance_url,role,...state.p3,refreshToken:owner.refresh_token,otherRefreshToken:other.refresh_token};
 if(process.argv.includes('--verify')){
   const db=await connectHosted();try{
     config.expectedAccounts=(await db.query("SELECT a.id,salapiya_p2.balance(a.profile_id,a.id,'9999-12-31')::text AS amount FROM salapiya_p2.account a WHERE a.profile_id=$1 ORDER BY a.id",[state.p3.profile])).rows;
     const row=(await rest(`p3_group?group_id=eq.${state.p3.nativeGroup}`,owner,keys.client))[0];
     config.expectedGroupVersion=JSON.parse(row.document).version;
     const edges=(await db.query('SELECT salapiya_p3.edges($1) AS edges',[row.document])).rows[0].edges;
     const positions={};for(const edge of edges){positions[edge.sender]=(positions[edge.sender]??0n)-BigInt(edge.amount);positions[edge.recipient]=(positions[edge.recipient]??0n)+BigInt(edge.amount);}
     config.expectedPositions=Object.fromEntries(Object.entries(positions).map(([id,n])=>[id,String(n)]));
     config.expectedProfileVersion=(await rest('rpc/p2_profile_boundary',owner,keys.client,{method:'POST',body:{}})).revision;
   }finally{await db.end();}
 }
 const dir=path.join(privateDir,'p3',role);await mkdir(dir,{recursive:true});
 await writeFile(path.join(dir,'defines.json'),JSON.stringify({SALAPIYA_SUPABASE_URL:config.url,SALAPIYA_PUBLIC_KEY:config.publicKey,SALAPIYA_POWERSYNC_URL:config.endpoint}));
 await writeFile(path.join(dir,'config.json'),JSON.stringify(config),{mode:0o600});
 if(role==='android'){
   const adb=process.env.SALAPIYA_ADB,serial=process.env.SALAPIYA_ANDROID_DEVICE;if(!adb||!serial)throw Error('Select existing emulator and ADB');
   const result=spawnSync(adb,['-s',serial,'shell','run-as','dev.salapiya.salapiya','tee','files/p3-native-config.json'],{input:JSON.stringify(config),encoding:'utf8',windowsHide:true,stdio:['pipe','ignore','pipe']});
   if(result.status!==0)throw Error('Cannot stage private config without replacing existing installation');
 }
 report({prepared:role,config:'OS-user/app-private file only',syntheticIdentity:true,productionEntryPoint:true});
}catch(e){report({failure:e.code||e.message});process.exitCode=1;}
