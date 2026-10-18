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
  const names = accountNames(db);
  const out = [];
  for (const t of visibleTransactions(db)) {
    if (year && Number(t.date.slice(0, 4)) !== year) continue;
    if (month && Number(t.date.slice(5, 7)) !== month) continue;
    if (account && t.account !== account) continue;
    if (ids && !ids.has(t.id)) continue;
    const tg = tags.get(t.id);
    if (tag && tg !== tag && parentTag(tg) !== tag) continue; // il filtro su una categoria include le sue sotto categorie
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
 * Il mese in corso per le tre categorie con budget: speso, residuo (budget − speso), spesa giornaliera stimata (budget diviso i giorni
 * del mese) e reale (speso diviso i giorni passati, oggi compreso), più la spesa media mensile degli ultimi 3 mesi completi (`avg3`: conta solo
 * i mesi da quando ci sono dati; `null` se non ce n'è ancora nessuno), il `pace` (quanto avresti speso oggi spendendo in modo uniforme:
 * budget × giorni passati / giorni del mese) e i `totals` del mese (budget, speso, residuo, pace, media dei 3 mesi e giorni rimanenti).
 * Nei `totals` anche: `recurring` (i ricorrenti attivi al mese: mensili + annuali ÷ 12), `avg3` (la media dei 3 mesi **comprende** i ricorrenti; senza
 * è `avg3Cats`), `income3` (entrate medie dei 3 mesi completi precedenti, senza giroconti; `null` senza mesi) e `saving` (entrate medie − ricorrenti −
 * budget impostato: quanto si potrebbe risparmiare al mese; negativo se il budget non rientra).
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
  const avg3Cats = all.some((c) => c.avg3 != null) ? sum((c) => c.avg3) : null;
  const income3 = past.length ? round(pastIncome / past.length) : null;
  const budgetTot = sum((c) => c.budget);
  const totals = {
    budget: budgetTot, spent: sum((c) => c.spent), left: sum((c) => c.left), pace: sum((c) => c.pace),
    avg3: avg3Cats == null ? null : round(avg3Cats + recurring), avg3Cats, recurring, income3,
    saving: income3 == null ? null : round(income3 - recurring - budgetTot), daysLeft: p.daysInMonth - p.day,
  };
  return { year: p.year, month: p.month, day: p.day, daysInMonth: p.daysInMonth, cats, totals };
}

/** Dati per il widget: il mese (con le domeniche), l'ultimo aggiornamento della banca e le tre categorie. */
export function widgetData(db, now = new Date()) {
  const b = monthBudget(db, now);
  const sundays = [];
  for (let d = 1; d <= b.daysInMonth; d++) if (new Date(Date.UTC(b.year, b.month - 1, d)).getUTCDay() === 0) sundays.push(d);
  const lastSync = db.banking.connections.map((c) => c.lastSync).filter(Boolean).sort().at(-1) ?? null;
  return { ...b, daysLeft: b.daysInMonth - b.day, sundays, lastSync, now: now.toISOString() };
}

/**
 * Statistiche di un anno (e, se si sceglie, di un mese): le uscite per categoria con la loro quota, le entrate e da chi arrivano, mese per
 * mese entrate e uscite (sempre tutto l'anno, per il grafico), dove vanno i soldi e il bilancio. I giroconti non contano.
 */
export function spendStats(db, { year, month = 0 } = {}) {
  const tags = classify(db);
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, total: 0, entrate: 0, tags: {} }));
  const byTag = new Map();
  const parties = new Map();
  const sources = new Map();
  let total = 0;
  let count = 0;
  let income = 0;
  let incomeCount = 0;
  const years = new Set();
  for (const t of visibleTransactions(db)) {
    const tag = tags.get(t.id);
    if (tag === 'giroconto') continue;
    const y = Number(t.date.slice(0, 4));
    years.add(y);
    if (year && y !== year) continue;
    const m = Number(t.date.slice(5, 7));
    if (t.amount > 0) { // le entrate: da chi arrivano
      months[m - 1].entrate += t.amount;
      if (month && m !== month) continue;
      income += t.amount;
      incomeCount++;
      const from = (t.party || t.description || 'Senza nome').trim();
      const s = sources.get(from.toLowerCase()) ?? { name: from, total: 0, count: 0 };
      s.total += t.amount; s.count++;
      sources.set(from.toLowerCase(), s);
      continue;
    }
    if (t.amount === 0) continue;
    const v = -t.amount;
    months[m - 1].total += v;
    months[m - 1].tags[tag] = (months[m - 1].tags[tag] ?? 0) + v;
    if (month && m !== month) continue;
    total += v;
    count++;
    const e = byTag.get(tag) ?? { tag, label: TAGS[tag], total: 0, count: 0 };
    e.total += v; e.count++;
    byTag.set(tag, e);
    const name = (t.party || t.description || 'Senza nome').trim();
    const key = name.toLowerCase();
    const p = parties.get(key) ?? { name, total: 0, count: 0 };
    p.total += v; p.count++;
    parties.set(key, p);
  }
  const rank = (a, b) => b.total - a.total;
  return {
    year, month,
    total: round(total), count, average: count ? round(total / count) : 0,
    income: {
      total: round(income), count: incomeCount,
      top: [...sources.values()].sort(rank).slice(0, 8).map((p) => ({ ...p, total: round(p.total), share: income ? Math.round((p.total / income) * 1000) / 10 : 0 })),
    },
    balance: round(income - total),
    byTag: [...byTag.values()].sort(rank).map((e) => ({ ...e, total: round(e.total), share: total ? Math.round((e.total / total) * 1000) / 10 : 0 })),
    months: months.map((m) => ({ month: m.month, total: round(m.total), entrate: round(m.entrate), tags: Object.fromEntries(Object.entries(m.tags).map(([k, v]) => [k, round(v)])) })),
    top: [...parties.values()].sort(rank).slice(0, 8).map((p) => ({ ...p, total: round(p.total), share: total ? Math.round((p.total / total) * 1000) / 10 : 0 })),
    years: [...years].sort((a, b) => b - a),
  };
}
