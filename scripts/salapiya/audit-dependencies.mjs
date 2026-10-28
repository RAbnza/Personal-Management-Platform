// Query OSV with package names/versions only. No source, records or credentials.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const lock=await readFile(new URL('apps/salapiya/pubspec.lock',root),'utf8');
const packages=[];
for(const match of lock.matchAll(/^  ([a-zA-Z0-9_]+):\r?\n([\s\S]*?)(?=^  [a-zA-Z0-9_]+:|^sdks:)/gm)){
 const version=match[2].match(/^    version: "([^"]+)"/m)?.[1];
 if(version&&/^    source: hosted$/m.test(match[2].replaceAll('\r','')))packages.push({package:{ecosystem:'Pub',name:match[1]},version});
}
const npm=JSON.parse(await readFile(new URL('services/salapiya/p0/package-lock.json',root),'utf8'));
for(const [path,value] of Object.entries(npm.packages||{})){
 if(!path||!value.version)continue;
 packages.push({package:{ecosystem:'npm',name:value.name||path.split('node_modules/').at(-1)},version:value.version});
}
packages.push({package:{ecosystem:'Maven',name:'com.android.tools:desugar_jdk_libs'},version:'2.1.4'});
const hits=[];
for(let start=0;start<packages.length;start+=100){
 const batch=packages.slice(start,start+100);
 const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:batch}),signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`OSV HTTP ${response.status}; audit incomplete`);
 const data=await response.json();
 if(data.results.length!==batch.length)throw Error('Incomplete OSV response');
 for(let i=0;i<batch.length;i++){
  if(data.results[i].next_page_token)throw Error('OSV pagination requires follow-up; audit incomplete');
  if(data.results[i].vulns?.length)hits.push({...batch[i],vulnerabilities:data.results[i].vulns});
 }
}
const result={measuredAt:new Date().toISOString(),source:'https://api.osv.dev/v1/querybatch',queried:packages.length,hits,
 scope:'Hosted Pub lock + server npm lock including development tools + Android desugaring; excludes Flutter engine, bundled SQLite, JDK/NDK/OS and complete transitive Gradle inventory.'};
await mkdir(new URL('out/p6/',root),{recursive:true});
await writeFile(new URL('out/p6/dependency-audit.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(hits.length)process.exitCode=1;
