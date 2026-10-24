import test from 'node:test';
import assert from 'node:assert/strict';
import { pocketTag, inferPocketName, isPocketTransfer, classify } from '../src/tags.js';
import { monthBudget } from '../src/stats.js';

test('il pocket decide il tag: numero iniziale e maiuscole non contano', () => {
  assert.equal(pocketTag('01 Spesa'), 'spesa');
  assert.equal(pocketTag('02 svago'), 'svago');
  assert.equal(pocketTag('3. Carburante'), 'carburante');
  assert.equal(pocketTag('03 Auto'), 'carburante'); // il pocket può chiamarsi anche «Auto»
  assert.equal(pocketTag('04 ALTRO'), 'altro');
  assert.equal(pocketTag('Risparmi'), null);
  assert.equal(pocketTag(''), null);
});

test('il nome del pocket si deduce dal testo dei movimenti', () => {
  const txs = [{ remittance: 'Accredita EUR 01 Spesa da EUR' }, { remittance: 'Accredita EUR 01 Spesa da EUR' }, { description: 'Esselunga' }];
  assert.equal(inferPocketName(txs), '01 Spesa');
  assert.equal(inferPocketName([{ description: 'Conad' }]), null);
});

test('i giri tra pocket si riconoscono dal testo', () => {
  assert.ok(isPocketTransfer({ description: 'Mario', remittance: 'Accredita EUR 02 Svago da EUR' }));
  assert.ok(isPocketTransfer({ description: 'A EUR 03 Carburante' }));
  assert.ok(!isPocketTransfer({ description: 'Esselunga Milano' }));
});

function dbWith(transactions, { names = {}, overrides = {} } = {}) {
  return {
    transactions: Object.fromEntries(transactions.map((t) => [t.id, { bank: 'revolut', currency: 'EUR', ...t }])),
    overrides,
    banking: {
      names,
      connections: [
        { id: 'c1', bank: 'revolut', accounts: [{ uid: 'main', iban: 'LT12', name: 'Mario' }, { uid: 'p1', iban: '', name: 'Mario' }, { uid: 'p2', iban: '', name: 'Mario' }, { uid: 'p3', iban: '', name: 'Mario' }] },
        { id: 'c2', bank: 'unicredit', accounts: [{ uid: 'uni', iban: 'IT60X0542811101000000123456', name: 'Conto' }] },
      ],
    },
  };
}

test('uscite dal pocket Spesa → Spesa; altri pocket, principale e UniCredit → Non definito; entrate → Entrata', () => {
  const db = dbWith([
    { id: 'a', account: 'p1', date: '2026-10-02', amount: -12, description: 'Esselunga' },
    { id: 'b', account: 'p2', date: '2026-10-02', amount: -5, description: 'Bar' },
    { id: 'c', account: 'main', date: '2026-10-02', amount: -7, description: 'Taxi' },
    { id: 'd', account: 'uni', bank: 'unicredit', date: '2026-10-02', amount: -9, description: 'Coop' },
    { id: 'e', account: 'uni', bank: 'unicredit', date: '2026-10-02', amount: 1800, description: 'Stipendio' },
    { id: 'f', account: 'p3', date: '2026-10-02', amount: -4, description: 'Spotify' },
  ], { names: { p1: '01 Spesa', p3: '04 Altro' } });
  const tags = classify(db);
  assert.equal(tags.get('a'), 'spesa');
  assert.equal(tags.get('b'), 'non_definito');
  assert.equal(tags.get('c'), 'non_definito');
  assert.equal(tags.get('d'), 'non_definito');
  assert.equal(tags.get('e'), 'entrata');
  assert.equal(tags.get('f'), 'altro');
});

test('giroconti: testo del pocket, IBAN di un mio conto, coppia uscita/entrata nella stessa banca; la scelta a mano vince', () => {
  const db = dbWith([
    { id: 't1', account: 'p1', date: '2026-10-02', amount: 150, description: 'Mario', remittance: 'Accredita EUR 01 Spesa da EUR' },
    { id: 't2', account: 'uni', bank: 'unicredit', date: '2026-10-03', amount: -300, description: 'Mario', counterIban: 'LT12' },
    { id: 't3', account: 'main', date: '2026-10-03', amount: 300, description: 'Mario', counterIban: 'IT60X0542811101000000123456' },
    { id: 't4', account: 'main', date: '2026-10-05', amount: -80, description: 'Mario' },
    { id: 't5', account: 'p2', date: '2026-10-06', amount: 80, description: 'Mario' },
    { id: 't6', account: 'main', date: '2026-10-07', amount: -20, description: 'Cena' },
  ], { overrides: { t6: 'giroconto', t3: 'entrata' } });
  const tags = classify(db);
  assert.equal(tags.get('t1'), 'giroconto');
  assert.equal(tags.get('t2'), 'giroconto'); // IBAN della controparte = il mio conto Revolut
  assert.equal(tags.get('t3'), 'entrata'); // scelto a mano
  assert.equal(tags.get('t4'), 'giroconto'); // uscita dal principale ed entrata sul pocket, stesso importo, stessa banca
  assert.equal(tags.get('t5'), 'giroconto');
  assert.equal(tags.get('t6'), 'giroconto'); // a mano
});

test('budget: spesa media degli ultimi 3 mesi completi, solo dai mesi con dati', () => {
  const db = dbWith([
    { id: 'j', account: 'p1', date: '2026-07-15', amount: -999, description: 'Prima dei dati' }, // luglio: prima del 1 agosto, non conta
    { id: 'a', account: 'p1', date: '2026-08-10', amount: -30, description: 'Esselunga' },
    { id: 's', account: 'p1', date: '2026-09-05', amount: -60, description: 'Esselunga' },
    { id: 'b', account: 'p2', date: '2026-09-06', amount: -20, description: 'Bar' }, // non definito: non è una categoria con budget
    { id: 'o', account: 'p1', date: '2026-10-02', amount: -10, description: 'Esselunga' }, // il mese in corso non entra nella media
    { id: 'i', account: 'uni', bank: 'unicredit', date: '2026-09-07', amount: 500, description: 'Stipendio' },
  ], { names: { p1: '01 Spesa' } });
  db.settings = { budgets: {} };
  const now = new Date('2026-10-13T10:00:00Z');
  const cats = monthBudget(db, now).cats;
  assert.equal(cats.spesa.avg3, 45); // (30 + 60) / 2 mesi con dati
  assert.equal(cats.svago.avg3, 0);
  assert.equal(cats.spesa.spent, 10);
  // ad agosto 2026 non c'è ancora nessun mese completo con dati
  assert.equal(monthBudget(db, new Date('2026-08-20T10:00:00Z')).cats.spesa.avg3, null);
});

test("addebito mensile della carta di credito: giroconto solo se di quel mese c'è l'estratto della carta", () => {
  const settle = { id: 's', account: 'estratto:unicredit:conto', bank: 'unicredit', date: '2025-01-06', amount: -50, description: 'PAGAMENTO PER UTILIZZO CARTE DI CREDITO', remittance: 'ESTRATTO 12/2024 CARTA 5XXXXXXXXXXX1502' };
  const other = { id: 'o', account: 'estratto:unicredit:conto', bank: 'unicredit', date: '2025-02-06', amount: -30, description: 'PAGAMENTO PER UTILIZZO CARTE DI CREDITO', remittance: 'ESTRATTO 01/2025 CARTA 5XXXXXXXXXXX1502' };
  const card = { id: 'c', account: 'estratto:unicredit:carta', bank: 'unicredit', date: '2024-12-05', amount: -50, description: 'Pagamento E-Commerce' };
  assert.equal(classify(dbWith([settle, other])).get('s'), 'non_definito'); // senza l'estratto della carta è una spesa come le altre
  const tags = classify(dbWith([settle, other, card]));
  assert.equal(tags.get('s'), 'giroconto'); // c'è l'estratto di dicembre 2024: gli acquisti sono già movimenti
  assert.equal(tags.get('o'), 'non_definito'); // di gennaio 2025 non c'è
  assert.equal(tags.get('c'), 'non_definito'); // l'acquisto con la carta è una spesa
});

test('budget: ritmo (spesa uniforme fino a oggi) e totali del mese', () => {
  const db = dbWith([
    { id: 'o', account: 'p1', date: '2026-10-02', amount: -10, description: 'Esselunga' },
  ], { names: { p1: '01 Spesa' } });
  db.settings = { budgets: { spesa: 310, svago: 62 } };
  const m = monthBudget(db, new Date('2026-10-14T10:00:00Z')); // 14 ottobre: 14 giorni su 31
  assert.equal(m.cats.spesa.pace, 140);
  assert.equal(m.cats.svago.pace, 28);
  assert.equal(m.cats.auto?.pace ?? m.cats.carburante.pace, null); // senza budget il ritmo non c'è
  assert.deepEqual(m.totals, { budget: 372, spent: 10, left: 362, pace: 168, avg3: 0, recurring: 0, income3: 0, totalSpend: 372, daysLeft: 17 });
});
