import {test} from 'node:test';
import assert from 'node:assert/strict';
import publicConfig from '../server/public-config.mjs';
const request=new Request('https://example.test/api/config');
const jwt=role=>'header.'+btoa(JSON.stringify({role}))+'.signature';
test('transmet uniquement URL et clé publique, jamais service_role',async()=>{const r=publicConfig(request,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:'private-must-not-appear'});assert.equal(r.status,200);const body=await r.json();assert.deepEqual(Object.keys(body).sort(),['supabaseKey','supabaseUrl']);assert.ok(!JSON.stringify(body).includes('private-must-not-appear'));});
test('refuse une clé service_role ou secret comme clé publique',async()=>{for(const key of [jwt('service_role'),'sb_secret_should-not-appear']){const r=publicConfig(request,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:key});assert.equal(r.status,503);assert.ok(!(await r.text()).includes(key));}});
test('clé publique absente produit un message explicite, sans repli sur clé secrète',async()=>{const r=publicConfig(request,{SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private'});assert.equal(r.status,503);assert.match((await r.json()).error,/SUPABASE_ANON_KEY/);});
test('accepte une clé publishable et impose HTTPS',()=>{const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test_public_key'};assert.equal(publicConfig(request,env).status,200);assert.equal(publicConfig(request,{...env,SUPABASE_URL:'http://example.test'}).status,503);});
