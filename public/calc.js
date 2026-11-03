// Calcoli della grafica: Storico dell'anno e cifre del Budget si ricavano dall'elenco dei movimenti (con il loro tag) che il server dà con
// GET /api/transactions, dai budget (GET /api/budgets) e dal totale dei ricorrenti (GET /api/recurring). Il server tiene i dati e i tag;
// qui si sommano soltanto. Funzioni pure, senza rete né pagina, così si provano anche con `npm test`.
const round = (n) => Math.round(n * 100) / 100;
export const BUDGET_TAGS = ['spesa', 'svago', 'carburante', 'altro']; // le quattro categorie con un budget
const SUB_PARENT = { auto_carburante: 'carburante', autostrada: 'carburante' };
export const parentTag = (k) => SUB_PARENT[k] ?? k;

/** Data e ora italiane di un istante: { year, month (1-12), day, iso, daysInMonth }. */
export function romeParts(now = new Date()) {
  const f = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map((p) => [p.type, p.value]));
  const year = Number(f.year), month = Number(f.month), day = Number(f.day);
  return { year, month, day, iso: `${f.year}-${f.month}-${f.day}`, daysInMonth: new Date(Date.UTC(year, month, 0)).getUTCDate() };
}

/** Entrate, uscite e bilancio di ogni mese dell'anno. I giroconti non contano; un'entrata «Non definito» non è ancora un'entrata (`undef`). */
export function yearSummary(txs, year) {
  const months = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, entrate: 0, uscite: 0, bilancio: 0, undef: 0, tags: {}, subs: {} }));
  for (const t of txs) {
    if (Number(t.date.slice(0, 4)) !== year || t.tag === 'giroconto') continue;
    const m = months[Number(t.date.slice(5, 7)) - 1];
    if (t.amount > 0) {
      if (t.tag === 'non_definito') m.undef += t.amount; else m.entrate += t.amount;
      continue;
    }
    m.uscite -= t.amount;
    const p = parentTag(t.tag);
    m.tags[p] = (m.tags[p] ?? 0) + -t.amount;
    if (p !== t.tag) m.subs[t.tag] = (m.subs[t.tag] ?? 0) + -t.amount;
  }
  const total = { entrate: 0, uscite: 0, bilancio: 0 };
  for (const m of months) {
    m.undef = round(m.undef); m.entrate = round(m.entrate); m.uscite = round(m.uscite); m.bilancio = round(m.entrate - m.uscite);
    for (const k of Object.keys(m.tags)) m.tags[k] = round(m.tags[k]);
    for (const k of Object.keys(m.subs)) m.subs[k] = round(m.subs[k]);
    total.entrate += m.entrate; total.uscite += m.uscite;
  }
  total.entrate = round(total.entrate); total.uscite = round(total.uscite); total.bilancio = round(total.entrate - total.uscite);
  const years = [...new Set(txs.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a);
  return { year, months, total, years };
}

/**
 * Il mese in corso: una voce per categoria con budget (`cats`) e i totali (`totals`). `budgets` sono i budget impostati, `recurring` il costo al mese dei
 * ricorrenti attivi (fuori dalle categorie), `labels` i nomi dei tag. `totalSpend` è la spesa reale del mese: la somma di tutte le sue uscite.
 */
export function monthBudget(txs, budgets, recurring, labels, now = new Date()) {
  const p = romeParts(now);
  const prefix = p.iso.slice(0, 7);
  const spent = Object.fromEntries(BUDGET_TAGS.map((k) => [k, 0]));
  let realSpend = 0;
  for (const t of txs) {
    if (t.amount >= 0 || !t.date.startsWith(prefix) || t.tag === 'giroconto') continue;
    realSpend += -t.amount;
    const tag = parentTag(t.tag);
    if (tag in spent) spent[tag] += -t.amount;
  }
  // i 3 mesi completi prima di questo, solo da quando ci sono dati (il mese del movimento più vecchio)
  const first = txs.reduce((a, t) => (t.date < a ? t.date : a), '9999-99-99').slice(0, 7);
  const past = [1, 2, 3].map((i) => new Date(Date.UTC(p.year, p.month - 1 - i, 1)).toISOString().slice(0, 7)).filter((m) => m >= first);
  const pastSpent = Object.fromEntries(BUDGET_TAGS.map((k) => [k, 0]));
  let pastIncome = 0;
  for (const t of txs) {
    if (!past.includes(t.date.slice(0, 7)) || t.tag === 'giroconto') continue;
    if (t.amount > 0) { if (t.tag !== 'non_definito') pastIncome += t.amount; continue; }
    const tag = parentTag(t.tag);
    if (tag in pastSpent) pastSpent[tag] += -t.amount;
  }
  const cats = {};
  for (const k of BUDGET_TAGS) {
    const budget = Number(budgets?.[k]) || 0;
    cats[k] = {
      label: labels?.[k] ?? k, budget, spent: round(spent[k]), left: round(budget - spent[k]),
      estDaily: budget > 0 ? round(budget / p.daysInMonth) : null, pace: budget > 0 ? round((budget * p.day) / p.daysInMonth) : null, realDaily: round(spent[k] / p.day),
      avg3: past.length ? round(pastSpent[k] / past.length) : null,
    };
  }
  const all = Object.values(cats);
  const sum = (f) => round(all.reduce((a, c) => a + (f(c) ?? 0), 0));
  const rec = Number(recurring) || 0;
  const totals = {
    budget: sum((c) => c.budget), spent: sum((c) => c.spent), left: sum((c) => c.left), pace: sum((c) => c.pace), daysLeft: p.daysInMonth - p.day + 1, // compreso oggi
    recurring: rec, avg3: all.some((c) => c.avg3 != null) ? round(sum((c) => c.avg3) + rec) : null, income3: past.length ? round(pastIncome / past.length) : null,
    totalSpend: round(realSpend),
  };
  return { year: p.year, month: p.month, day: p.day, daysInMonth: p.daysInMonth, cats, totals };
}

/** Il mese (1-12) in cui suona il promemoria di un ricorrente annuale: 3 giorni prima del prossimo pagamento (`next`, AAAA-MM-GG). */
export const reminderMonth = (next) => new Date(Date.parse(`${next}T12:00:00Z`) - 3 * 86400000).getUTCMonth() + 1;
