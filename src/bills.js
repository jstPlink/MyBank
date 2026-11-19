// Bollette: i file della cartella «Bollette» (Seafile) sono chiamati «Tipo AAAA.MM.pdf» (o «Tipo AAAA.MM - AAAA.MM.pdf» se bimestrali): il mese del nome è il mese a cui la bolletta appartiene (il consumo) e decide dove sta: per i bimestrali conta l'ultimo.
// Dal PDF si legge l'importo («Totale da pagare»). Le «altre spese» (affitto, Tari, wifi…) non hanno documenti: le scrive l'utente.
import crypto from 'node:crypto';

const NAME = /^(.+?) (\d{4})\.(\d{2})(?: - (\d{4})\.(\d{2}))?\.pdf$/i;
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** «2026-08» + n mesi. */
export const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** Dal nome di un file: tipo, mese di inizio e di fine (AAAA-MM) e mese di appartenenza (l'ultimo del nome); null se il nome non è quello delle bollette. */
export function billName(name) {
  const m = NAME.exec(String(name ?? '').split('/').at(-1));
  if (!m) return null;
  const from = `${m[2]}-${m[3]}`, to = m[4] ? `${m[4]}-${m[5]}` : from;
  return { type: m[1], from, to, due: to };
}

/** Importo («Totale da pagare») e data di scadenza (AAAA-MM-GG) dal testo di una bolletta; i campi non trovati sono null. */
export function parseBillText(text) {
  const t = String(text ?? '');
  const a = /Totale da pagare\s+([\d.]*\d,\d{2})/i.exec(t);
  const amount = a ? Number(a[1].replace(/\./g, '').replace(',', '.')) : null;
  const d = /Scadenza\s+(\d{1,2})\s+([a-zà]+)\s+(\d{4})/i.exec(t);
  const mi = d ? MONTHS.indexOf(d[2].toLowerCase()) : -1;
  const due = mi >= 0 ? `${d[3]}-${String(mi + 1).padStart(2, '0')}-${d[1].padStart(2, '0')}` : null;
  return { amount, due };
}

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Una voce di «altre spese» scritta dall'utente: { id, name, amount, every ('month' | 'year'), month (1-12, solo ogni anno), from (AAAA-MM, il primo mese in cui conta) }. */
export function normalizeExtra(input, id = crypto.randomUUID().slice(0, 8), from = '') {
  const name = clean(input?.name, 80);
  if (!name) throw new Error('Scrivi il nome della spesa.');
  const amount = Number(String(input?.amount ?? '0').replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0 || amount > 1e7) throw new Error('Importo non valido.');
  const every = input?.every === 'year' ? 'year' : 'month';
  const month = every === 'year' ? Number(input?.month) : 0;
  if (every === 'year' && (!Number.isInteger(month) || month < 1 || month > 12)) throw new Error('Scegli il mese in cui si paga.');
  return { id, name, amount: Math.round(amount * 100) / 100, every, ...(month ? { month } : {}), from };
}
