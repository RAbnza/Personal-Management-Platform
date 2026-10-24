import {connectHosted} from './database.mjs';
import {report} from './cloud.mjs';
let client;
try{
  client=await connectHosted();
  const result=await client.query('SELECT current_database() AS database, pg_backend_pid() AS pid, version() AS version');
  report({connected:true,...result.rows[0]});
}catch(error){report({connected:false,code:error.code||'connection_failed',type:error.name});process.exitCode=1;}
finally{await client?.end();}
