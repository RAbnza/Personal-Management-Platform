// Encrypted, bounded backups. Keys are supplied out of band, never in argv.
import {createCipheriv,createDecipheriv,createHash,randomBytes,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,readdir,unlink,lstat,realpath,chmod} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const magic=Buffer.from('SALAPIYA-HOSTED-BACKUP-1\n');
const limit=512*1024*1024;
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function backupKey(encoded) {
 if(typeof encoded!=='string'||!/^[A-Za-z0-9_-]{43}=?$/.test(encoded))throw Error('A separate 256-bit backup key is required');
 const key=Buffer.from(encoded,'base64url');if(key.length!==32)throw Error('Invalid backup key');return key;
}
export function sealBackup(bundle,key) {
 const bytes=Buffer.from(JSON.stringify(bundle));if(bytes.length>limit)throw Error('Backup exceeds the bounded 512 MiB envelope');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);
 cipher.setAAD(magic);
 return Buffer.concat([magic,nonce,cipher.update(bytes),cipher.final(),cipher.getAuthTag()]);
}
export function openBackup(bytes,key) {
 if(bytes.length<magic.length+28||bytes.length>limit+magic.length+28||!bytes.subarray(0,magic.length).equals(magic))throw Error('Unsupported or incomplete encrypted backup');
 const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(magic.length,magic.length+12));
 cipher.setAAD(magic);cipher.setAuthTag(bytes.subarray(-16));
 const bundle=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(magic.length+12,-16)),cipher.final()]));
 if(bundle.format!==1||typeof bundle.manifest?.scope!=='string'||typeof bundle.dump!=='string'
 ||hash(Buffer.from(bundle.dump,'base64'))!==bundle.manifest.dumpSha256)throw Error('Invalid backup manifest or database digest');
 return bundle;
}

export function runBinary(executable,args,{env={},input,maxBytes=limit,ignoreOutput=false}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{env:{...process.env,...env},windowsHide:true,stdio:ignoreOutput?'ignore':['pipe','pipe','pipe']});
  const chunks=[],errors=[];let size=0,errorSize=0,failed=false;
  child.on('error',()=>{failed=true;reject(Error('Required PostgreSQL/tool executable could not start'));});
  child.stdout?.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){failed=true;child.kill();reject(Error('Bounded tool output exceeded'));}else chunks.push(chunk);});
  child.stderr?.on('data',chunk=>{errorSize+=chunk.length;if(errorSize<65536)errors.push(chunk);});
  child.stdin?.on('error',()=>{});
  child.on('close',code=>{if(!failed){if(code!==0){const error=Error(`Tool exited with code ${code}; no success recorded`);error.toolStderr=Buffer.concat(errors);reject(error);}else resolve(Buffer.concat(chunks));}});
  child.stdin?.end(input);
 });
}

export async function protectedDirectory(directory) {
 let absolute=path.resolve(directory);
 await mkdir(absolute,{recursive:true,mode:0o700});
 if((await lstat(absolute)).isSymbolicLink())throw Error('Backup destination must not be redirected');
 // Canonicalize Windows 8.3 ancestor aliases before checking storage boundaries.
 absolute=await realpath(absolute);
 const files=await readdir(absolute);
 if(files.some(f=>!/^\d{8}T\d{9}Z-[0-9a-f-]{36}\.sbackup(\.json|\.partial)?$/.test(f)&&f!=='.salapiya-backups'))throw Error('Select an empty dedicated backup directory');
 if(process.platform!=='win32') {
  if((await lstat(absolute)).uid!==process.getuid())throw Error('Backup directory must belong to the current operator');
  await chmod(absolute,0o700);
 }
 if(process.platform==='win32') {
  // Only a dedicated backup subdirectory is accepted; do not change an existing
  // storage root, home directory, system path or unrelated populated folder.
  const sid=(await runBinary('whoami.exe',['/user','/fo','csv','/nh'])).toString().match(/S-1-5-[0-9-]+/)?.[0];
  if(!sid)throw Error('Cannot determine backup-directory owner');
  await runBinary('icacls.exe',[absolute,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F']);
  // Explicit pre-existing grants must not remain silently accessible.
  const script="$a=Get-Acl -LiteralPath $env:SALAPIYA_BACKUP_ACL_TARGET; @($a.Access | Where-Object {$_.AccessControlType -eq 'Allow'} | ForEach-Object {$_.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value}) | ConvertTo-Json -Compress";
  const raw=await runBinary('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{env:{SALAPIYA_BACKUP_ACL_TARGET:absolute}});
  const allowed=JSON.parse(raw.toString().replace(/^\uFEFF/,''));
  if([allowed].flat().some(s=>![sid,'S-1-5-18'].includes(s)))throw Error('Unexpected explicit backup-directory access; operator review required');
 }
 await writeFile(path.join(absolute,'.salapiya-backups'),'Salapiya dedicated protected encrypted backups\n',{mode:0o600});
 return absolute;
}

export function retainedGenerations(generations,now=new Date()) {
 const sorted=[...generations].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.name.localeCompare(a.name));
 const keep=new Set(sorted.slice(0,7).map(g=>g.name));
 // Latest successful backup from each of four completed Monday-based weeks.
 const week=date=>{const d=new Date(date);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);};
 const current=week(now),weeks=new Set();
 for(const g of sorted){const w=week(g.createdAt);if(w>=current||weeks.has(w))continue;if(weeks.size===4)break;weeks.add(w);keep.add(g.name);}
 return keep;
}

export async function storeGeneration(bytes,destinations,{scope,createdAt=new Date().toISOString(),prune=true}={}) {
 if(!scope||!Array.isArray(destinations)||destinations.length!==2)throw Error('Two protected destinations and an explicit backup scope are required');
 if(!Number.isFinite(Date.parse(createdAt)))throw Error('Valid backup timestamp required');
 const roots=[];
 for(const directory of destinations)roots.push(await protectedDirectory(directory));
 const [a,b]=roots.map(x=>x.toLowerCase()+path.sep);
 if(a.startsWith(b)||b.startsWith(a))throw Error('Backup destinations must be distinct and non-nested');
 // Distinct paths are not evidence of independent physical/cloud failure domains.
 const name=new Date(createdAt).toISOString().replaceAll('-','').replaceAll(':','').replace('.','')+'-'+randomUUID()+'.sbackup';
 const manifest={format:1,scope,createdAt,sha256:hash(bytes),bytes:bytes.length};
 for(const root of roots){
  const target=path.join(root,name);
  await writeFile(target+'.partial',bytes,{flag:'wx',mode:0o600});
  if(hash(await readFile(target+'.partial'))!==manifest.sha256)throw Error('Backup copy verification failed; retention was not run');
  await rename(target+'.partial',target);
  await writeFile(target+'.json',JSON.stringify(manifest)+'\n',{flag:'wx',mode:0o600});
 }
 // Both copies must exist and match before any retention deletion begins.
 const deleted=[];
 if(prune)for(const root of roots){
  const generations=[];
  for(const file of await readdir(root)){
   if(!/^\d{8}T\d{9}Z-[0-9a-f-]{36}\.sbackup\.json$/.test(file))continue;
   const generation=JSON.parse(await readFile(path.join(root,file),'utf8'));
   if(generation.scope!==scope||generation.format!==1||!Number.isFinite(Date.parse(generation.createdAt)))continue;
   const archive=file.slice(0,-5);
   if(hash(await readFile(path.join(root,archive)))!==generation.sha256)throw Error('Historical backup failed verification; retention stopped');
   generations.push({...generation,name:archive});
  }
  const keep=retainedGenerations(generations,new Date(createdAt));
  for(const generation of generations)if(!keep.has(generation.name)){
   await unlink(path.join(root,generation.name));await unlink(path.join(root,generation.name+'.json'));deleted.push(generation.name);
  }
 }
 return {...manifest,name,copies:roots.length,prunedCopies:deleted.length,independentStorageVerified:false};
}

export async function capturePostgres({pgDump,connectionEnv,roles,migrations,securityJournal,source,snapshot}) {
 const dump=await runBinary(pgDump,['--format=custom','--no-owner','--schema=public','--schema=auth',
 '--schema=supabase_migrations','--schema=salapiya*',...(snapshot?['--snapshot='+snapshot]:[])],{env:connectionEnv,maxBytes:256*1024*1024});
 const manifest={scope:`postgres:${source}`,createdAt:new Date().toISOString(),source,
  dumpSha256:hash(dump),roles,migrations,
  exclusions:['Object/file bytes','Provider OAuth/JWT secrets and configuration','PowerSync service/storage','Replication credentials and slots','External encryption and signing keys']};
 return {format:1,manifest,securityJournal,dump:dump.toString('base64')};
}

// Offline recovery only. The operator supplies an independently authenticated,
// current security journal. Never expose this helper as a client RPC or run it
// against development/pilot as a drill. Session restoration is always forbidden.
export async function reconcileSecurityJournal(db,journal,{notOlderThan}={}) {
 if(!journal||!Number.isFinite(Date.parse(journal.measuredAt))||!notOlderThan
 ||Date.parse(journal.measuredAt)<Date.parse(notOlderThan))throw Error('A current independent security journal is mandatory before service ingress');
 await db.query('BEGIN');
 try {
  for(const d of journal.deletedAccounts){
   await db.query(`INSERT INTO salapiya_lifecycle.deleted_account(owner_id,profile_id,deleted_at,policy_version,auth_cleanup_completed_at)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(owner_id) DO NOTHING`,[d.owner_id,d.profile_id,d.deleted_at,d.policy_version,d.auth_cleanup_completed_at]);
   await db.query('SELECT salapiya_lifecycle.purge_deleted_account($1)',[d.owner_id]);
  }
  for(const d of journal.revokedSessions){
   await db.query(`INSERT INTO salapiya_lifecycle.device_session(session_id,owner_id,label,registered_at,last_seen_at,revoked_at,revoked_by_session)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(session_id) DO UPDATE SET revoked_at=excluded.revoked_at,revoked_by_session=excluded.revoked_by_session`,
   [d.session_id,d.owner_id,d.label,d.registered_at,d.last_seen_at,d.revoked_at,d.revoked_by_session]);
  }
  await db.query('DELETE FROM auth.sessions');
  await db.query('DELETE FROM public.p7_sync_session');
  await db.query('COMMIT');
 }catch(error){await db.query('ROLLBACK');throw error;}
}
