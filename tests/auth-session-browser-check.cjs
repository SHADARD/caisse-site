// Utilise le véritable SDK livré, avec un serveur Auth simulé uniquement.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist');const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname==='/'?'index.html':new URL(req.url,'http://local').pathname);try{res.setHeader('Content-Type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/jpeg':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const uid='00000000-0000-4000-8000-000000000001';const user={id:uid,email:'admin@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const jwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url')+'.'+Buffer.from('test-signature').toString('base64url');
  const profile={id:uid,username:'Admin',display_name:'Administrateur de test',role:'super',site_id:null};let logoutCalls=0,authCalls=0;
  await page.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',supabaseKey:'public-test'}}));
  await page.route('https://example.supabase.co/**',async r=>{
   const url=new URL(r.request().url());
   if(url.pathname==='/auth/v1/token'){
    authCalls++;const b=r.request().postDataJSON();if(b.password!=='correct-password'||b.email!=='admin@example.com')return r.fulfill({status:400,json:{error_code:'invalid_credentials',msg:'Invalid login credentials'}});
    return r.fulfill({json:{access_token:jwt,refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer',user}});
   }
   if(url.pathname==='/auth/v1/user')return r.fulfill({json:user});
   if(url.pathname==='/auth/v1/logout'){logoutCalls++;return r.abort('failed');}
   if(url.pathname==='/rest/v1/profiles')return r.fulfill({json:url.searchParams.has('id')?profile:[profile]});
   return r.fulfill({json:[]});
  });
  await page.addInitScript(()=>{
   if(!sessionStorage.getItem('lock-test-seeded')){
    localStorage.setItem('sb-example-auth-token',JSON.stringify({access_token:'old-session',refresh_token:'old-refresh'}));localStorage.setItem('other-app-data','keep');sessionStorage.setItem('lock-test-seeded','1');
   }
   // Une ancienne fenêtre retient indéfiniment le verrou standard du SDK.
   navigator.locks.request('lock:sb-example-auth-token',()=>new Promise(()=>{}));
  });
  const base='http://127.0.0.1:'+server.address().port;await page.goto(base);await page.waitForFunction(()=>document.querySelector('#login-form').dataset.handlerReady==='true');
  await page.locator('#connect').click();await page.locator('#login-form [name=username]').fill('admin@example.com');await page.locator('#login-form [name=password]').fill('correct-password');await page.locator('#login-form .primary').click();await page.waitForFunction(()=>!document.querySelector('#workspace').hidden,{timeout:10000});assert.equal(authCalls,2);
  assert.ok(await page.evaluate(()=>localStorage.getItem('flamingo-example-auth-v2')));
  await page.locator('#logout').click();await page.waitForFunction(()=>!localStorage.getItem('flamingo-example-auth-v2')&&!localStorage.getItem('sb-example-auth-token'));await page.waitForFunction(()=>!document.querySelector('#welcome').hidden);assert.equal(await page.evaluate(()=>localStorage.getItem('other-app-data')),'keep');assert.equal(logoutCalls,1);assert.deepEqual(errors,[]);
  console.log('OK : SDK réel, ancien verrou bloqué, connexion e-mail, déconnexion sans réseau et nettoyage limité au projet.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
