import { readFile, writeFile, mkdir, readdir, unlink, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { generate } from './codex.mjs';
const configPath=process.argv[2];
if(!configPath)throw Error('Expected private config path');
if((await stat(configPath)).mode & 0o077)throw Error('Config must have mode 0600');
const config=JSON.parse(await readFile(configPath,'utf8'));
if(!/^https:\/\//.test(config.url)||!config.secret||!config.workDir||!config.codex||!config.model)throw Error('Invalid config');
await mkdir(config.workDir,{recursive:true,mode:0o700});
const outbox=join(config.workDir,'outbox');await mkdir(outbox,{recursive:true,mode:0o700});
let stopping=false,active=null;
const stop=()=>{stopping=true;active?.abort();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(path,data){
  const response=await fetch(`${config.url}/api/worker/${path}`,{method:'POST',headers:{Authorization:`Bearer ${config.secret}`,'Content-Type':'application/json'},body:JSON.stringify(data||{}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error(`gateway_${response.status}`);return response.json();
}
async function flush(){
  for(const file of await readdir(outbox)){
    if(!file.endsWith('.json'))continue;const path=join(outbox,file),data=JSON.parse(await readFile(path,'utf8'));
    await api(`jobs/${data.id}`,{lease:data.lease,result:data.result});await unlink(path);
  }
}
async function persist(id,data){
  const file=await open(join(outbox,`${id}.json`),'w',0o600);
  try{await file.writeFile(JSON.stringify(data));await file.sync();}finally{await file.close();}
}
console.log('screenshot worker starting');
while(!stopping){
  try{
    await flush();const {job,input}=await api('claim');if(!job){await sleep(4000);continue;}
    console.log(`job ${job.id} started`);active=new AbortController();
    let checking=false;
    const heartbeat=setInterval(async()=>{if(checking)return;checking=true;try{await api('heartbeat');const state=await api(`jobs/${job.id}`,{lease:job.lease});if(state.cancelRequested)active?.abort();}catch{active?.abort();}finally{checking=false;}},10000);
    const result=input?await generate(config,input,active.signal):{ok:false,error:'input_missing',usage:null};
    clearInterval(heartbeat);active=null;
    await persist(job.id,{id:job.id,lease:job.lease,result});await flush();
    console.log(`job ${job.id} ${result.ok?'completed':'failed'} usage=${result.usage?result.usage.input+result.usage.output:'unknown'}`);
  }catch{console.error('gateway unavailable; retrying without replaying inference');await sleep(10000);}
}
await flush().catch(()=>{});
