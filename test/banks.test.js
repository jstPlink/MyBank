import test from 'node:test';
import assert from 'node:assert/strict';
import { finishLink, syncConnection, keepAccountIds, purgeOrphans } from '../src/banks.js';

const txs = [
  { transaction_id: 'A1', booking_date: '2026-09-02', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '12.50', currency: 'EUR' }, creditor: { name: 'Bar' } },
  { transaction_id: 'A2', booking_date: '2026-09-03', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '30.00', currency: 'EUR' }, creditor: { name: 'Super' } },
];
// banca finta con identificativi di conto che cambiano a ogni consenso, come Enable Banking
const clientFor = (session, uids) => ({
  createSession: async () => ({ session_id: session, accounts: uids.map((u, i) => ({ uid: u, name: i ? 'Pocket' : 'Mario', currency: 'EUR', ...(i ? {} : { account_id: { iban: 'IT60X0542811101000000123456' } }) })) }),
  transactions: async (uid, q) => { assert.ok(uids.includes(uid), `uid sconosciuto alla banca: ${uid}`); return { transactions: q.transaction_status === 'PDNG' ? [] : (uid === uids[0] ? txs : []) }; },
});
const newDb = () => ({ settings: { cutoff: '2000-01-01' }, banking: { connections: [], pending: {}, names: {} }, transactions: {}, overrides: {}, unsorted: {}, renames: {} });
const link = async (db, client, state) => {
  db.banking.pending[state] = { bank: 'revolut', aspsp: { name: 'Revolut', country: 'LT' }, validUntil: '2027-01-01T00:00:00Z', createdAt: Date.now() };
  return finishLink({ client, db, code: 'c', state });
};

test('un nuovo consenso con identificativi di conto diversi non reimporta e non perde le scelte a mano', async () => {
  const db = newDb();
  let conn = await link(db, clientFor('s1', ['uid-1', 'uid-2']), 'st1');
  await syncConnection({ client: clientFor('s1', ['uid-1', 'uid-2']), db, conn });
  const ids = Object.keys(db.transactions).sort();
  assert.equal(ids.length, 2);
  db.overrides[ids[0]] = 'svago';           // scelto a mano
  delete db.unsorted[ids[0]];

  const second = clientFor('s2', ['nuovo-9', 'nuovo-8']);
  conn = await link(db, second, 'st2');
  assert.deepEqual(conn.accounts.map((a) => a.uid), ['uid-1', 'uid-2']);          // l'identità dei conti resta
  assert.deepEqual(conn.accounts.map((a) => a.apiUid), ['nuovo-9', 'nuovo-8']);   // alla banca si manda quello di adesso
  const report = await syncConnection({ client: second, db, conn });

  assert.deepEqual(Object.keys(db.transactions).sort(), ids);   // niente duplicati
  assert.equal(report.added, 0);
  assert.equal(db.overrides[ids[0]], 'svago');                  // la scelta a mano resta
  assert.equal(db.unsorted[ids[0]], undefined);
});

test('conti uguali senza IBAN si abbinano solo se il numero coincide', () => {
  const old = [{ uid: 'a', name: 'P', type: 'x', currency: 'EUR' }, { uid: 'b', name: 'P', type: 'x', currency: 'EUR' }];
  const same = keepAccountIds(old, [{ uid: 'n1', name: 'P', type: 'x', currency: 'EUR' }, { uid: 'n2', name: 'P', type: 'x', currency: 'EUR' }]);
  assert.deepEqual(same.map((a) => a.uid), ['a', 'b']);
  const diff = keepAccountIds(old, [{ uid: 'n1', name: 'P', type: 'x', currency: 'EUR' }]);
  assert.deepEqual(diff.map((a) => a.uid), ['n1']);              // ambiguo: meglio un conto nuovo che uno scambiato
});

test('purgeOrphans toglie le copie senza conto collegato e passa le scelte a mano a quelle attuali', () => {
  const mk = (id, account, extra = {}) => ({ id, bank: 'unicredit', account, date: '2026-09-01', amount: -5, description: 'Bar', currency: 'EUR', ...extra });
  const db = {
    banking: { connections: [{ bank: 'unicredit', accounts: [{ uid: 'nuovo' }] }] },
    transactions: { a: mk('a', 'vecchio'), b: mk('b', 'nuovo'), c: mk('c', 'nuovo', { description: 'Altro' }), d: mk('d', 'estratto:x', { imported: true }) },
    overrides: { a: 'svago' }, renames: { a: 'Caffè' }, unsorted: { b: true }, recurringLinks: {},
  };
  assert.equal(purgeOrphans(db), 1);
  assert.deepEqual(Object.keys(db.transactions).sort(), ['b', 'c', 'd']);
  assert.equal(db.overrides.b, 'svago');
  assert.equal(db.renames.b, 'Caffè');
  assert.equal(db.unsorted.b, undefined); // la copia vecchia era già smistata
  assert.equal(db.overrides.a, undefined);
  assert.equal(purgeOrphans(db), 0);
});
