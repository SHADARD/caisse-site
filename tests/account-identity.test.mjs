import {test} from 'node:test';import assert from 'node:assert/strict';
import {accountEmail,loginEmails} from '../account-identity.mjs';
test('la connexion ignore la casse, conserve les espaces internes et accepte les anciens identifiants',async()=>{
 assert.equal(await accountEmail(' Équipe A '),await accountEmail('équipe a'));
 assert.notEqual(await accountEmail('a b'),await accountEmail('ab'));
 assert.equal((await loginEmails('Responsable'))[1],'responsable@users.caisse.invalid');
 assert.equal((await loginEmails('ME@example.com'))[1],'me@example.com');
 assert.match(await accountEmail('X'.repeat(1000)),/^[a-f0-9]{64}@users\.caisse\.invalid$/);
});
