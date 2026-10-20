// Banche collegate (UniCredit, Revolut) tramite Enable Banking: collegamento, lettura dei movimenti, limiti giornalieri.
import crypto from 'node:crypto';
import { accountNames, TAGS } from './tags.js';

export const BANKS = {
  unicredit: { label: 'UniCredit', match: /unicredit/i, countries: ['IT'] },
  revolut: { label: 'Revolut', match: /revolut/i, countries: ['IT', 'LT'] },
};

const DAY = 86400000;

// Si memorizzano solo i movimenti dal 1 agosto 2026 (per ora): quelli prima non si leggono, non si salvano e non si mostrano.
// La data si può cambiare con `settings.cutoff` (AAAA-MM-GG).
export const MOVEMENTS_FROM = '2026-08-01';
export const cutoffOf = (db) => (/^\d{4}-\d{2}-\d{2}$/.test(db.settings?.cutoff ?? '') ? db.settings.cutoff : MOVEMENTS_FROM);

/** Toglie dai dati i movimenti precedenti alla data di inizio (e le scelte a mano che li riguardavano). Restituisce quanti ne ha tolti. */
export function applyCutoff(db) {
  const from = cutoffOf(db);
  let removed = 0;
  for (const [id, t] of Object.entries(db.transactions)) if (t.date < from && !t.imported) { delete db.transactions[id]; removed++; } // gli importati da estratto conto restano
  for (const id of Object.keys(db.overrides)) if (!db.transactions[id]) delete db.overrides[id];
  for (const id of Object.keys(db.unsorted ?? {})) if (!db.transactions[id]) delete db.unsorted[id];
  for (const id of Object.keys(db.renames ?? {})) if (!db.transactions[id]) delete db.renames[id];
  return removed;
}
export const CONSENT_DAYS = 180;       // durata del consenso richiesto (la banca può ridurla)
export const AUTO_PER_DAY = 4;         // accessi automatici al giorno concessi dalle banche (PSD2: senza l'utente presente)
export const MANUAL_PER_DAY = 10;      // letture a mano: l'utente è presente e la richiesta lo dichiara con le intestazioni PSU
const FALLBACK_SYNC_DAYS = 90;
const OVERLAP_DAYS = 7;                // ogni lettura riparte qualche giorno prima, per non perdere i movimenti registrati in ritardo
const PENDING_MS = 60 * 60 * 1000;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const maskIban = (iban) => (iban ? `${iban.slice(0, 4)}…${iban.slice(-4)}` : '');

// ------------------------------------------------------------------ collegamento

async function findAspsp(client, bankKey) {
  const bank = BANKS[bankKey];
  if (!bank) throw new Error('Banca non prevista.');
  const res = await client.aspsps({ psu_type: 'personal', service: 'AIS' });
  const list = (Array.isArray(res) ? res : res.aspsps ?? []).filter((a) => bank.match.test(a.name));
  if (!list.length) throw new Error(`${bank.label} non risulta tra le banche collegabili con Enable Banking.`);
  const rank = (a) => { const i = bank.countries.indexOf(a.country); return i < 0 ? 99 : i; };
  return [...list].sort((a, b) => rank(a) - rank(b))[0];
}

/** Avvia il collegamento: restituisce l'indirizzo della banca dove autorizzare l'accesso in sola lettura. */
export async function startLink({ client, db, bank, redirectUrl, now = Date.now() }) {
  const aspsp = await findAspsp(client, bank);
  const maxDays = aspsp.maximum_consent_validity ? Math.floor(aspsp.maximum_consent_validity / 86400) : CONSENT_DAYS;
  const validUntil = new Date(now + Math.min(CONSENT_DAYS, Math.max(1, maxDays)) * DAY - 60000).toISOString();
  const state = crypto.randomUUID();
  const res = await client.auth({
    access: { valid_until: validUntil, balances: true, transactions: true },
    aspsp: { name: aspsp.name, country: aspsp.country },
    state, redirect_url: redirectUrl, psu_type: 'personal', language: 'it',
  });
  const pending = db.banking.pending;
  for (const [k, p] of Object.entries(pending)) if (now - p.createdAt > PENDING_MS) delete pending[k];
  pending[state] = { bank, aspsp: { name: aspsp.name, country: aspsp.country }, validUntil, createdAt: now };
  return res.url;
}

/**
 * Ogni nuovo consenso porta da Enable Banking identificativi di conto nuovi, ma i movimenti (e le scelte a mano) si riconoscono dall'`uid` del conto:
 * se cambiasse, tutto verrebbe riletto come nuovo e da assegnare daccapo. Per questo `uid` resta quello della prima volta e `apiUid` è quello
 * di adesso (l'unico che si manda alla banca). Un conto nuovo si riconosce come il vecchio dall'IBAN o, senza IBAN (i pocket), da nome, tipo e valuta,
 * purché ce ne sia uno solo; se ce ne sono più d'uno uguali si abbinano in ordine solo quando il numero coincide.
 */
export function keepAccountIds(oldAccounts, fresh) {
  const sig = (a) => (a.iban ? `iban|${a.iban}` : `n|${a.name}|${a.type}|${a.currency}`);
  const groups = (list) => { const m = new Map(); for (const a of list) (m.get(sig(a)) ?? m.set(sig(a), []).get(sig(a))).push(a); return m; };
  const olds = groups(oldAccounts);
  const used = new Map();
  return fresh.map((a) => {
    const group = olds.get(sig(a));
    const sameNew = fresh.filter((b) => sig(b) === sig(a));
    const i = used.get(sig(a)) ?? 0;
    used.set(sig(a), i + 1);
    const old = group && group.length === sameNew.length ? group[i] : null;
    return { ...a, uid: old ? old.uid : a.uid, apiUid: a.uid };
  });
}

/** Al ritorno dalla banca: il codice si scambia con la sessione e si salvano i conti collegati. */
export async function finishLink({ client, db, code, state, now = Date.now() }) {
  const pending = db.banking.pending[state];
  if (!pending || now - pending.createdAt > PENDING_MS) throw new Error('Richiesta di collegamento scaduta o sconosciuta: riparti dalla scheda Banche.');
  const session = await client.createSession(code);
  delete db.banking.pending[state];
  const oldAccounts = db.banking.connections.filter((c) => c.bank === pending.bank).flatMap((c) => c.accounts);
  const conn = {
    id: session.session_id, bank: pending.bank, aspsp: session.aspsp ?? pending.aspsp,
    accounts: keepAccountIds(oldAccounts, (session.accounts ?? []).map((a) => ({ uid: a.uid, iban: a.account_id?.iban ?? '', name: a.name ?? '', currency: a.currency ?? 'EUR', type: a.cash_account_type ?? '' }))),
    validUntil: session.access?.valid_until ?? pending.validUntil, createdAt: new Date(now).toISOString(), lastSync: null, calls: [],
  };
  if (!conn.accounts.length) throw new Error('La banca non ha reso disponibile nessun conto.');
  const prev = db.banking.connections.find((c) => c.bank === pending.bank);
  if (prev && conn.accounts.every((a) => prev.accounts.some((p) => p.uid === a.uid))) { conn.lastSync = prev.lastSync ?? null; conn.from = prev.from; } // stessi conti: si riparte dall'ultima lettura invece di rileggere tutto
  db.banking.connections = [...db.banking.connections.filter((c) => c.bank !== pending.bank), conn]; // un nuovo consenso sostituisce il vecchio
  return conn;
}

// ------------------------------------------------------------------ movimenti

const day = (v) => { const d = String(v ?? '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : ''; };

/** Un movimento dell'aggregatore diventa un movimento dell'app. Negativo = uscita. */
export function mapTransaction(tx, conn, account, { seen = new Map(), pending = false, today = '' } = {}) {
  const raw = Number(tx.transaction_amount?.amount);
  if (!Number.isFinite(raw)) return null;
  const amount = Math.abs(raw);
  // senza indicatore entrata/uscita (alcune banche) si guarda il segno dell'importo
  const credit = tx.credit_debit_indicator ? tx.credit_debit_indicator === 'CRDT' : raw > 0;
  // la data è la prima valida fra registrazione, valuta e operazione; un pagamento in sospeso senza data conta dal giorno in cui lo si legge
  let date = day(tx.booking_date) || day(tx.value_date) || day(tx.transaction_date);
  if (!date && pending) date = day(today);
  if (!date) return null;
  const signed = Math.round((credit ? amount : -amount) * 100) / 100;
  const party = String((credit ? tx.debtor?.name : tx.creditor?.name) ?? '').trim();
  const remittance = (Array.isArray(tx.remittance_information) ? tx.remittance_information : [tx.remittance_information ?? '']).join(' ').replace(/\s+/g, ' ').trim();
  const description = party || remittance.slice(0, 120) || 'Movimento bancario';
  const counterIban = (credit ? tx.debtor_account?.iban : tx.creditor_account?.iban) ?? '';
  let key = tx.transaction_id ?? tx.entry_reference ?? tx.reference_number;
  if (key == null) {
    // senza identificativo della banca, due pagamenti identici nello stesso giorno non devono diventare uno solo
    const base = `${date}|${signed}|${description}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    key = n === 1 ? base : `${base}|${n}`;
  }
  // un movimento in sospeso non ha mai l'identificativo di quello registrato: quando la banca lo registra, il suo posto lo prende il registrato
  if (pending) key = `PDNG|${key}`;
  const id = crypto.createHash('sha1').update(`${conn.bank}|${account.uid}|${key}`).digest('hex').slice(0, 24);
  const t = { id, bank: conn.bank, account: account.uid, date, amount: signed, description, currency: tx.transaction_amount?.currency ?? 'EUR' };
  if (party) t.party = party;
  if (remittance && remittance !== description) t.remittance = remittance.slice(0, 300);
  if (counterIban) t.counterIban = counterIban;
  if (pending) t.pending = true;
  return t;
}

async function fetchAccount(client, uid, dateFrom, status = 'BOOK') {
  const out = [];
  let key;
  for (let page = 0; page < 30; page++) {
    const res = await client.transactions(uid, { date_from: dateFrom, transaction_status: status, continuation_key: key });
    out.push(...(res.transactions ?? []));
    key = res.continuation_key;
    if (!key) break;
  }
  return out;
}

const callsOf = (conn, now) => (conn.calls = (conn.calls ?? []).filter((c) => c.t > now - DAY));

/** Quanti accessi restano oggi per una banca: { auto, manual }. */
export function quota(conn, now = Date.now()) {
  const calls = callsOf(conn, now);
  return { auto: Math.max(0, AUTO_PER_DAY - calls.filter((c) => c.auto).length), manual: Math.max(0, MANUAL_PER_DAY - calls.filter((c) => !c.auto).length) };
}

/**
 * Legge dalla banca i movimenti (registrati e in sospeso) di tutti i conti e li porta nei dati dell'app.
 * I registrati nuovi si aggiungono; i «in sospeso» di prima si tolgono e si rimettono quelli di adesso: i pagamenti rifiutati spariscono da soli.
 */
export async function syncConnection({ client, db, conn, auto = false, now = Date.now() }) {
  const label = BANKS[conn.bank]?.label ?? conn.bank;
  if (Date.parse(conn.validUntil) <= now) throw new Error(`Il collegamento con ${label} è scaduto: ricollega la banca dalla scheda Banche.`);
  const left = quota(conn, now);
  if (auto ? left.auto <= 0 : left.manual <= 0) throw new Error(`${label}: raggiunto il limite di ${auto ? AUTO_PER_DAY : MANUAL_PER_DAY} letture al giorno. Riprova più tardi.`);
  conn.calls.push({ t: now, auto });

  const from = cutoffOf(db);
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  // si parte dalla data di inizio (o da qualche giorno prima dell'ultima lettura); se la data di inizio è stata anticipata dopo l'ultima
  // lettura completa (conn.from), si rilegge tutto dalla nuova data
  const backfill = !conn.from || conn.from > from;
  const since = conn.lastSync && !backfill ? Math.max(fromMs, Date.parse(conn.lastSync) - OVERLAP_DAYS * DAY) : fromMs;
  const report = { found: 0, added: 0, pending: 0 };
  const seen = new Map();
  for (const account of conn.accounts) {
    let booked;
    try { booked = await fetchAccount(client, account.apiUid ?? account.uid, isoDay(since)); }
    catch (e) {
      if (conn.lastSync && !backfill) throw e;
      booked = await fetchAccount(client, account.apiUid ?? account.uid, isoDay(Math.max(fromMs, now - FALLBACK_SYNC_DAYS * DAY))); // la banca non concede uno storico così lungo
    }
    let pendingList = null;
    try { pendingList = await fetchAccount(client, account.apiUid ?? account.uid, isoDay(now - FALLBACK_SYNC_DAYS * DAY), 'PDNG'); } catch { /* sospesi non disponibili: si tengono quelli di prima */ }

    for (const tx of booked) {
      const t = mapTransaction(tx, conn, account, { seen });
      if (!t || t.date < from) continue;
      report.found++;
      if (!db.transactions[t.id]) { report.added++; (db.unsorted ??= {})[t.id] = true; } // nuovo: lo smisti tu
      db.transactions[t.id] = t;
    }
    if (pendingList) {
      const hadPending = new Set(); // i sospesi si rileggono a ogni giro: solo quelli mai visti prima sono da smistare
      for (const [id, t] of Object.entries(db.transactions)) if (t.pending && t.account === account.uid) { hadPending.add(id); delete db.transactions[id]; }
      const pseen = new Map();
      for (const tx of pendingList) {
        const t = mapTransaction(tx, conn, account, { seen: pseen, pending: true, today: isoDay(now) });
        if (!t || t.date < from) continue;
        if (!db.transactions[t.id] && !hadPending.has(t.id)) (db.unsorted ??= {})[t.id] = true;
        db.transactions[t.id] = t;
        report.pending++;
      }
    }
  }
  applyCutoff(db);
  conn.lastSync = new Date(now).toISOString();
  conn.from = from;
  return report;
}

// ------------------------------------------------------------------ stato per l'interfaccia

/** Quello che si mostra nell'interfaccia: mai la chiave privata. */
export function publicState(db, now = Date.now()) {
  const b = db.banking;
  const names = accountNames(db);
  const counts = new Map();
  for (const t of Object.values(db.transactions)) counts.set(t.account, (counts.get(t.account) ?? 0) + 1);
  const lastSync = b.connections.map((c) => c.lastSync).filter(Boolean).sort().at(-1) ?? null;
  return {
    configured: Boolean(b.app?.appId && b.app?.privateKey),
    appId: b.app?.appId ?? '',
    hasKey: Boolean(b.app?.privateKey),
    banks: Object.entries(BANKS).map(([key, v]) => ({ key, label: v.label })),
    lastSync, lastAuto: b.lastAuto, since: cutoffOf(db),
    connections: b.connections.map((c) => {
      const until = Date.parse(c.validUntil);
      return {
        id: c.id, bank: c.bank, label: BANKS[c.bank]?.label ?? c.bank,
        accounts: c.accounts.map((a) => {
          const n = names.get(a.uid);
          return { uid: a.uid, name: n.name, nameSource: n.source, iban: maskIban(a.iban), main: n.main, movements: counts.get(a.uid) ?? 0 };
        }),
        validUntil: c.validUntil, daysLeft: Number.isFinite(until) ? Math.floor((until - now) / DAY) : null,
        expired: Number.isFinite(until) && until <= now, lastSync: c.lastSync, left: quota(c, now),
        limits: { auto: AUTO_PER_DAY, manual: MANUAL_PER_DAY },
      };
    }),
    tags: TAGS,
  };
}
