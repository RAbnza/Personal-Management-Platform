import {deletionHandler} from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const publicKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!url || !publicKey || !serviceKey) throw new Error('Platform configuration required');
Deno.serve(deletionHandler({url, publicKey, serviceKey}));
