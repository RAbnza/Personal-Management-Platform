import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {protect} from './cloud.mjs';

export const privateDir=path.join(process.env.LOCALAPPDATA,'Salapiya','p0','hosted');
export async function readState(){
  try{return JSON.parse(await readFile(path.join(privateDir,'state.json'),'utf8'));}
  catch(e){if(e.code==='ENOENT')return {};throw e;}
}
export async function saveState(state){
  await mkdir(privateDir,{recursive:true});
  await writeFile(path.join(privateDir,'state.json'),JSON.stringify(state),{mode:0o600});
}
export function protectState(state){
  for(const [key,value]of Object.entries(state)){
    if(value&&typeof value==='object')protectState(value);
    else if(typeof value==='string'&&/password|token|secret|key/i.test(key))protect(value);
  }
  return state;
}
