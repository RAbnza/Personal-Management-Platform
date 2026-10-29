import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {sb,verifyProject,ref} from './cloud.mjs';

export async function connectHosted(){
  await verifyProject();
  const poolers=await sb('/config/database/pooler');
  const pooler=poolers.find(p=>p.db_user===`postgres.${ref}`);
  if(!pooler)throw Error('No matching development pooler');
  const client=new pg.Client({host:pooler.db_host,port:5432,user:pooler.db_user,
    database:'postgres',password:process.env.SUPABASE_DB_PASSWORD,
    ssl:{rejectUnauthorized:true,ca:await readFile(new URL('supabase/certs/supabase-ca.crt',import.meta.url),'utf8')},connectionTimeoutMillis:15000,
    application_name:'salapiya_p0_hosted_proof',statement_timeout:20000});
  await client.connect();
  return client;
}
