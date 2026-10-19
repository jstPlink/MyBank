// I tag dei movimenti. Li decide il pocket Revolut da cui parte il pagamento:
//   01 Spesa → Spesa · 02 Svago → Svago · 03 Carburante (o 03 Auto) → Auto · 04 Altro → Altro
// Il tag «Auto» si chiamava «Carburante»: la chiave interna resta `carburante`, quindi i dati e le scelte già salvate non cambiano.
// Tutto il resto (altri pocket, conto principale, UniCredit) è «Non definito», da smistare a mano. Le entrate sono «Entrata»; i giri di
// denaro tra i propri conti e pocket sono «Non contabile» (chiave interna `giroconto`, rimasta com'era nei dati) e non contano in nessun totale. «Utenze», «Ricorrente» e le sotto categorie (Cibo, Carburante, Autostrada) non sono mai automatiche: si scelgono a mano.
// Una scelta a mano vince sempre.

export const TAGS = {
  spesa: 'Spesa', cibo: 'Cibo', svago: 'Svago', carburante: 'Auto', auto_carburante: 'Carburante', autostrada: 'Autostrada', altro: 'Altro', utenze: 'Utenze', ricorrente: 'Ricorrente',
  non_definito: 'Non definito', entrata: 'Entrata', giroconto: 'Non contabile',
};
// Le sotto categorie si scelgono a mano (come «Utenze»): contano nel totale della categoria da cui dipendono (budget e Storico), ma si vedono a parte.
// La chiave `carburante` è la categoria «Auto»: la sotto categoria «Carburante» ha la chiave `auto_carburante`.
export const SUBTAGS = { cibo: 'spesa', auto_carburante: 'carburante', autostrada: 'carburante' };
export const parentTag = (tag) => SUBTAGS[tag] ?? tag;
export const BUDGET_TAGS = ['spesa', 'svago', 'carburante', 'altro']; // le quattro categorie con un budget

// «01 Spesa» e «Spesa» sono lo stesso pocket: maiuscole, spazi e numero iniziale non contano.
const norm = (s) => String(s ?? '').toLowerCase().replace(/^\s*\d+[\s.)-]*/, '').replace(/\s+/g, ' ').trim();
const POCKETS = { spesa: 'spesa', svago: 'svago', carburante: 'carburante', auto: 'carburante', altro: 'altro' }; // il pocket può chiamarsi «Carburante» o «Auto»
export const pocketTag = (name) => POCKETS[norm(name)] ?? null;

// Revolut dà a ogni pocket il nome dell'intestatario; il nome vero (es. «01 Spesa») compare nel testo dei suoi movimenti:
// «Accredita EUR 01 Spesa da EUR» quando entra denaro, «Da EUR 02 Svago» / «A EUR 02 Svago» quando si sposta tra pocket.
const POCKET_IN = /^Accredita\s+EUR\s+(.+?)\s+da\s+EUR$/i;
const POCKET_WITHDRAW = /^Prelievo da Pocket$/i; // la dicitura degli estratti conto in PDF
const POCKET_MOVE = /^(?:Da|A|From|To)\s+EUR\s+(.+)$/i;

const texts = (t) => [t.description, t.remittance].map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);

/** Un giro tra pocket Revolut, riconosciuto dal testo del movimento. */
export const isPocketTransfer = (t) => texts(t).some((s) => POCKET_IN.test(s) || POCKET_MOVE.test(s) || POCKET_WITHDRAW.test(s));

/** Il nome vero di un pocket, dedotto dal testo dei suoi movimenti: prima i «Accredita…», poi gli altri; vince il più frequente. */
export function inferPocketName(txs) {
  const count = (re) => {
    const found = new Map();
    for (const t of txs) {
      for (const s of texts(t)) {
        const m = re.exec(s);
        const name = m?.[1]?.replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2 || name.length > 40) continue;
        const f = found.get(name.toLowerCase()) ?? { name, count: 0 };
        f.count++;
        found.set(name.toLowerCase(), f);
      }
    }
    return [...found.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))[0] ?? null;
  };
  return count(POCKET_IN)?.name ?? count(POCKET_MOVE)?.name ?? null;
}

const CARD_ACCOUNT = 'estratto:unicredit:carta'; // il «conto» degli acquisti con la carta di credito, letti dall'estratto della carta
const CARD_SETTLEMENT = /PAGAMENTO PER UTILIZZO CARTE DI CREDITO.*?ESTRATTO (\d{2})\/(\d{4})/i;
/** L'addebito mensile della carta di credito sul conto («… ESTRATTO 12/2024 …») quando di quel mese c'è l'estratto della carta: non conta, ci sono già gli acquisti. */
const isCardSettled = (t, cardMonths) => {
  if (!(t.amount < 0)) return false;
  const m = CARD_SETTLEMENT.exec(`${t.description ?? ''} ${t.remittance ?? ''}`);
  return Boolean(m) && cardMonths.has(`${m[2]}-${m[1]}`);
};
const normIban = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

/** Nome di ogni conto/pocket come lo vede l'utente: nome dato a mano, altrimenti dedotto dai movimenti, altrimenti quello della banca. */
export function accountNames(db) {
  const byAccount = new Map();
  for (const t of Object.values(db.transactions)) {
    if (!byAccount.has(t.account)) byAccount.set(t.account, []);
    byAccount.get(t.account).push(t);
  }
  const out = new Map();
  for (const conn of db.banking.connections) {
    for (const a of conn.accounts) {
      const custom = String(db.banking.names[a.uid] ?? '').trim();
      // il conto principale (con IBAN) non è un pocket: il suo nome non si deduce
      const guess = !custom && !a.iban ? inferPocketName(byAccount.get(a.uid) ?? []) : null;
      out.set(a.uid, { name: custom || guess || a.name || conn.aspsp?.name || 'Conto', source: custom ? 'manuale' : guess ? 'movimenti' : 'banca', main: Boolean(a.iban) });
    }
  }
  return out;
}

/**
 * Il tag di tutti i movimenti: Map id → tag.
 * Non contabile (giroconto) se: il testo è un giro tra pocket; l'IBAN della controparte è un mio conto; oppure lo stesso importo esce da un conto ed entra
 * in un altro della stessa banca entro un giorno. Poi: entrata, tag del pocket di provenienza o «Non definito» (un movimento nuovo, registrato in
 * `db.unsorted`, resta «Non definito» finché non scegli un tag: la scelta, anche «automatico», lo toglie da lì).
 */
export function classify(db) {
  const unsorted = db.unsorted ?? {}; // movimenti nuovi: restano «Non definito» finché non li smisti tu (il tag del pocket non si applica da solo)
  const names = accountNames(db);
  // mesi per cui c'è l'estratto della carta di credito (i suoi acquisti sono già movimenti): l'addebito mensile sul conto è solo il saldo
  const cardMonths = new Set(Object.values(db.transactions).filter((t) => t.account === CARD_ACCOUNT).map((t) => t.date.slice(0, 7)));
  const ownIbans = new Set(db.banking.connections.flatMap((c) => c.accounts.map((a) => normIban(a.iban))).filter(Boolean));
  const tags = new Map();
  const free = [];
  for (const t of Object.values(db.transactions)) {
    const forced = db.overrides[t.id];
    if (forced && TAGS[forced]) { tags.set(t.id, forced); continue; }
    if (isPocketTransfer(t) || (t.counterIban && ownIbans.has(normIban(t.counterIban))) || isCardSettled(t, cardMonths)) { tags.set(t.id, 'giroconto'); continue; }
    free.push(t);
  }
  // coppie uscita/entrata dello stesso importo tra due conti della stessa banca
  const day = (iso) => Date.parse(`${iso}T12:00:00Z`) / 86400000;
  const outs = free.filter((t) => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date));
  const taken = new Set();
  for (const o of outs) {
    const match = free.find((i) => i.amount > 0 && !taken.has(i.id) && i.account !== o.account && i.bank === o.bank
      && Math.round(i.amount * 100) === Math.round(-o.amount * 100) && Math.abs(day(i.date) - day(o.date)) <= 1);
    if (match) { taken.add(match.id); taken.add(o.id); tags.set(o.id, 'giroconto'); tags.set(match.id, 'giroconto'); }
  }
  for (const t of free) {
    if (tags.has(t.id)) continue;
    if (t.amount > 0) { tags.set(t.id, 'entrata'); continue; }
    const pocket = names.get(t.account);
    tags.set(t.id, (!unsorted[t.id] && pocket && pocketTag(pocket.name)) || 'non_definito');
  }
  return tags;
}
