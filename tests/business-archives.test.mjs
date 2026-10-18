import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {makeSummary,createSummaryPdf} from '../server/archive-pdf.mjs';
import {saveArchive,resetAll,monthlyArchive} from '../server/business-archives.mjs';
const originalFetch=globalThis.fetch;afterEach(()=>globalThis.fetch=originalFetch);
const row={id:'r',site_id:'s',report_date:'2026-10-10',connection:'0.10',mpesa:'1200',commission:'5.25',gold_cost:'50',gold_weight:'0.001'};
const snapshot={kind:'monthly',created_at:'2026-11-09T23:05:00Z',period_start:'2026-10-10',period_end:'2026-11-09',sites:[{id:'s',name:'Site Étoile'}],reports:[row,{...row,id:'r2',connection:'0.20',report_date:'2026-11-09'},{...row,id:'outside',report_date:'2026-11-10'}],archived_reports:[{id:'old',data:{...row,id:'old',connection:'999'}}]};
test('synthèse exacte en FC/g, bornes incluses et anciennes données de reset exclues',()=>{
 const summary=makeSummary(snapshot);assert.equal(summary.report_count,2);assert.equal(summary.totals.connection,'0.30');assert.equal(summary.totals.gold_weight,'0.002');assert.equal(summary.sites[0].name,'Site Étoile');assert.equal(makeSummary({...snapshot,reports:[]}).report_count,0);
});
test('produit un vrai PDF avec xref cohérente et plusieurs pages',()=>{
 const large={...snapshot,sites:Array.from({length:40},(_,i)=>({id:'s'+i,name:'Site '+i})),reports:[]};const pdf=createSummaryPdf(large,makeSummary(large));const text=new TextDecoder().decode(pdf);assert.ok(text.startsWith('%PDF-1.4'));assert.match(text,/\/Count 3/);assert.match(text,/%%EOF/);const xref=Number(text.match(/startxref\n(\d+)/)[1]);assert.equal(text.slice(xref,xref+4),'xref');
});
test('aucun reset si le stockage échoue',async()=>{
 const calls=[];const client={rpc:async name=>{calls.push(name);return{token:'00000000-0000-4000-8000-000000000004',snapshot};},upload:async()=>{throw Error('Stockage indisponible');},url:'https://test.supabase.co',headers:()=>({})};globalThis.fetch=async()=>new Response('[]',{status:200});await assert.rejects(()=>saveArchive(client,'reset',null,'Bearer actor'),/Stockage/);assert.ok(!calls.includes('finish_business_archive'));assert.ok(calls.includes('cancel_business_archive'));
});
test('enregistre JSON puis PDF avant toute finalisation',async()=>{
 const order=[];const client={rpc:async(name,data)=>{order.push(name);return name==='acquire_archive_snapshot'?{token:'00000000-0000-4000-8000-000000000004',snapshot}:{archive:{id:'ok'}};},upload:async(path)=>order.push(path)};await saveArchive(client,'monthly',{start:'2026-10-10',end:'2026-11-09'});assert.deepEqual(order,['acquire_archive_snapshot','00000000-0000-4000-8000-000000000004/backup.json','00000000-0000-4000-8000-000000000004/summary.pdf','finish_business_archive']);
});
test('une archive mensuelle existante ne génère pas de second fichier',async()=>{const client={rpc:async()=>({existing:true,archive:{id:'old'}}),upload:()=>assert.fail('Aucun nouvel upload')};assert.equal((await saveArchive(client,'monthly',{})).already_saved,true);});
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service'};
const req=()=>new Request('https://site.test/api/reset-all',{method:'POST',headers:{Authorization:'Bearer user'},body:JSON.stringify({confirmation:'TOUT REINITIALISER',password:'test-password'})});
test('un administrateur ne peut pas appeler la réinitialisation générale',async()=>{let n=0;globalThis.fetch=async()=>new Response(JSON.stringify(++n===1?{id:'admin',email:'admin@test.invalid'}:[{role:'admin'}]));const response=await resetAll(req(),env);assert.equal(response.status,403);assert.equal(n,2);});
test('un mot de passe erroné ne déclenche aucune sauvegarde ni suppression',async()=>{let n=0;globalThis.fetch=async()=>{n++;if(n===1)return new Response(JSON.stringify({id:'super',email:'super@test.invalid'}));if(n===2)return new Response(JSON.stringify([{role:'super'}]));return new Response('{}',{status:400});};assert.equal((await resetAll(req(),env)).status,403);assert.equal(n,3);});
test('les routes refusent GET',async()=>{assert.equal((await resetAll(new Request('https://site.test'),env)).status,405);assert.equal((await monthlyArchive(new Request('https://site.test'),env)).status,405);});
