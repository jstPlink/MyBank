import test from 'node:test';
import assert from 'node:assert/strict';
import { yearSummary, monthBudget, reminderMonth } from '../public/calc.js';

const tx = (date, amount, tag) => ({ date, amount, tag });

test('calc: lo Storico somma i movimenti con tag; entrate «Non definito» e giroconti non contano', () => {
  const s = yearSummary([tx('2026-03-01', 1000, 'entrata'), tx('2026-03-02', 500, 'non_definito'), tx('2026-03-03', -40, 'spesa'), tx('2026-03-04', -10, 'autostrada'), tx('2026-03-05', -99, 'giroconto'), tx('2025-01-01', 5, 'entrata')], 2026);
  const mar = s.months[2];
  assert.deepEqual([mar.entrate, mar.uscite, mar.bilancio, mar.undef], [1000, 50, 950, 500]);
  assert.deepEqual([mar.tags.spesa, mar.tags.carburante, mar.subs.autostrada], [40, 10, 10]);
  assert.deepEqual(s.years, [2026, 2025]);
});

test('calc: spesa totale del Budget = uscite reali del mese corrente', () => {
  const now = new Date('2026-06-15T10:00:00Z');
  const txs = [tx('2026-06-02', -30, 'spesa'), tx('2026-06-03', -20, 'utenze'), tx('2026-06-04', -5, 'non_definito'), tx('2026-06-05', -70, 'giroconto'), tx('2026-05-10', -100, 'svago'), tx('2026-05-11', 400, 'entrata'), tx('2026-05-12', 90, 'non_definito')];
  const m = monthBudget(txs, { spesa: 300, svago: 100, carburante: 0, altro: 0 }, 25, { spesa: 'Spesa' }, now);
  assert.equal(m.totals.totalSpend, 55);
  assert.equal(m.totals.daysLeft, 16); // il 15 di un mese di 30 giorni, oggi compreso
  assert.equal(m.totals.spent, 30);
  assert.equal(m.totals.budget, 400);
  assert.equal(m.totals.recurring, 25);
  assert.equal(m.totals.income3, 400); // il «Non definito» non è entrata
  assert.equal(m.cats.spesa.label, 'Spesa');
});

test('calc: il promemoria annuale suona il mese 3 giorni prima del pagamento', () => {
  assert.equal(reminderMonth('2026-09-20'), 9);
  assert.equal(reminderMonth('2027-01-02'), 12);
});

test('calc: Da pagare, arretrati prima e poi il mese in corso; le spese scritte a mano cadono nel loro mese', async () => {
  const { payables, dueGroups, monthsBetween } = await import('../public/calc.js');
  assert.deepEqual(monthsBetween('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  const bills = { from: '2026-10', items: [
    { path: 'Gas 2026.10.pdf', type: 'Gas', from: '2026-10', to: '2026-10', due: '2026-11', amount: 61.05, paid: false, url: 'u' },
    { path: 'Gas 2026.09.pdf', type: 'Gas', from: '2026-09', to: '2026-09', due: '2026-10', amount: 48.1, paid: false, url: 'u' },
    { path: 'Gas 2026.08.pdf', type: 'Gas', from: '2026-08', to: '2026-08', due: '2026-09', amount: 40, paid: true, url: 'u' }, // archivio
    { path: 'Gas 2026.11.pdf', type: 'Gas', from: '2026-11', to: '2026-11', due: '2026-12', amount: 70, paid: false, url: 'u' }, // scade il mese prossimo
  ] };
  const extras = { from: '2026-10', extras: [
    { id: 'a', name: 'Affitto', amount: 650, every: 'month', from: '2026-10' },
    { id: 't', name: 'Tari', amount: 112, every: 'year', month: 11, from: '2026-10' },
  ], paid: { 'a:2026-10': { paid: true }, 'a:2026-11': { amount: 700 } } };
  const d = dueGroups(payables(bills, extras, '2026-11'), '2026-11');
  assert.deepEqual(d.groups.map((g) => [g.month, g.late, g.items.map((i) => i.title)]), [['2026-10', true, ['Gas']], ['2026-11', false, ['Affitto', 'Tari', 'Gas']]]);
  assert.equal(d.count, 4);
  assert.equal(d.total, 48.1 + 700 + 112 + 61.05); // l'importo del mese scritto a mano vince su quello della voce
});
