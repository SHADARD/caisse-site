// Vérification navigateur locale ; aucune donnée ni connexion Supabase réelle.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'../dist');
 const server=http.createServer((req,res)=>{
  const name=new URL(req.url,'http://local').pathname;
  const file=path.join(root,name==='/'?'index.html':name);
  try{res.setHeader('Content-Type',/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/jpeg':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 let browser;
 try{
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const base='http://127.0.0.1:'+server.address().port;
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Reproduction : la configuration reste en attente, la navigation doit fonctionner.
  await page.clock.install();
  await page.route('**/api/config',()=>{});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#login-form').dataset.handlerReady==='true');
  assert.equal(await page.locator('#connect').isDisabled(),false);
  await page.locator('#connect').click();assert.equal(await page.locator('#login').isVisible(),true);
  await page.locator('#back-welcome').click();assert.equal(await page.locator('#welcome').isVisible(),true);
  await page.locator('#ios-install').click();assert.equal(await page.locator('#ios-install-dialog').isVisible(),true);
  await page.locator('#ios-install-dialog button').click();await page.locator('#connect').click();await page.locator('#login-form [name=username]').fill('Test');await page.locator('#login-form [name=password]').fill('incorrect');await page.locator('#login-form .primary').click();await page.clock.fastForward(12001);await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('indisponible'));assert.equal(await page.locator('#login-form .primary').isEnabled(),true);
  await page.close();
  // Un module absent ne doit pas rendre les boutons de navigation inertes.
  const failed=await browser.newPage();await failed.route('**/app.js?*',r=>r.abort());await failed.goto(base);await failed.locator('#connect').click();assert.equal(await failed.locator('#login').isVisible(),true);await failed.locator('#login-form [name=username]').fill('Test');await failed.locator('#login-form [name=password]').fill('incorrect');await failed.locator('#login-form .primary').click();assert.match(await failed.locator('#notice').textContent(),/n’a pas fini de charger/);await failed.close();
  // Connexion de test, erreur visible puis accès au tableau de bord.
  const login=await browser.newPage();login.on('pageerror',e=>errors.push(e.message));
  await login.route('**/api/config',r=>r.fulfill({json:{supabaseUrl:'https://example.supabase.co',supabaseKey:'public-test'}}));
  await login.route('**/vendor/supabase-2.49.1.js',r=>r.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>window.__fakeDb};'}));
  await login.addInitScript(()=>{
   const profile={id:'00000000-0000-4000-8000-000000000001',username:'Test',display_name:'Test',role:'super',site_id:null};
   window.__attempts=[];
   window.__fakeDb={auth:{getSession:async()=>({data:{session:null}}),getUser:async()=>({data:{user:{id:profile.id}}}),signInWithPassword:async body=>{window.__attempts.push(body.email);return body.password==='correct-password'?{error:null}:{error:{code:'invalid_credentials',message:'Invalid login credentials'}};}},from(table){let single=false;const q={select(){return q;},eq(){return q;},order(){return q;},range(){return q;},single(){single=true;return q;},then(resolve){return Promise.resolve({data:single?profile:table==='profiles'?[profile]:[],error:null}).then(resolve);}};return q;}};
  });
  await login.goto(base);await login.locator('#connect').click();await login.locator('#login-form [name=username]').fill('Test');await login.locator('#login-form [name=password]').fill('incorrect');await login.locator('#login-form .primary').click();await login.waitForFunction(()=>document.querySelector('#notice').textContent.includes('incorrect'));assert.equal(await login.locator('#login-form .primary').isEnabled(),true);
  await login.locator('#login-form [name=password]').fill('correct-password');await login.locator('#login-form .primary').click();await login.waitForFunction(()=>!document.querySelector('#workspace').hidden);assert.match(await login.locator('#identity').textContent(),/Test/);assert.deepEqual(errors,[]);
  console.log('OK : navigation pendant chargement, secours sans module, erreur puis connexion au tableau de bord.');
 }finally{if(browser)await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(error=>{console.error(error);process.exitCode=1;});
