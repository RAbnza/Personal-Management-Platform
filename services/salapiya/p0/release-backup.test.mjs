import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {hash,sealBackup,openBackup,retainedGenerations,storeGeneration} from './release-backup.mjs';

test('independent hosted encryption rejects wrong keys, corruption and unsupported format',()=>{
 const dump=Buffer.from('synthetic pg archive'),key=randomBytes(32);
 const bundle={format:1,manifest:{scope:'postgres:synthetic',dumpSha256:hash(dump)},dump:dump.toString('base64')};
 const bytes=sealBackup(bundle,key);
 assert.deepEqual(openBackup(bytes,key),bundle);
 assert.throws(()=>openBackup(bytes,randomBytes(32)));
 const corrupt=Buffer.from(bytes);corrupt[corrupt.length-20]^=1;
 assert.throws(()=>openBackup(corrupt,key));assert.throws(()=>openBackup(bytes.subarray(10),key));
});
test('retention preserves seven recent and four distinct completed weekly generations',()=>{
 const generations=Array.from({length:70},(_,i)=>({name:`backup-${i}`,createdAt:new Date(Date.UTC(2026,9,29-i)).toISOString()}));
 const keep=retainedGenerations(generations,new Date('2026-10-29T12:00:00Z'));
 for(let i=0;i<7;i++)assert(keep.has(`backup-${i}`));
 for(const i of [4,11,18,25])assert(keep.has(`backup-${i}`));
 assert.equal(keep.size,10);assert(!keep.has('backup-69'));
});
test('two verified encrypted copies precede retention; a failed destination cannot prune the healthy copy',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'salapiya-backup-test-'));
 try {
  const first=path.join(root,'first'),second=path.join(root,'second');
  const bytes=Buffer.from('synthetic encrypted archive');
  const result=await storeGeneration(bytes,[first,second],{scope:'synthetic'});
  assert.equal(result.copies,2);assert.equal(result.independentStorageVerified,false);
  assert.deepEqual(await readFile(path.join(first,result.name)),bytes);
  assert.deepEqual(await readFile(path.join(second,result.name)),bytes);
  await assert.rejects(storeGeneration(bytes,[first,first],{scope:'synthetic'}),/distinct/);
  const bad=path.join(root,'bad');await mkdir(bad);await mkdir(path.join(bad,'unrelated-owner-data'));
  await assert.rejects(storeGeneration(bytes,[first,bad],{scope:'synthetic'}),/empty dedicated/);
  assert((await readdir(first)).includes(result.name));
 } finally {await rm(root,{recursive:true,force:true});}
});
