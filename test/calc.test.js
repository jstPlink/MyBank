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
