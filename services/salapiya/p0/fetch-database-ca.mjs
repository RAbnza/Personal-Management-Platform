import {mkdir,writeFile} from 'node:fs/promises';
import {X509Certificate} from 'node:crypto';

// Public trust roots from the pinned official CLI source, never a peer's
// unverified certificate. Keep hostname verification enabled in database.mjs.
const source=await(await fetch('https://raw.githubusercontent.com/supabase/cli/v2.122.0/apps/cli/src/command-internal/pgdelta-ssl.ts')).text();
const literal=source.match(/PG_DELTA_CA_BUNDLE\s*=\s*("(?:[^"\\]|\\.)*")/s)?.[1];
if(!literal)throw Error('Official CA source changed');
const bundle=JSON.parse(literal);
const roots=bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
  .filter(pem=>{const c=new X509Certificate(pem);return c.ca&&c.subject.includes('CN=Supabase Root 2021 CA');});
if(roots.length!==2)throw Error('Unexpected official production CA roots');
await mkdir(new URL('supabase/certs/',import.meta.url),{recursive:true});
await writeFile(new URL('supabase/certs/supabase-ca.crt',import.meta.url),roots.join('\n')+'\n');
console.log(JSON.stringify({publicProductionRoots:roots.length}));
