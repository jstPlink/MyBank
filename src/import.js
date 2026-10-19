// Importazione di movimenti letti da un estratto conto (PDF) invece che dalla banca: servono per i mesi che la banca non rende più disponibili.
// I movimenti importati restano anche sotto la data di inizio, ma non si importano mai quelli da quella data in poi (li legge la banca: si
// duplicherebbero). Importare due volte lo stesso file non duplica nulla.
import crypto from 'node:crypto';
import { BANKS, cutoffOf } from './banks.js';

// Da dove vengono i movimenti importati: dalle banche (estratti conto) o dalle buste paga (il netto del mese, come entrata).
export const SOURCES = [...Object.keys(BANKS), 'busta'];

// I movimenti importati si leggono e si salvano tutti e di base si mostrano tutti. Se serve nasconderne alcuni mesi in ogni schermata, si imposta
// `settings.importedVisible` (elenco dei mesi «AAAA-MM» da mostrare); senza, o `null`, si mostra tutto.
export const IMPORTED_VISIBLE = null; // tutti i mesi
export const importedVisible = (db) => (Array.isArray(db.settings?.importedVisible) ? db.settings.importedVisible : IMPORTED_VISIBLE);
export const isVisible = (db, t) => { const v = importedVisible(db); return !t.imported || v === null || v.includes(t.date.slice(0, 7)); };
/** I movimenti che si mostrano: quelli della banca e gli importati dei mesi scelti. */
export const visibleTransactions = (db) => Object.values(db.transactions).filter((t) => isVisible(db, t));

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Porta i movimenti nei dati; restituisce { added, updated, skipped }. Lancia un errore in italiano se qualcosa non va. */
export function importTransactions(db, items) {
  if (!Array.isArray(items) || !items.length) throw new Error('Nessun movimento da importare.');
  if (items.length > 5000) throw new Error('Troppi movimenti in un colpo solo (al massimo 5000).');
  const from = cutoffOf(db);
  const result = { added: 0, updated: 0, skipped: 0 };
  const ready = [];
  items.forEach((x, i) => {
    const where = `Movimento ${i + 1}`;
    if (!SOURCES.includes(x?.bank)) throw new Error(`${where}: origine non prevista.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date ?? ''))) throw new Error(`${where}: data non valida.`);
    const amount = Math.round(Number(x.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount === 0) throw new Error(`${where}: importo non valido.`);
    const account = text(x.account, 80), key = text(x.key, 200);
    if (!account || !key) throw new Error(`${where}: mancano conto o identificativo.`);
    ready.push({ x, amount, account, key });
  });
  for (const { x, amount, account, key } of ready) {
    if (x.date >= from) { result.skipped++; continue; } // da questa data in poi i movimenti li legge la banca
    const id = crypto.createHash('sha1').update(`import|${x.bank}|${account}|${key}`).digest('hex').slice(0, 24);
    const t = { id, bank: x.bank, account, date: x.date, amount, description: text(x.description, 200) || 'Movimento bancario', currency: 'EUR', imported: true };
    const label = text(x.accountLabel, 60), party = text(x.party, 120), remittance = text(x.remittance, 300);
    if (label) t.accountLabel = label;
    if (party) t.party = party;
    if (remittance) t.remittance = remittance;
    if (db.transactions[id]) result.updated++; else { result.added++; (db.unsorted ??= {})[id] = true; }
    db.transactions[id] = t;
  }
  return result;
}
