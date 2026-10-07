import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,chmod} from 'node:fs/promises';
const mode=process.argv[2];
if(!['live','mock'].includes(mode)){console.error('Usage: pnpm eval:setup live|mock\nCreates/keeps a server-only capability in ignored .env.local and writes its hash-only setup SQL. No database or API calls.');process.exitCode=1;}else{
 const file='.env.local';let contents=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;});
 const existing=contents.match(/^EVALUATOR_RUNTIME_SECRET=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
 if(existing&&!/^[a-f0-9]{64}$/.test(existing))throw new Error('Existing runtime secret has an unexpected format; no file was changed.');
 const secret=existing||randomBytes(32).toString('hex');
 const set=(key,value)=>{const line=`${key}=${value}`;const pattern=new RegExp(`^${key}=.*$`,'m');contents=pattern.test(contents)?contents.replace(pattern,line):contents.trimEnd()+'\n'+line+'\n';};
 set('EVALUATOR_RUNTIME_SECRET',secret);set('EVALUATOR_MODE',mode);
 await writeFile(file,contents,{mode:0o600});
 await chmod(file,0o600);
 await mkdir('artifacts/evals/setup',{recursive:true,mode:0o700});
 const hash=createHash('sha256').update(secret).digest('hex');
 await writeFile('artifacts/evals/setup/runtime-capability.sql',`-- Apply AFTER 20261006000400_m4b_live_evaluation.sql, as the trusted SQL owner.\n-- Only a hash, not the application secret. Rotate by regenerating the secret and reapplying.\ninsert into app_private.evaluator_runtime(singleton,secret_sha256) values(true,'${hash}')\non conflict(singleton) do update set secret_sha256=excluded.secret_sha256;\n`,{mode:0o600});
 console.log(`Configured explicit ${mode} mode in ignored .env.local. Secret was not printed.\nApply the M4-B migration, then artifacts/evals/setup/runtime-capability.sql. Restart the dev server.\nNo DB changes or paid API calls were made.`);
}
