import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/create-user.mjs';
const originalFetch=globalThis.fetch;
const originalUrl=process.env.SUPABASE_URL, originalKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
afterEach(()=>{globalThis.fetch=originalFetch;if(originalUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=originalUrl;if(originalKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=originalKey;});
function config(){process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='test-placeholder';}
const req=(body={})=>new Request('https://local.test/.netlify/functions/create-user',{method:'POST',headers:{Authorization:'Bearer user-test'},body:JSON.stringify(body)});
const json=x=>new Response(JSON.stringify(x),{status:200});
test('refuse les méthodes autres que POST',async()=>assert.equal((await handler(new Request('https://local.test'))).status,405));
test('refuse de fonctionner sans configuration serveur',async()=>{delete process.env.SUPABASE_URL;assert.equal((await handler(req())).status,503);});
test('un compte de site ne peut pas créer un utilisateur',async()=>{config();let calls=0;globalThis.fetch=async()=>json(++calls===1?{id:'site-user'}:[{role:'site'}]);assert.equal((await handler(req())).status,403);assert.equal(calls,2);});
test('un administrateur ne peut pas créer un utilisateur',async()=>{config();let calls=0;globalThis.fetch=async()=>json(++calls===1?{id:'admin-user'}:[{role:'admin'}]);assert.equal((await handler(req())).status,403);});
test('le super utilisateur ne peut pas créer un autre super via cet endpoint',async()=>{config();let calls=0;globalThis.fetch=async()=>json(++calls===1?{id:'super-user'}:[{role:'super'}]);assert.equal((await handler(req({username:'nouveau',display_name:'Nom',password:'long-password-test',role:'super'}))).status,400);assert.equal(calls,2);});
test('si la création du profil échoue, supprime le compte auth partiel',async()=>{config();const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(calls.length===1)return json({id:'super-user'});if(calls.length===2)return json([{role:'super'}]);if(calls.length===3)return json({id:'new-user'});if(calls.length===4)return new Response(JSON.stringify({message:'Deux comptes administrateurs maximum.'}),{status:400});return json({});};const r=await handler(req({username:'admin3',display_name:'Admin 3',password:'long-password-test',role:'admin'}));assert.equal(r.status,400);assert.equal(calls[4].opts.method,'DELETE');assert.match(calls[4].url,/new-user$/);});
test('accepte un identifiant court en majuscule et un mot de passe de six caractères',async()=>{
 config();const calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,opts});if(calls.length===1)return json({id:'super-user'});if(calls.length===2)return json([{role:'super'}]);if(calls.length===3){const body=JSON.parse(opts.body);assert.match(body.email,/^[a-f0-9]{64}@users\.caisse\.invalid$/);assert.equal(body.password,'abcdef');return json({id:'new-user'});}assert.equal(JSON.parse(opts.body).username,'X');return json({});};
 assert.equal((await handler(req({username:'X',display_name:'X',password:'abcdef',role:'admin'}))).status,201);
});
test('accepte un identifiant avec espaces et caractères accentués',async()=>{
 config();let n=0;globalThis.fetch=async()=>json(++n===1?{id:'super-user'}:n===2?[{role:'super'}]:n===3?{id:'new-user'}:{});
 assert.equal((await handler(req({username:'Équipe Kinshasa',display_name:'Équipe',password:'abcdef',role:'admin'}))).status,201);
});
