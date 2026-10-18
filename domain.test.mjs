import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totals,validateReport,periodFloor,openPeriodReports} from './domain.mjs';
const r={report_date:'2026-01-02',connection:100,mpesa:1000,commission:10,gold_cost:200,gold_weight:1.125};
test('les commissions en FC sont additionnées, jamais traitées comme un taux',()=>assert.deepEqual(totals([r,{...r,connection:50,mpesa:500,commission:5,gold_cost:100,gold_weight:.125}]),{connection:150,mpesa:1500,commission:15,gold_cost:300,gold_weight:1.25}));
test('une nouvelle période a cinq cumuls à zéro',()=>assert.deepEqual(Object.values(totals([])),[0,0,0,0,0]));
test('refuse montants négatifs, vides, infinis et précision excessive',()=>{for(const value of [-1,'',Infinity,1.001])assert.throws(()=>validateReport({...r,connection:value},'2026-01-01'));});
test('accepte les grammes à trois décimales et les montants nuls',()=>assert.doesNotThrow(()=>validateReport({...r,commission:0},'2026-01-01')));
test('refuse une date antérieure à la période, future ou impossible',()=>{assert.throws(()=>validateReport(r,'2026-02-01'));assert.throws(()=>validateReport({...r,report_date:'2999-01-01'},'2026-01-01'));assert.throws(()=>validateReport({...r,report_date:'2026-02-30'},'2026-01-01'));});

test('autorise la reprise des jours passés dans la première période',()=>{
 const first={id:'first',site_id:'a',opened_at:'2026-02-01T09:00:00Z',closed_at:null};
 assert.equal(periodFloor(first,[first]),'');
 assert.doesNotThrow(()=>validateReport(r,periodFloor(first,[first])));
});
test('une clôture impose la date de début pour la période suivante',()=>{
 const first={id:'first',site_id:'a',opened_at:'2026-01-01T09:00:00Z',closed_at:'2026-02-01T09:00:00Z'};
 const next={id:'next',site_id:'a',opened_at:'2026-02-01T09:00:00Z',closed_at:null};
 assert.equal(periodFloor(next,[first,next]),'2026-02-01');
 assert.throws(()=>validateReport(r,periodFloor(next,[first,next])));
 assert.equal(periodFloor({...next,site_id:'b'},[first]),'');
});

test('cumuls globaux : additionne tous les sites ouverts, sans les caisses clôturées',()=>{
 const periods=[{id:'a-open',site_id:'a',closed_at:null},{id:'b-open',site_id:'b',closed_at:null},{id:'a-old',site_id:'a',closed_at:'2026-01-01'}];
 const data=[{...r,site_id:'a',period_id:'a-open'},{...r,connection:200,site_id:'b',period_id:'b-open'},{...r,connection:900,site_id:'a',period_id:'a-old'}];
 assert.equal(totals(openPeriodReports(data,periods)).connection,300);
 assert.equal(totals(openPeriodReports(data,periods,'a')).connection,100);
 assert.equal(openPeriodReports(data,periods,'none').length,0);
 const closed=periods.map(p=>({...p,closed_at:'2026-02-01'}));
 assert.equal(openPeriodReports(data,closed).length,0);
});
test('ignore un rapport dont le site ne correspond pas à sa période',()=>assert.equal(openPeriodReports([{...r,site_id:'b',period_id:'a'}],[{id:'a',site_id:'a',closed_at:null}]).length,0));
