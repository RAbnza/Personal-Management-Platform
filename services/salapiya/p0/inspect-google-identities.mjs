import {createHash} from 'node:crypto';
import {query,report} from './cloud.mjs';
// Account selection aid only: no full email, provider tokens or credentials.
const users=await query("SELECT id,email FROM auth.users WHERE raw_app_meta_data->'providers' ? 'google'");
report({googleAccounts:users.map(user=>{
  const [name,domain]=user.email.split('@');
  return {fingerprint:createHash('sha256').update(user.id).digest('hex').slice(0,16),
    accountLabel:`${name.slice(0,3)}…${name.slice(-2)}@${domain}`};
})});
