import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { createClient } from '@supabase/supabase-js';
import { loadSupabaseCases } from './datasets.mjs';

export async function readAdminDataset(versionIds) {
  if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Run the Supabase dataset command in an interactive terminal; credentials are not accepted as CLI flags.');
  let url;try{url=new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);}catch{throw new Error('Configure Supabase before selecting its dataset.');}
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password||!key?.startsWith('sb_publishable_'))throw new Error('The DB loader requires the existing hosted URL and publishable key, never a service-role key.');
  const client=createClient(url.origin,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options={})=>fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)})}});
  let hidden=false;
  const output=new Writable({write(chunk,encoding,done){if(!hidden)process.stdout.write(chunk,encoding);done();}});
  const terminal=createInterface({input:process.stdin,output,terminal:true});
  const cancellation=new AbortController();terminal.on('SIGINT',()=>terminal.close());terminal.on('close',()=>cancellation.abort());
  try {
    console.log('Read-only M3 dataset. Use an existing admin account. Password input is hidden and stays in memory.');
    const email=await terminal.question('Admin email: ',{signal:cancellation.signal});
    hidden=true;process.stdout.write('Admin password (hidden): ');
    let password=await terminal.question('',{signal:cancellation.signal});hidden=false;process.stdout.write('\n');
    let result;try{result=await client.auth.signInWithPassword({email,password});}finally{password='';}
    if(result.error||!result.data.session)throw new Error('Admin sign-in failed.');
    return await loadSupabaseCases(client,versionIds);
  } finally {
    hidden=false;terminal.close();
    const {error}=await client.auth.signOut({scope:'local'});
    if(error)console.error('The CLI could not close its own Auth session; no global sign-out was requested.');
  }
}
