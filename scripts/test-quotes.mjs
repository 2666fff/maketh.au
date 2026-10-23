import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
const root=resolve(import.meta.dirname,'..');
test('quote submission, authentication, duplicate protection, validation and persistent updates',async()=>{
  mkdirSync(join(root,'.codex_tmp'),{recursive:true});
  const directory=mkdtempSync(join(root,'.codex_tmp','quotes-test-'));
  const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const base='http://127.0.0.1:'+port, config=join(directory,'config.json'), access=join(directory,'access.txt');
  execFileSync('php',[join(root,'scripts/provision-quotes.php'),'--config='+config,'--data='+join(directory,'data'),'--access-file='+access,'--origin='+base],{cwd:root});
  const password=readFileSync(access,'utf8').match(/Password: (.+)/)[1].trim();
  let server, passed=false;
  async function start(){
    server=spawn('php',['-S','127.0.0.1:'+port,join(root,'scripts/preview.php')],{cwd:root,env:{...process.env,MAKETH_QUOTES_CONFIG:config},stdio:'ignore'});
    for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/quotes.php?action=session');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}
    throw new Error('PHP test server did not start');
  }
  async function stop(){if(server&&server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill();await done;}}
  const client=()=>({cookie:'',csrf:''});
  async function call(c,action,method='GET',data,override={}){
    const r=await fetch(base+'/api/quotes.php?action='+action,{method,headers:{Cookie:c.cookie,...(data?{'Content-Type':'application/json',Origin:base,'X-CSRF-Token':c.csrf}:{}),...override},...(data?{body:JSON.stringify(data)}:{})});
    const cookie=r.headers.getSetCookie().find(x=>x.startsWith('maketh_quotes='));if(cookie)c.cookie=cookie.split(';')[0];
    const body=await r.json();if(body.csrf)c.csrf=body.csrf;return{status:r.status,body};
  }
  try {
    await start();const visitor=client(),owner=client();
    assert.equal((await call(visitor,'session')).status,200);
    assert.equal((await call(visitor,'list')).status,401);
    const quote={name:'Test <img src=x>',email:'qa@example.invalid',phone:'',business:'Integration test',package:'299',source:'main',message:'Requirements 中文',consent:true,requestKey:crypto.randomUUID()};
    assert.equal((await call(visitor,'create','POST',quote,{'X-CSRF-Token':'bad'})).status,403);
    assert.equal((await call(visitor,'create','POST',quote,{Origin:'https://example.invalid'})).status,403);
    assert.equal((await call(visitor,'create','POST',{...quote,email:'invalid'})).status,422);
    assert.equal((await call(visitor,'create','POST',{...quote,consent:false})).status,422);
    assert.equal((await call(visitor,'create','POST',{...quote,website:'spam'})).status,422);
    const created=await call(visitor,'create','POST',quote);assert.equal(created.status,201);assert(created.body.reference);
    const duplicate=await call(visitor,'create','POST',quote);assert.equal(duplicate.status,200);assert.equal(duplicate.body.reference,created.body.reference);
    assert.equal((await call(visitor,'update','PATCH',{id:created.body.reference,status:'closed',notes:''})).status,401);
    await call(owner,'session');
    assert.equal((await call(owner,'login','POST',{username:'owner',password:'wrong'})).status,401);
    assert.equal((await call(owner,'login','POST',{username:'owner',password})).status,200);
    const list=await call(owner,'list');assert.equal(list.body.total,1);assert.equal(list.body.quotes[0].message,quote.message);
    assert.equal((await call(owner,'update','PATCH',{id:created.body.reference,status:'contacted',notes:'已联系'})).status,200);
    await stop();await start();
    const persisted=await call(owner,'list&status=contacted&q='+created.body.reference);assert.equal(persisted.body.total,1);assert.equal(persisted.body.quotes[0].notes,'已联系');
    assert.equal((await call(owner,'logout','POST',{})).status,200);assert.equal((await call(owner,'list')).status,401);
    for(const path of ['/scripts/provision-quotes.php','/.codex_tmp/','/confs.txt'])assert.equal((await fetch(base+path)).status,404);
    passed=true;
  } finally {
    await stop();
    if(passed)rmSync(directory,{recursive:true,force:true});
    else console.error('Test evidence retained at '+directory);
  }
});
