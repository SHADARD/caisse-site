import {test} from 'node:test';
import assert from 'node:assert/strict';
import {totals,validateReport} from './domain.mjs';
const r={report_date:'2026-01-02',connection:100,mpesa:1000,commission:10,gold_cost:200,gold_weight:1.125};
test('les commissions en FC sont additionnées, jamais traitées comme un taux',()=>assert.deepEqual(totals([r,{...r,connection:50,mpesa:500,commission:5,gold_cost:100,gold_weight:.125}]),{connection:150,mpesa:1500,commission:15,gold_cost:300,gold_weight:1.25}));
test('une nouvelle période a cinq cumuls à zéro',()=>assert.deepEqual(Object.values(totals([])),[0,0,0,0,0]));
test('refuse montants négatifs, vides, infinis et précision excessive',()=>{for(const value of [-1,'',Infinity,1.001])assert.throws(()=>validateReport({...r,connection:value},'2026-01-01'));});
test('accepte les grammes à trois décimales et les montants nuls',()=>assert.doesNotThrow(()=>validateReport({...r,commission:0},'2026-01-01')));
test('refuse une date antérieure à la période, future ou impossible',()=>{assert.throws(()=>validateReport(r,'2026-02-01'));assert.throws(()=>validateReport({...r,report_date:'2999-01-01'},'2026-01-01'));assert.throws(()=>validateReport({...r,report_date:'2026-02-30'},'2026-01-01'));});
