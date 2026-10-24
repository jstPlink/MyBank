// Server di MyBank: API, pagine web e aggiornamento automatico delle banche.
import express from 'express';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAuth } from './auth.js';
import { AUTO_PER_DAY, BANKS, applyCutoff, cutoffOf, startLink, finishLink, syncConnection, publicState } from './banks.js';
import { checkKey, createClient, psuHeaders } from './eb.js';
import { AUTO_HOURS, TZ, nextRun } from './schedule.js';
import { monthBudget, listTransactions, yearSummary } from './stats.js';
import { DOCUMENTS, cleanFileName, downloadFile, listDocuments, listFolder, normalizeDocuments, uploadFile } from './documents.js';
import { PARSER_VERSION, parseStatement } from './estratto.js';
import { UNICREDIT_PARSER, parseFlexia, parseUnicreditAccount, pdfWords } from './unicredit.js';
import { PAYSLIP_PARSER, payslipInfo, readPayslipNet } from './busta.js';
import { importTransactions, importedVisible } from './import.js';
import { normalizeNotification } from './notifications.js';
import { defaultReminder, dueFromDay, groupTransactionIds, recurringGroups, recurringOverview, ricorrenteStatus } from './recurring.js';
import { openStore } from './store.js';
import { accountNames, BUDGET_TAGS, TAGS } from './tags.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Il testo di un PDF (`pdftotext -raw`, del pacchetto poppler: c'è nell'immagine Docker). */
async function pdfText(buffer) {
  const tmp = path.join(os.tmpdir(), `mybank-${process.pid}-${Date.now()}.pdf`);
  fs.writeFileSync(tmp, buffer);
  try {
    return await new Promise((resolve, reject) => {
      execFile('pdftotext', ['-raw', tmp, '-'], { maxBuffer: 64 * 1024 * 1024 }, (err, out) => (err ? reject(new Error(err.code === 'ENOENT' ? 'Sul server manca pdftotext (poppler-utils): aggiorna l\'immagine Docker.' : 'Non riesco a leggere il PDF.')) : resolve(out)));
    });
  } finally { fs.rmSync(tmp, { force: true }); }
}
export const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

/** Crea l'app: `dir` è la cartella dei dati, `password` la password di accesso (vuota = accesso libero, solo in locale). */
export function createApp({ dir, password = '', publicUrl = '', fetchImpl = fetch, cutoff = '', pdfToText = pdfText, wordsOf = pdfWords, payslipNet = readPayslipNet } = {}) {
  const store = openStore(dir);
  const { db } = store;
  if (cutoff) db.settings.cutoff = cutoff; // di norma i movimenti partono dal 1 agosto 2026 (vedi banks.js)
  if (applyCutoff(db)) store.save(); // quelli di prima si tolgono dai dati
  const auth = createAuth({ dir, password });
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '6mb' }));

  const bad = (res, message, status = 400) => res.status(status).json({ error: message });
  const wrap = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { bad(res, e.message); } };
  const bankApp = () => {
    const a = db.banking.app;
    if (!a?.appId || !a?.privateKey) throw new Error('Prima inserisci ID e chiave di Enable Banking (scheda Banche → Enable Banking).');
    return a;
  };
  const baseUrl = (req) => (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');

  // ---------------------------------------------------------------- accesso e versione
  app.get('/api/version', (req, res) => res.json({ version: VERSION }));
  app.post('/api/login', (req, res) => auth.login(req, res));
  app.post('/api/logout', (req, res) => auth.logout(req, res));
  app.post('/api/password', auth.middleware, (req, res) => auth.changePassword(req, res));
  app.get('/api/session', (req, res) => {
    if (!auth.isAuthed(req)) return res.status(401).json({ ok: false, open: auth.open });
    res.json({ ok: true, open: auth.open, token: auth.refresh(), version: VERSION, demo: Boolean(process.env.MYBANK_DEMO) });
  });

  // Ritorno dalla banca dopo l'autorizzazione: si conclude il collegamento e si torna alla scheda Banche (non serve il login: vale lo «state»).
  app.get('/api/banks/callback', async (req, res) => {
    const back = (msg) => res.redirect(`/?banca=${encodeURIComponent(msg)}#banche`);
    try {
      if (req.query.error) throw new Error(`La banca ha risposto: ${req.query.error_description ?? req.query.error}`);
      const client = createClient(bankApp(), fetchImpl);
      const conn = await finishLink({ client, db, code: String(req.query.code ?? ''), state: String(req.query.state ?? '') });
      await store.save();
      try { await syncConnection({ client, db, conn }); } catch { /* si leggerà con «Aggiorna» */ }
      await store.save();
      back(`ok:${BANKS[conn.bank]?.label ?? conn.bank} collegata.`);
    } catch (e) { await store.save(); back(`errore:${e.message}`); }
  });

  app.use('/api', auth.middleware);

  // ---------------------------------------------------------------- storico, movimenti, budget
  app.get('/api/summary', (req, res) => {
    const year = Number(req.query.year) || new Date().getFullYear();
    res.json(yearSummary(db, year));
  });

  app.get('/api/transactions', (req, res) => {
    const account = String(req.query.account ?? '');
    const recurring = String(req.query.recurring ?? '');
    const list = listTransactions(db, { year: Number(req.query.year) || 0, month: Number(req.query.month) || 0, tag: String(req.query.tag ?? ''), q: req.query.q, account, ids: recurring ? groupTransactionIds(db, recurring) : null, sort: String(req.query.sort ?? 'date'), dir: String(req.query.dir ?? '') });
    // con un conto o pocket scelto (Banche → tocco su una riga) si dice anche come si chiama
    const name = account ? accountNames(db).get(account)?.name : '';
    // entrate e uscite dei movimenti filtrati (tutti, non solo i primi 1000); i giroconti non contano
    const totals = { entrate: 0, uscite: 0 };
    for (const t of list) if (t.tag !== 'giroconto') { if (t.amount > 0) totals.entrate += t.amount; else totals.uscite -= t.amount; }
    totals.entrate = Math.round(totals.entrate * 100) / 100; totals.uscite = Math.round(totals.uscite * 100) / 100;
    // a pagine: `limit` (al massimo 1000, di base 1000) e `offset`
    const limit = Math.min(1000, Math.max(1, Math.floor(Number(req.query.limit)) || 1000));
    const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
    // i movimenti «Ricorrente» dicono a quale ricorrente appartengono (`recurring: { key, name }`) o `null` se sono da assegnare
    const status = list.some((t) => t.tag === 'ricorrente') ? ricorrenteStatus(db) : null;
    if (status) totals.unassigned = list.filter((t) => t.tag === 'ricorrente' && !status.get(t.id)).length;
    const page = list.slice(offset, offset + limit).map((t) => (status && t.tag === 'ricorrente' ? { ...t, recurring: status.get(t.id) ?? null } : t));
    res.json({ transactions: page, total: list.length, offset, totals, sort: String(req.query.sort ?? 'date'), tags: TAGS, account: account ? { uid: account, name: name || 'Conto' } : null });
  });

  // Tag scelto a mano per un movimento (`null` torna a quello automatico).
  app.put('/api/transactions/:id/tag', wrap(async (req, res) => {
    const t = db.transactions[req.params.id];
    if (!t) return bad(res, 'Movimento sconosciuto.', 404);
    const tag = req.body?.tag;
    if (tag == null || tag === '') delete db.overrides[t.id];
    else if (TAGS[tag]) db.overrides[t.id] = tag;
    else return bad(res, 'Tag non valido.');
    delete db.unsorted[t.id]; // l'hai smistato tu (anche con «automatico»): il movimento non è più «da smistare»
    await store.save();
    res.json({ ok: true });
  }));

  // Nome scelto a mano per un movimento (vuoto torna al nome della banca). Vale per quel solo movimento e resta anche alle letture successive.
  app.put('/api/transactions/:id/name', wrap(async (req, res) => {
    const t = db.transactions[req.params.id];
    if (!t) return bad(res, 'Movimento sconosciuto.', 404);
    const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (name) db.renames[t.id] = name; else delete db.renames[t.id];
    await store.save();
    res.json({ ok: true, name });
  }));

  app.get('/api/budgets', (req, res) => res.json({ budgets: db.settings.budgets, month: monthBudget(db) }));
  app.put('/api/budgets', wrap(async (req, res) => {
    for (const k of BUDGET_TAGS) {
      const v = req.body?.[k];
      if (v == null || v === '') continue;
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) return bad(res, `Importo non valido per ${TAGS[k]}.`);
      db.settings.budgets[k] = Math.round(n * 100) / 100;
    }
    await store.save();
    res.json({ budgets: db.settings.budgets, month: monthBudget(db) });
  }));

  // i dati del widget sono quelli del mese (le categorie con budget, speso e residuo)
  app.get('/api/widget', (req, res) => res.json(monthBudget(db)));

  // ---------------------------------------------------------------- importazione da estratto conto
  app.post('/api/import', wrap(async (req, res) => {
    const result = importTransactions(db, req.body?.transactions);
    await store.save();
    res.json(result);
  }));

  // ---------------------------------------------------------------- estratti conto: lettura automatica
  // Ogni estratto nuovo o cambiato della cartella (e delle sue sottocartelle), dei mesi PRIMA della data di inizio, si scarica, si legge e i suoi
  // movimenti si salvano. Quelli da quella data in poi non si leggono: li legge la banca. Tre tipi di estratto, riconosciuti dal nome:
  //   «Estratto conto AAAA.MM.pdf»                    → conto Revolut (mensile)        «Estratto conto AAAA.MM - AAAA.MM.pdf» → conto UniCredit (trimestrale)
  //   «Estratto Conto Carte Flexia AAAA.MM.pdf»       → carta di credito UniCredit (mensile)
  // L'esito di ogni file sta in settings.statementsRead (chiave: il percorso del file).
  const STATEMENT_KINDS = [
    { kind: 'revolut', re: /^Estratto conto (\d{4})\.(\d{2})\.pdf$/i },
    { kind: 'conto', re: /^Estratto conto (\d{4})\.(\d{2}) - \d{4}\.\d{2}\.pdf$/i },
    { kind: 'carta', re: /^Estratto Conto Carte Flexia (\d{4})\.(\d{2})\.pdf$/i },
  ];
  /** Il tipo di estratto dal nome del file e il primo mese che copre, o null. */
  const statementKind = (name) => { for (const k of STATEMENT_KINDS) { const m = k.re.exec(name); if (m) return { kind: k.kind, month: `${m[1]}-${m[2]}` }; } return null; };
  const STATEMENT_PARSER = `${PARSER_VERSION}.${UNICREDIT_PARSER}`; // cambia quando uno dei lettori migliora: gli estratti falliti si ritentano
  const statementUrl = () => db.settings.documents?.statements?.url ?? '';
  async function readStatement(filePath, sig) {
    const rec = (db.settings.statementsRead ??= {});
    const at = new Date().toISOString();
    try {
      const { kind } = statementKind(filePath.split('/').at(-1)) ?? {};
      if (!kind) throw new Error('Tipo di estratto sconosciuto.');
      const pdf = await downloadFile(statementUrl(), filePath, fetchImpl);
      const { transactions } = kind === 'revolut' ? parseStatement(await pdfToText(pdf)) : kind === 'conto' ? parseUnicreditAccount(await wordsOf(pdf)) : parseFlexia(await wordsOf(pdf));
      const r = importTransactions(db, transactions);
      rec[filePath] = { sig, at, found: transactions.length, added: r.added, updated: r.updated };
    } catch (e) { rec[filePath] = { sig, at, error: e.message, parser: STATEMENT_PARSER }; }
    return rec[filePath];
  }
  let statementsBusy = null;
  /** Legge gli estratti nuovi della cartella. Restituisce l'elenco di quelli letti adesso. */
  function syncStatements(files) {
    if (!statementUrl()) return Promise.resolve([]);
    if (statementsBusy) return statementsBusy;
    statementsBusy = (async () => {
      const list = files ?? (await listFolder(statementUrl(), fetchImpl)).files;
      const rec = (db.settings.statementsRead ??= {});
      const firstMonth = cutoffOf(db).slice(0, 7);
      const read = [];
      for (const f of list) {
        const k = statementKind(f.name);
        if (!k) continue;
        const sig = `${f.size}|${f.modified}`;
        const was = rec[f.path];
        if (was?.sig === sig && !(was.error && was.parser !== STATEMENT_PARSER)) continue; // già letto (o già fallito): si riprova se il file cambia o se il lettore è migliorato
        if (k.month >= firstMonth) { rec[f.path] = { sig, skipped: true }; continue; } // da qui in poi i movimenti li legge la banca
        read.push({ name: f.path, ...(await readStatement(f.path, sig)) });
      }
      if (read.length || list.some((f) => rec[f.path]?.skipped)) await store.save();
      return read;
    })().finally(() => { statementsBusy = null; });
    return statementsBusy;
  }

  // ---------------------------------------------------------------- buste paga: lettura automatica
  // Ogni busta paga nuova nella cartella (e nelle sue sottocartelle) si scarica e se ne legge il «netto a pagare» (sono scansioni: OCR, vedi
  // busta.js); diventa un movimento di entrata. Come per gli estratti, i mesi da agosto 2026 in poi non si leggono (il conto è letto dalla banca).
  // La lettura va in sottofondo: l'elenco dei file risponde subito e dice quali buste sono ancora in attesa. L'esito sta in settings.payslipsRead.
  const payslipUrl = () => db.settings.documents?.payslips?.url ?? '';
  let payslipsBusy = null;
  /** Una busta paga da leggere: nuova, cambiata o fallita con un lettore più vecchio. */
  const payslipTodo = (f) => {
    const was = db.settings.payslipsRead?.[f.path];
    return !(was?.sig === `${f.size}|${f.modified}` && !(was.error && was.parser !== PAYSLIP_PARSER));
  };
  function syncPayslips(files) {
    if (!payslipUrl()) return Promise.resolve([]);
    if (payslipsBusy) return payslipsBusy;
    payslipsBusy = (async () => {
      const list = files ?? (await listFolder(payslipUrl(), fetchImpl)).files;
      const rec = (db.settings.payslipsRead ??= {});
      const from = cutoffOf(db);
      const read = [];
      let sinceSave = 0;
      for (const f of list) {
        const info = payslipInfo(f.name);
        if (!info || !payslipTodo(f)) continue;
        const sig = `${f.size}|${f.modified}`;
        const at = new Date().toISOString();
        if (info.date >= from) { rec[f.path] = { sig, at, skipped: true }; continue; }
        try {
          const amount = await payslipNet(await downloadFile(payslipUrl(), f.path, fetchImpl));
          importTransactions(db, [{ bank: 'busta', account: 'busta:paga', accountLabel: 'Busta paga', key: info.key, date: info.date, amount, description: info.description }]);
          rec[f.path] = { sig, at, amount, parser: PAYSLIP_PARSER };
          read.push({ path: f.path, amount });
        } catch (e) { rec[f.path] = { sig, at, error: e.message, parser: PAYSLIP_PARSER }; read.push({ path: f.path, error: e.message }); }
        if (++sinceSave >= 5) { sinceSave = 0; await store.save(); }
      }
      await store.save();
      return read;
    })().finally(() => { payslipsBusy = null; });
    return payslipsBusy;
  }

  // ---------------------------------------------------------------- documenti (tre cartelle online)
  const docKey = (req) => { if (!DOCUMENTS[req.params.key]) throw new Error('Categoria di documenti sconosciuta.'); return req.params.key; };
  app.get('/api/documents', (req, res) => res.json({ links: listDocuments(db) }));
  app.put('/api/documents', wrap(async (req, res) => {
    db.settings.documents = normalizeDocuments(req.body, db.settings.documents);
    await store.save();
    res.json({ links: listDocuments(db) });
  }));
  // L'elenco dei file della cartella (letto da Seafile) con l'indirizzo per aprire ognuno.
  app.get('/api/documents/:key/files', wrap(async (req, res) => {
    const url = db.settings.documents?.[docKey(req)]?.url;
    if (!url) return bad(res, 'Prima inserisci il link della cartella.');
    const folder = await listFolder(url, fetchImpl);
    if (req.params.key === 'statements') {
      // gli estratti nuovi si leggono qui (e a ogni aggiornamento automatico); di ogni estratto mensile si dice com'è andata
      const read = await syncStatements(folder.files).catch(() => []);
      const visible = importedVisible(db);
      const rec = db.settings.statementsRead ?? {};
      for (const f of folder.files) {
        const k = statementKind(f.name);
        if (!k) continue;
        const r = rec[f.path];
        f.statement = r?.error ? { state: 'errore', error: r.error } : r?.skipped ? { state: 'banca' } : r ? { state: 'letto', count: r.found ?? 0, visible: visible === null || visible.includes(k.month) } : { state: 'attesa' };
      }
      folder.read = read.map((r) => ({ name: r.name, count: r.found ?? 0, error: r.error ?? '' }));
    }
    if (req.params.key === 'payslips') {
      if (folder.files.some((f) => payslipInfo(f.name) && payslipTodo(f))) syncPayslips(folder.files).catch((e) => console.error('Lettura delle buste paga non riuscita:', e.message)); // in sottofondo
      const rec = db.settings.payslipsRead ?? {};
      for (const f of folder.files) {
        if (!payslipInfo(f.name)) continue;
        const r = rec[f.path];
        f.payslip = r?.error ? { state: 'errore', error: r.error } : r?.skipped ? { state: 'banca' } : r ? { state: 'letto', amount: r.amount } : { state: 'attesa' };
      }
      folder.busy = Boolean(payslipsBusy);
    }
    res.json(folder);
  }));
  // Carica un file (il corpo della richiesta è il file) nella cartella, con il nome scelto dall'utente.
  app.post('/api/documents/:key/files', express.raw({ type: () => true, limit: '40mb' }), wrap(async (req, res) => {
    const url = db.settings.documents?.[docKey(req)]?.url;
    if (!url) return bad(res, 'Prima inserisci il link della cartella.');
    if (!Buffer.isBuffer(req.body) || !req.body.length) return bad(res, 'Il file è vuoto.');
    await uploadFile(url, cleanFileName(req.query.name), req.body, fetchImpl);
    res.json({ ok: true });
  }));
  // Rilegge a mano un estratto conto (per riprovare dopo un errore).
  app.post('/api/documents/statements/import', wrap(async (req, res) => {
    if (!statementUrl()) return bad(res, 'Prima inserisci il link della cartella degli estratti conto.');
    const parts = String(req.query.path ?? req.query.name ?? '').split('/').filter(Boolean).slice(0, 4).map(cleanFileName); // percorso nella cartella condivisa (con le sottocartelle)
    const filePath = parts.join('/');
    if (!parts.length || !statementKind(parts.at(-1))) return bad(res, 'Si leggono solo gli estratti conto riconosciuti (conto Revolut, conto UniCredit, carta Flexia).');
    const r = await readStatement(filePath, db.settings.statementsRead?.[filePath]?.sig ?? '');
    await store.save();
    if (r.error) return bad(res, r.error);
    res.json({ name: filePath, found: r.found, added: r.added, updated: r.updated });
  }));

  // ---------------------------------------------------------------- notifiche
  // Promemoria con testo, giorno del mese e orario: li salva il server, l'app Android li legge e li programma sul telefono.
  const listNotifications = () => ({ notifications: db.notifications });
  app.get('/api/notifications', (req, res) => res.json(listNotifications()));
  app.post('/api/notifications', wrap(async (req, res) => {
    if (db.notifications.length >= 50) return bad(res, 'Troppe notifiche: toglierne qualcuna.');
    db.notifications.push(normalizeNotification(req.body));
    await store.save();
    res.json(listNotifications());
  }));
  app.put('/api/notifications/:id', wrap(async (req, res) => {
    const i = db.notifications.findIndex((n) => n.id === req.params.id);
    if (i < 0) return bad(res, 'Notifica sconosciuta.', 404);
    db.notifications[i] = normalizeNotification({ ...req.body, month: req.body?.month ?? db.notifications[i].month }, req.params.id, db.notifications[i].recurringKey);
    await store.save();
    res.json(listNotifications());
  }));
  app.delete('/api/notifications/:id', wrap(async (req, res) => {
    const i = db.notifications.findIndex((n) => n.id === req.params.id);
    if (i < 0) return bad(res, 'Notifica sconosciuta.', 404);
    db.notifications.splice(i, 1);
    await store.save();
    res.json(listNotifications());
  }));

  // ---------------------------------------------------------------- ricorrenti
  // Pagamenti che si ripetono, raggruppati dal server; il promemoria di un gruppo è una notifica legata alla sua chiave.
  const recurringState = (tx = '') => recurringOverview(db, new Date(), tx);
  // assegna dei movimenti a un ricorrente (o li scollega con `null`): un movimento assegnato prende il tag «Ricorrente»
  const linkTransactions = (ids, key) => {
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw new Error('Scegli da 1 a 100 movimenti.');
    for (const id of ids) {
      const t = db.transactions[id];
      if (!t || t.amount >= 0) throw new Error('Si assegnano solo uscite esistenti.');
    }
    for (const id of ids) {
      if (key == null) { delete db.recurringLinks[id]; continue; }
      db.recurringLinks[id] = key;
      db.overrides[id] = 'ricorrente';
    }
  };
  const findGroup = (key) => recurringGroups(db).find((g) => g.key === key);
  // un ricorrente nasce sempre con un promemoria di base (se c'è ancora posto fra le notifiche)
  const addDefaultReminder = (g) => {
    if (!g || db.notifications.length >= 50 || db.notifications.some((n) => n.recurringKey === g.key)) return;
    db.notifications.push({ ...normalizeNotification(defaultReminder(g), undefined, g.key), auto: true });
  };
  // un promemoria di base (`auto`, mai modificato da te) segue il ricorrente: importo e giorno cambiano con i movimenti assegnati
  const refreshAutoReminders = () => {
    const groups = recurringGroups(db);
    for (const n of db.notifications) {
      const g = n.auto && groups.find((x) => x.key === n.recurringKey);
      if (!g) continue;
      const d = defaultReminder(g);
      n.text = d.text; n.day = d.day;
      if (d.month) n.month = d.month; else delete n.month;
    }
  };
  const dropReminder = (key) => { db.notifications = db.notifications.filter((n) => n.recurringKey !== key); };
  app.get('/api/recurring', (req, res) => res.json(recurringState(String(req.query.tx ?? ''))));
  app.put('/api/recurring/assign', wrap(async (req, res) => {
    const key = req.body?.key ?? null;
    if (key !== null && !findGroup(String(key))) return bad(res, 'Ricorrente sconosciuto.', 404);
    linkTransactions(req.body?.ids, key === null ? null : String(key));
    refreshAutoReminders();
    await store.save();
    res.json(recurringState());
  }));
  app.post('/api/recurring', wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!name) return bad(res, 'Scrivi il nome del pagamento.');
    // l'importo non si scrive: è la media dei totali mensili dei movimenti che assegni (finché non ce ne sono resta 0)
    const annual = Boolean(req.body?.annual);
    let next = String(req.body?.next ?? '');
    if (req.body?.day != null && req.body.day !== '') {
      // mensile: basta il giorno del pagamento; annuale: giorno e mese (niente anno)
      const day = Number(req.body.day), month = annual ? Number(req.body.month) : 0;
      if (!Number.isInteger(day) || day < 1 || day > 31) return bad(res, 'Il giorno del pagamento deve essere tra 1 e 31.');
      if (annual && (!Number.isInteger(month) || month < 1 || month > 12)) return bad(res, 'Scegli il mese del pagamento.');
      next = dueFromDay(day, month, annual, new Date().toISOString().slice(0, 10));
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || Number.isNaN(Date.parse(next))) return bad(res, 'Scegli il giorno del pagamento.');
    if (db.recurringManual.length >= 100) return bad(res, 'Troppi ricorrenti aggiunti a mano.');
    const m = { id: crypto.randomUUID().slice(0, 8), name, amount: 0, annual, next };
    if (req.body?.assign) linkTransactions(req.body.assign, `m-${m.id}`);
    db.recurringManual.push(m);
    addDefaultReminder(findGroup(`m-${m.id}`));
    refreshAutoReminders();
    await store.save();
    res.json({ ...recurringState(), key: `m-${m.id}` });
  }));
  // modifica di un ricorrente: nome, cadenza, prossimo pagamento (l'importo non si modifica: è la media dei totali mensili dei movimenti assegnati)
  app.put('/api/recurring/:key', wrap(async (req, res) => {
    const m = db.recurringManual.find((x) => `m-${x.id}` === req.params.key);
    if (!m) return bad(res, 'Ricorrente sconosciuto.', 404);
    const b = req.body ?? {};
    if (b.name != null) {
      const name = String(b.name).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name) return bad(res, 'Scrivi il nome del pagamento.');
      m.name = name;
    }
    if (b.annual != null) m.annual = Boolean(b.annual);
    if (b.next != null) {
      const next = String(b.next);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(next) || Number.isNaN(Date.parse(next))) return bad(res, 'Data del prossimo pagamento non valida.');
      m.next = next;
    }
    await store.save();
    res.json(recurringState());
  }));
  app.put('/api/recurring/:key/active', wrap(async (req, res) => {
    const g = findGroup(req.params.key);
    if (!g) return bad(res, 'Ricorrente sconosciuto.', 404);
    const active = Boolean(req.body?.active);
    db.recurringState[g.key] = { ...db.recurringState[g.key], active };
    if (!active) dropReminder(g.key); // un pagamento disdetto non si ricorda più
    await store.save();
    res.json(recurringState());
  }));
  app.put('/api/recurring/:key/reminder', wrap(async (req, res) => {
    const g = findGroup(req.params.key);
    if (!g) return bad(res, 'Ricorrente sconosciuto.', 404);
    if (!g.active) return bad(res, 'Il ricorrente non è attivo: riattivalo per impostare un promemoria.');
    const i = db.notifications.findIndex((n) => n.recurringKey === g.key);
    if (i < 0 && db.notifications.length >= 50) return bad(res, 'Troppe notifiche: toglierne qualcuna.');
    // senza dati si propone il promemoria di base; il mese vale solo per gli annuali
    const body = req.body?.text == null ? defaultReminder(g) : { ...req.body, month: g.annual ? req.body.month : undefined };
    const n = { ...normalizeNotification(body, i < 0 ? undefined : db.notifications[i].id, g.key), ...(req.body?.text == null ? { auto: true } : {}) };
    if (i < 0) db.notifications.push(n); else db.notifications[i] = n;
    await store.save();
    res.json(recurringState());
  }));
  app.delete('/api/recurring/:key/reminder', wrap(async (req, res) => {
    if (!db.notifications.some((n) => n.recurringKey === req.params.key)) return bad(res, 'Nessun promemoria.', 404);
    dropReminder(req.params.key);
    await store.save();
    res.json(recurringState());
  }));
  app.delete('/api/recurring/:key', wrap(async (req, res) => {
    const i = db.recurringManual.findIndex((m) => `m-${m.id}` === req.params.key);
    if (i < 0) return bad(res, 'Si tolgono solo i ricorrenti aggiunti a mano (gli altri si disattivano).', 404);
    db.recurringManual.splice(i, 1);
    delete db.recurringState[req.params.key];
    for (const [id, k] of Object.entries(db.recurringLinks)) if (k === req.params.key) delete db.recurringLinks[id];
    dropReminder(req.params.key);
    await store.save();
    res.json(recurringState());
  }));

  // ---------------------------------------------------------------- banche
  // Orari dell'aggiornamento automatico: quelli scelti dall'utente (Banche → Aggiornamento) oppure quelli di base.
  const hoursNow = () => (Array.isArray(db.settings.autoHours) && db.settings.autoHours.length ? db.settings.autoHours : AUTO_HOURS);
  const bankInfo = (req) => ({
    ...publicState(db),
    redirectUrl: `${baseUrl(req)}/api/banks/callback`,
    auto: { hours: hoursNow(), tz: TZ, next: nextRun(new Date(), hoursNow()).toISOString(), max: AUTO_PER_DAY },
  });
  app.get('/api/banks', (req, res) => res.json(bankInfo(req)));

  app.put('/api/banks/app', wrap(async (req, res) => {
    const appId = String(req.body?.appId ?? '').trim();
    const privateKey = String(req.body?.privateKey ?? '').trim();
    if (!appId) return bad(res, 'Manca l\'ID dell\'applicazione.');
    // senza una nuova chiave si tiene quella già salvata
    if (privateKey) checkKey(privateKey);
    else if (!db.banking.app?.privateKey) return bad(res, 'Manca la chiave privata.');
    db.banking.app = { appId, privateKey: privateKey || db.banking.app.privateKey };
    await store.save();
    res.json(bankInfo(req));
  }));

  app.put('/api/banks/schedule', wrap(async (req, res) => {
    const raw = Array.isArray(req.body?.hours) ? req.body.hours : [];
    const hours = [...new Set(raw.map(Number))].sort((a, b) => a - b);
    if (!hours.length || hours.some((h) => !Number.isInteger(h) || h < 0 || h > 23)) return bad(res, 'Scegli almeno un orario, tra le 0 e le 23.');
    if (hours.length > AUTO_PER_DAY) return bad(res, `Le banche concedono ${AUTO_PER_DAY} accessi automatici al giorno: gli orari possono essere al massimo ${AUTO_PER_DAY}.`);
    db.settings.autoHours = hours;
    await store.save();
    if (active) scheduleAutoRead(); // il prossimo aggiornamento si ricalcola subito
    res.json(bankInfo(req));
  }));

  app.post('/api/banks/link', wrap(async (req, res) => {
    const client = createClient(bankApp(), fetchImpl);
    const url = await startLink({ client, db, bank: String(req.body?.bank ?? ''), redirectUrl: `${baseUrl(req)}/api/banks/callback` });
    await store.save();
    res.json({ url });
  }));

  app.delete('/api/banks/:id', wrap(async (req, res) => {
    const conn = db.banking.connections.find((c) => c.id === req.params.id);
    if (!conn) return bad(res, 'Collegamento sconosciuto.', 404);
    try { await createClient(bankApp(), fetchImpl).deleteSession(conn.id); } catch { /* la sessione può essere già scaduta */ }
    db.banking.connections = db.banking.connections.filter((c) => c !== conn);
    for (const [id, t] of Object.entries(db.transactions)) if (t.bank === conn.bank && !t.imported) delete db.transactions[id]; // quelli importati da un estratto restano
    await store.save();
    res.json(bankInfo(req));
  }));

  app.put('/api/banks/accounts/:uid/name', wrap(async (req, res) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 60);
    if (name) db.banking.names[req.params.uid] = name; else delete db.banking.names[req.params.uid];
    await store.save();
    res.json(bankInfo(req));
  }));

  // Aggiornamento a mano: una lettura per banca, dichiarata alla banca come richiesta da una persona presente.
  app.post('/api/banks/sync', wrap(async (req, res) => {
    const client = createClient(bankApp(), fetchImpl, psuHeaders(req));
    const targets = db.banking.connections.filter((c) => !req.body?.id || c.id === req.body.id);
    if (!targets.length) return bad(res, 'Nessuna banca collegata.');
    const errors = [];
    let added = 0;
    for (const conn of targets) {
      try { added += (await syncConnection({ client, db, conn })).added; } catch (e) { errors.push(`${BANKS[conn.bank]?.label ?? conn.bank}: ${e.message}`); }
    }
    await store.save();
    res.json({ added, errors, ...bankInfo(req) });
  }));

  // ---------------------------------------------------------------- aggiornamento automatico
  async function autoRead() {
    await syncStatements().catch((e) => console.error('Lettura degli estratti conto non riuscita:', e.message));
    await syncPayslips().catch((e) => console.error('Lettura delle buste paga non riuscita:', e.message));
    const b = db.banking;
    if (!b.app?.appId || !b.app?.privateKey || !b.connections.length) return null;
    const client = createClient(b.app, fetchImpl);
    const errors = [];
    let added = 0;
    for (const conn of b.connections) {
      try { added += (await syncConnection({ client, db, conn, auto: true })).added; } catch (e) { errors.push(`${BANKS[conn.bank]?.label ?? conn.bank}: ${e.message}`); }
    }
    b.lastAuto = { at: new Date().toISOString(), added, errors };
    await store.save();
    console.log(`Aggiornamento automatico delle banche: ${added} nuovi movimenti${errors.length ? `, errori: ${errors.join(' · ')}` : ''}`);
    return b.lastAuto;
  }
  let timer = null;
  let active = false;
  function scheduleAutoRead() {
    active = true;
    clearTimeout(timer);
    const when = nextRun(new Date(), hoursNow());
    timer = setTimeout(async () => {
      try { await autoRead(); } catch (e) { console.error('Aggiornamento automatico non riuscito:', e.message); }
      scheduleAutoRead();
    }, Math.max(1000, when.getTime() - Date.now()));
    timer.unref?.();
    return timer;
  }

  // La pagina non si tiene mai in cache e punta a script e stile con la versione nell'indirizzo: dopo un aggiornamento nessun browser,
  // app o proxy può mostrare un'app.js vecchia con una pagina nuova.
  const pub = path.join(root, 'public');
  app.get(['/', '/index.html'], (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(fs.readFileSync(path.join(pub, 'index.html'), 'utf8').replaceAll('__V__', VERSION));
  });
  app.use(express.static(pub, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  return { app, store, db, autoRead, scheduleAutoRead };
}
