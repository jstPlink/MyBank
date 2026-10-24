// Cifre dell'app: storico dell'anno (entrate, uscite, bilancio per mese), budget del mese e dati del widget.
import { accountNames, classify, parentTag, BUDGET_TAGS, TAGS } from './tags.js';
import { cutoffOf } from './banks.js';
import { visibleTransactions } from './import.js';
import { localParts } from './schedule.js';
import { recurringGroups, recurringTotals } from './recurring.js';

const round = (n) => Math.round(n * 100) / 100;

/** Entrate, uscite e bilancio di ogni mese dell'anno. I giroconti non contano; le uscite sono cifre positive. */
export function yearSummary(db, year) {
  const tags = classify(db);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, entrate: 0, uscite: 0, bilancio: 0, tags: {}, subs: {} }));
  for (const t of visibleTransactions(db)) {
    if (Number(t.date.slice(0, 4)) !== year) continue;
    const tag = tags.get(t.id);
    if (tag === 'giroconto') continue;
    const m = months[Number(t.date.slice(5, 7)) - 1];
    if (t.amount > 0) m.entrate += t.amount;
    else {
      // una sotto categoria conta nella sua categoria (`tags`) e si vede a parte (`subs`)
      m.uscite -= t.amount;
      const p = parentTag(tag);
      m.tags[p] = (m.tags[p] ?? 0) + -t.amount;
      if (p !== tag) m.subs[tag] = (m.subs[tag] ?? 0) + -t.amount;
    }
  }
  const total = { entrate: 0, uscite: 0, bilancio: 0 };
  for (const m of months) {
    m.entrate = round(m.entrate); m.uscite = round(m.uscite); m.bilancio = round(m.entrate - m.uscite);
    for (const k of Object.keys(m.tags)) m.tags[k] = round(m.tags[k]);
    for (const k of Object.keys(m.subs)) m.subs[k] = round(m.subs[k]);
    total.entrate += m.entrate; total.uscite += m.uscite;
  }
  total.entrate = round(total.entrate); total.uscite = round(total.uscite); total.bilancio = round(total.entrate - total.uscite);
  const years = [...new Set(visibleTransactions(db).map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a);
  return { year, months, total, years };
}

/** I movimenti con il loro tag, dal più recente, con i filtri della scheda Movimenti. */
export const SORTS = { date: 'desc', amount: 'desc' }; // colonne per cui si può ordinare, con il verso di base

export function listTransactions(db, { year, month, tag, q, account, ids, sort = 'date', dir } = {}) {
  const tags = classify(db);
  const needle = String(q ?? '').trim().toLowerCase();
  const wanted = new Set(String(tag ?? '').split(',').map((k) => k.trim()).filter(Boolean)); // `tag` è un elenco separato da virgole; vuoto = tutti
  const names = accountNames(db);
  const out = [];
  for (const t of visibleTransactions(db)) {
    if (year && Number(t.date.slice(0, 4)) !== year) continue;
    if (month && Number(t.date.slice(5, 7)) !== month) continue;
    if (account && t.account !== account) continue;
    if (ids && !ids.has(t.id)) continue;
    const tg = tags.get(t.id);
    if (wanted.size && !wanted.has(tg) && !wanted.has(parentTag(tg))) continue; // il filtro su una categoria include le sue sotto categorie
    if (needle && !`${t.description} ${t.remittance ?? ''} ${db.renames[t.id] ?? ''} ${t.amount}`.toLowerCase().includes(needle)) continue;
    out.push({ ...t, tag: tg, manual: Boolean(db.overrides[t.id]), customName: db.renames[t.id] ?? '', accountName: names.get(t.account)?.name ?? t.accountLabel ?? '' });
  }
  // ordine: per data (di base, dal più recente) o per importo; a parità, dal più recente
  const col = SORTS[sort] ? sort : 'date';
  const mul = (dir === 'asc' || dir === 'desc' ? dir : SORTS[col]) === 'asc' ? 1 : -1;
  const key = { date: (t) => t.date, amount: (t) => t.amount }[col];
  const cmp = (x, y) => (typeof x === 'number' ? x - y : String(x).localeCompare(String(y)));
  out.sort((a, b) => cmp(key(a), key(b)) * mul || b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  return out;
}

/**
 * Il mese in corso: una voce per ogni categoria con budget (`cats`) e i totali del mese (`totals`). È la risposta di `GET /api/budgets` (campo `month`)
 * e di `GET /api/widget`.
 *
 * Per ogni categoria: `budget`, `spent` (speso nel mese), `left` (budget − speso), `estDaily` (budget ÷ giorni del mese), `realDaily` (speso ÷ giorni
 * passati, oggi compreso), `pace` (quanto avresti speso oggi spendendo in modo uniforme: budget × giorni passati ÷ giorni del mese) e `avg3` (spesa
 * media mensile degli ultimi 3 mesi completi, contando solo i mesi da quando ci sono dati; `null` se non ce n'è ancora nessuno).
 *
 * Nei `totals`: `budget`, `spent`, `left`, `pace`, `daysLeft`, più i dati del riquadro in cima al Budget:
 *   - `recurring`: i ricorrenti attivi al mese (mensili + annuali ÷ 12), che non sono una categoria con budget;
 *   - `avg3`: la spesa media dei 3 mesi, categorie **più** `recurring` (`null` senza mesi);
 *   - `income3`: le entrate medie dei 3 mesi completi precedenti, senza giroconti (`null` senza mesi);
 *   - `totalSpend`: la spesa totale prevista al mese, `recurring` + `budget`.
 */
export function monthBudget(db, now = new Date()) {
  const p = localParts(now);
  const tags = classify(db);
  const prefix = p.iso.slice(0, 7);
  const spent = Object.fromEntries(BUDGET_TAGS.map((k) => [k, 0]));
  for (const t of visibleTransactions(db)) {
    if (t.amount >= 0 || !t.date.startsWith(prefix)) continue;
    const tag = parentTag(tags.get(t.id));
    if (tag in spent) spent[tag] += -t.amount;
  }
  // i 3 mesi completi prima di questo, solo da quando ci sono dati
  const first = cutoffOf(db).slice(0, 7);
  const past = [1, 2, 3].map((i) => { const d = new Date(Date.UTC(p.year, p.month - 1 - i, 1)); return d.toISOString().slice(0, 7); }).filter((m) => m >= first);
  const pastSpent = Object.fromEntries(BUDGET_TAGS.map((k) => [k, 0]));
  let pastIncome = 0;
  for (const t of visibleTransactions(db)) {
    if (!past.includes(t.date.slice(0, 7))) continue;
    if (t.amount > 0) { if (tags.get(t.id) !== 'giroconto') pastIncome += t.amount; continue; }
    const tag = parentTag(tags.get(t.id));
    if (tag in pastSpent) pastSpent[tag] += -t.amount;
  }
  const cats = {};
  for (const k of BUDGET_TAGS) {
    const budget = Number(db.settings.budgets?.[k]) || 0;
    cats[k] = {
      label: TAGS[k], budget, spent: round(spent[k]), left: round(budget - spent[k]),
      estDaily: budget > 0 ? round(budget / p.daysInMonth) : null, pace: budget > 0 ? round((budget * p.day) / p.daysInMonth) : null, realDaily: round(spent[k] / p.day),
      avg3: past.length ? round(pastSpent[k] / past.length) : null,
    };
  }
  const all = Object.values(cats);
  const sum = (f) => round(all.reduce((a, c) => a + (f(c) ?? 0), 0));
  const recurring = recurringTotals(recurringGroups(db, now)).monthly; // i ricorrenti sono fuori dalle categorie: si sommano alla media
  const avgCats = all.some((c) => c.avg3 != null) ? sum((c) => c.avg3) : null;
  const totals = {
    budget: sum((c) => c.budget), spent: sum((c) => c.spent), left: sum((c) => c.left), pace: sum((c) => c.pace), daysLeft: p.daysInMonth - p.day,
    recurring, avg3: avgCats == null ? null : round(avgCats + recurring), income3: past.length ? round(pastIncome / past.length) : null,
  };
  totals.totalSpend = round(recurring + totals.budget); // spesa totale prevista al mese: ricorrenti + budget impostato
  return { year: p.year, month: p.month, day: p.day, daysInMonth: p.daysInMonth, cats, totals };
}
