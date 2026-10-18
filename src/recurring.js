// Pagamenti ricorrenti (abbonamenti, assicurazioni…): il server li raggruppa dai movimenti e li mostra dal più vicino al più lontano.
// Un ricorrente esiste solo se lo crei tu (nome, importo, cadenza, prossimo pagamento): il server non ne riconosce nessuno da solo.
// Un movimento con il tag «Ricorrente» (scelto a mano) è «da assegnare» finché non lo assegni a un ricorrente (`db.recurringLinks`: id del
// movimento → chiave del ricorrente) o non crei un ricorrente da lui. Un movimento assegnato conta nello storico del ricorrente (ultimo
// pagamento, prossimo, importo). «Attivo» è automatico (l'ultimo pagamento è recente) ma si può forzare a mano. Il promemoria è una notifica
// del server legata al ricorrente (`recurringKey`).
import { accountNames, classify } from './tags.js';
import { visibleTransactions } from './import.js';
import { localParts } from './schedule.js';

const round = (n) => Math.round(n * 100) / 100;
const DAY = 86400000;
const toMs = (iso) => Date.parse(`${iso}T12:00:00Z`);
const toIso = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (iso, n) => toIso(toMs(iso) + n * DAY);
const eur = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n).replace(/\u00a0/g, ' ');

/** La chiave stabile di un gruppo: il nome del beneficiario ridotto a lettere e numeri. */
export function recurringKey(name) {
  return String(name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'movimento';
}

/** Aggiunge `n` mesi a una data AAAA-MM-GG tenendo il giorno (nei mesi corti l'ultimo giorno). */
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return toIso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last)));
}

/** La prima scadenza da oggi in poi, partendo dall'ultima (o dalla data scelta) e andando avanti di un mese o di un anno. */
function nextDue(from, annual, today) {
  let n = 0, d = from;
  while (d < today && n < 600) { n += annual ? 12 : 1; d = addMonths(from, n); }
  return d;
}

/** L'analisi completa: i ricorrenti (attivi dal prossimo pagamento, poi i non attivi), a chi appartiene ogni movimento e quelli «da assegnare». */
function analyze(db, now = new Date()) {
  const today = localParts(now).iso;
  const tags = classify(db);
  const names = accountNames(db);
  const links = db.recurringLinks ?? {};
  const state = db.recurringState ?? {};
  const byKey = new Map();
  const info = new Map(); // id → dati del movimento (uscite, giroconti esclusi)
  for (const t of visibleTransactions(db)) {
    if (t.amount >= 0 || tags.get(t.id) === 'giroconto') continue;
    const title = (db.renames ?? {})[t.id] || t.party || t.description;
    const slug = recurringKey(t.party || t.description);
    const p = { id: t.id, date: t.date, amount: round(-t.amount), tag: tags.get(t.id), title, slug, explicit: Boolean(links[t.id]), account: names.get(t.account)?.name ?? t.accountLabel ?? '' };
    info.set(t.id, p);
    const key = links[t.id] ?? slug;
    if (!byKey.has(key)) byKey.set(key, { key, name: '', list: [] });
    const g = byKey.get(key);
    if (!g.name && p.slug === key) g.name = title;
    g.list.push(p);
  }
  const reminderOf = (key) => { const n = (db.notifications ?? []).find((x) => x.recurringKey === key); return n ? { id: n.id, text: n.text, day: n.day, ...(n.month ? { month: n.month } : {}), time: n.time } : null; };
  const groups = [];
  const make = (g, base) => {
    g.list.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const annual = base.annual;
    const latest = g.list.at(-1);
    const last = latest ? latest.date : null;
    // l'importo non si scrive: è la media dei movimenti assegnati (finché non ce ne sono resta quello di partenza, di norma 0)
    const amount = g.list.length ? round(g.list.reduce((t, p) => t + p.amount, 0) / g.list.length) : base.amount;
    const due = nextDue(last ? addMonths(last, annual ? 12 : 1) : base.next, annual, today);
    const recent = last ? (toMs(today) - toMs(last)) / DAY <= (annual ? 400 : 45) : true;
    const active = typeof state[g.key]?.active === 'boolean' ? state[g.key].active : recent;
    groups.push({
      key: g.key, name: base.name, amount, annual, monthly: round(annual ? amount / 12 : amount), next: due, last, count: g.list.length, active, manual: base.manual, average: g.list.length > 0, reminder: reminderOf(g.key),
      payments: g.list.slice(-12).reverse().map((p) => ({ id: p.id, date: p.date, amount: p.amount, title: p.title, account: p.account, explicit: p.explicit })),
      _ids: g.list.map((p) => p.id),
    });
  };
  for (const m of db.recurringManual ?? []) make(byKey.get(`m-${m.id}`) ?? { key: `m-${m.id}`, list: [] }, { name: m.name, annual: m.annual, amount: m.amount, next: m.next, manual: true });
  const act = groups.filter((g) => g.active).sort((a, b) => a.next.localeCompare(b.next) || a.name.localeCompare(b.name));
  const off = groups.filter((g) => !g.active).sort((a, b) => (b.last ?? '').localeCompare(a.last ?? '') || a.name.localeCompare(b.name));
  const sorted = [...act, ...off];
  const owner = new Map();
  for (const g of sorted) for (const id of g._ids) owner.set(id, g.key);
  const unassigned = [...info.values()].filter((p) => p.tag === 'ricorrente' && !owner.has(p.id)).sort((a, b) => b.date.localeCompare(a.date));
  return { groups: sorted.map(({ _ids, ...g }) => g), owner, unassigned, info };
}

/** Tutti i gruppi. */
export const recurringGroups = (db, now) => analyze(db, now).groups;

/** Il totale al mese degli attivi, diviso in costo fisso (i mensili) e somma da mettere da parte (gli annuali per un dodicesimo), e quanti sono. */
export function recurringTotals(groups) {
  const act = groups.filter((g) => g.active);
  const sum = (list) => round(list.reduce((a, g) => a + g.monthly, 0));
  return { monthly: sum(act), fixed: sum(act.filter((g) => !g.annual)), reserve: sum(act.filter((g) => g.annual)), active: act.length, annual: act.filter((g) => g.annual).length, inactive: groups.length - act.length };
}

const norm = (s) => recurringKey(s).replace(/-/g, '');
/** I gruppi più adatti a un movimento: stesso nome del beneficiario (o uno contenuto nell'altro) prima, poi lo stesso importo (±2%). */
function suggestFor(p, groups) {
  const out = [];
  for (const g of groups) {
    const a = norm(p.title), b = norm(g.name);
    const name = p.slug === g.key || (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a)));
    const amount = g.amount > 0 && Math.abs(g.amount - p.amount) <= g.amount * 0.02;
    if (name) out.push({ key: g.key, why: 'nome', rank: 0 });
    else if (amount) out.push({ key: g.key, why: 'importo', rank: 1 });
  }
  return out.sort((x, y) => x.rank - y.rank).slice(0, 3).map(({ key, why }) => ({ key, why }));
}

/**
 * Quello che la scheda Ricorrenti mostra: gruppi, totali e i movimenti «da assegnare» (ognuno con i gruppi suggeriti). Con `tx` anche i
 * suggerimenti per quel movimento (per il foglio di assegnazione).
 */
export function recurringOverview(db, now = new Date(), tx = '') {
  const { groups, unassigned, info } = analyze(db, now);
  const out = {
    groups, totals: recurringTotals(groups),
    unassigned: unassigned.map((p) => ({ id: p.id, date: p.date, amount: p.amount, title: p.title, account: p.account, suggest: suggestFor(p, groups) })),
  };
  if (tx && info.has(tx)) out.suggest = suggestFor(info.get(tx), groups);
  return out;
}

/** Per ogni movimento con il tag «Ricorrente»: il gruppo a cui appartiene ({ key, name }) o `null` se è da assegnare. */
export function ricorrenteStatus(db, now = new Date()) {
  const { groups, owner, info } = analyze(db, now);
  const byKey = new Map(groups.map((g) => [g.key, g.name]));
  const out = new Map();
  for (const p of info.values()) if (p.tag === 'ricorrente') out.set(p.id, owner.has(p.id) ? { key: owner.get(p.id), name: byKey.get(owner.get(p.id)) } : null);
  return out;
}

/** I movimenti di un gruppo (id), per filtrare la scheda Movimenti. */
export function groupTransactionIds(db, key) {
  const { owner } = analyze(db);
  return new Set([...owner].filter(([, k]) => k === key).map(([id]) => id));
}

/** La prossima scadenza da oggi in poi dato il giorno del pagamento (mensile) o giorno e mese (annuale, `month` 1-12). */
export function dueFromDay(day, month, annual, today) {
  const [y, m] = today.split('-').map(Number);
  const at = (yy, mm) => { const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); return toIso(Date.UTC(yy, mm - 1, Math.min(day, last))); };
  if (annual) { const d = at(y, month); return d >= today ? d : at(y + 1, month); }
  const d = at(y, m);
  return d >= today ? d : (m === 12 ? at(y + 1, 1) : at(y, m + 1));
}

/** Il promemoria di base di un ricorrente: «Pagamento imminente: <nome> di <importo>», 3 giorni prima del prossimo pagamento alle 9:00 (gli annuali anche col mese). */
export function defaultReminder(g) {
  const d = addDays(g.next, -3);
  return { text: g.amount > 0 ? `Pagamento imminente: ${g.name} di ${eur(g.amount)}` : `Pagamento imminente: ${g.name}`, day: Number(d.slice(8)), ...(g.annual ? { month: Number(d.slice(5, 7)) } : {}), time: '09:00' };
}
