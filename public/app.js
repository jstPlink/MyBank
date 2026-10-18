// MyBank: interfaccia web (e dell'app Android, che la carica dal server). Nessuna dipendenza.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => (n == null ? '–' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' }).format(n));
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'mai');
const THIS_YEAR = new Date().getFullYear();
let TAGS = { spesa: 'Spesa', cibo: 'Cibo', svago: 'Svago', carburante: 'Auto', auto_carburante: 'Carburante', autostrada: 'Autostrada', altro: 'Altro', utenze: 'Utenze', ricorrente: 'Ricorrente', non_definito: 'Non definito', entrata: 'Entrata', giroconto: 'Non contabile' };

// Le sotto categorie dipendono da una categoria (come sul server): nei menu si distinguono con un trattino.
const SUB_PARENT = { cibo: 'spesa', auto_carburante: 'carburante', autostrada: 'carburante' };
const parentTag = (k) => SUB_PARENT[k] ?? k;
const tagLabel = (k, v) => (SUB_PARENT[k] ? `– ${v}` : v);

// Un'icona per categoria (tratto sottile, nel colore del testo).
const ICON_PATHS = {
  spesa: '<path d="M3 4h2.5l2 11h10.5l2-8H6.3"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  svago: '<path d="M12 3l2.8 5.9 6.2.8-4.6 4.3 1.2 6.3L12 17.3 6.4 20.3l1.2-6.3L3 9.7l6.2-.8z"/>',
  carburante: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h5"/>',
  altro: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  utenze: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  cibo: '<path d="M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-2 2-3 5-3 8h3v10"/>',
  auto_carburante: '<path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M4 20h11M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h5"/>',
  autostrada: '<path d="M8 3L5 21M16 3l3 18M12 4v3M12 10.5v3M12 17v3"/>',
  ricorrente: '<path d="M4 10a8 8 0 0 1 14-4l2 2M20 14a8 8 0 0 1-14 4l-2-2M20 4v4h-4M4 20v-4h4"/>',
  non_definito: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  entrata: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  giroconto: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
};
const icon = (k) => `<svg class="ticon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[k] ?? ICON_PATHS.altro}</svg>`;

// I nomi dei tag arrivano dal server; questo nome si impone anche qui, così si vede subito anche con un server non ancora aggiornato.
const withNames = (tags) => ({ ...tags, giroconto: 'Non contabile', carburante: 'Auto' });

const state = { tab: 'storico', year: THIS_YEAR, open: new Set(), bankOpen: {}, mv: { year: THIS_YEAR, month: 0, tag: '', q: '', account: '', sort: 'date', dir: 'desc', items: [], total: 0, shown: 100, base: '', paged: false } };

// ------------------------------------------------------------------ rete

// Frontend locale (`npm start`): la pagina non ha dati né logica, ogni chiamata va al server scelto nella pagina di accesso.
// Sul server vero (e nell'app Android) questa modalità è spenta e le chiamate vanno allo stesso indirizzo della pagina.
const local = { on: false, server: '' };
const SERVER_KEY = 'mybank.server';
// Il pulsante davanti al campo del server sceglie http o https; nel campo si scrive solo l'indirizzo (mybank.miodominio.it).
let scheme = 'https';
const setScheme = (v) => { scheme = v === 'http' ? 'http' : 'https'; $('#schemeBtn').textContent = `${scheme}://`; };
$('#schemeBtn').addEventListener('click', () => setScheme(scheme === 'https' ? 'http' : 'https'));
// Se nel campo si incolla un indirizzo con http:// o https://, il pulsante si adegua e il prefisso si toglie dal campo.
const splitServer = (raw) => {
  const m = /^(https?):\/\/(.*)$/i.exec(String(raw ?? '').trim());
  if (m) setScheme(m[1].toLowerCase());
  return m ? m[2] : String(raw ?? '').trim();
};
const normServer = (raw) => {
  const s = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  // senza «https://»: https, tranne per gli indirizzi di casa (localhost, 192.168…, 10…, .local), che di norma sono http
  return /^(localhost([:/]|$)|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/:]+\.local([:/]|$))/i.test(s) ? `http://${s}` : `https://${s}`;
};

class Unauthorized extends Error {}
async function api(method, url, body) {
  const headers = { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(local.on && local.server ? { 'X-MyBank-Server': local.server } : {}) };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401) throw new Unauthorized();
  const data = await res.json().catch(() => ({}));
  // un 404 su /api/… vuol dire che il server è più vecchio dell'app e non ha ancora questa funzione
  if (res.status === 404 && !data.error) throw new Error('Il server non ha ancora questa funzione: aggiornalo (docker compose pull && docker compose up -d).');
  if (!res.ok) throw new Error(data.error ?? `Errore ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}
const fail = (e) => { if (e instanceof Unauthorized) return showLogin(); toast(e.message); };

// ------------------------------------------------------------------ accesso

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#serverRow').hidden = !local.on;
  if (local.on) $('#serverUrl').value = splitServer(local.server);
  (local.on && !local.server ? $('#serverUrl') : $('#password')).focus();
}

async function enter(session) {
  // l'app Android tiene il gettone per il widget
  try { if (window.Native?.saveToken && session.token) window.Native.saveToken(session.token); } catch { /* fuori dall'app non c'è */ }
  $('#login').hidden = true;
  $('#app').hidden = false;
  let appVersion = session.version;
  try { appVersion = window.Native?.version?.() || appVersion; } catch { /* fuori dall'app vale quella della pagina */ }
  $('#version').textContent = `v${appVersion}`;
  $('#demoBar').hidden = !session.demo;
  state.session = session;
  const fromBank = new URLSearchParams(location.search).get('banca');
  if (fromBank) {
    const [kind, ...rest] = fromBank.split(':');
    toast(kind === 'ok' ? rest.join(':') : `Collegamento non riuscito: ${rest.join(':')}`);
    history.replaceState(null, '', location.pathname + location.hash);
  }
  try { window.Native?.syncNotifications?.(); } catch { /* fuori dall'app non ci sono notifiche */ }
  applyHash();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginError').textContent = '';
  try {
    if (local.on) {
      const host = splitServer($('#serverUrl').value);
      $('#serverUrl').value = host;
      local.server = host ? `${scheme}://${host.replace(/\/+$/, '')}` : '';
      if (!local.server) { $('#loginError').textContent = 'Scrivi l\'indirizzo del server.'; return; }
    }
    const r = await api('POST', '/api/login', { password: $('#password').value });
    if (local.on) { try { localStorage.setItem(SERVER_KEY, local.server); } catch { /* senza archivio del browser vale per questa sessione */ } }
    $('#password').value = '';
    await enter({ ...(await api('GET', '/api/session')), token: r.token });
  } catch (err) { $('#loginError').textContent = err instanceof Unauthorized ? 'Password errata.' : err.message; }
});
$('#logoutBtn').addEventListener('click', async () => { await api('POST', '/api/logout').catch(() => {}); showLogin(); });

// ------------------------------------------------------------------ opzioni

async function loadOptions() {
  loadNotifications().catch(fail);
  loadDocuments().catch(fail);
  const s = await api('GET', '/api/session');
  $('#logoutBtn').hidden = Boolean(s.open);
  $('#pwCurrent').required = !s.open; // con l'accesso libero non c'è una password attuale
  $('#serverPanel').hidden = !(window.Native?.changeServer || local.on);
}
$('#changeServerBtn').addEventListener('click', async () => {
  if (window.Native?.changeServer) return window.Native.changeServer();
  await api('POST', '/api/logout').catch(() => {});
  local.server = '';
  try { localStorage.removeItem(SERVER_KEY); } catch { /* niente da togliere */ }
  showLogin();
});
$('#pwOpen').addEventListener('click', () => { $('#pwForm').reset(); $('#pwError').textContent = ''; $('#pwDialog').showModal(); $('#pwCurrent').focus(); });
$('#pwCancel').addEventListener('click', () => $('#pwDialog').close());
$('#pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#pwError');
  err.textContent = '';
  if ($('#pwNew').value !== $('#pwRepeat').value) { err.textContent = 'Le due password nuove non coincidono.'; return; }
  try {
    const r = await api('POST', '/api/password', { current: $('#pwCurrent').value, next: $('#pwNew').value });
    try { if (window.Native?.saveToken && r.token) window.Native.saveToken(r.token); } catch { /* fuori dall'app non c'è */ }
    e.target.reset();
    $('#pwDialog').close();
    toast('Password cambiata.');
  } catch (ex) { if (ex instanceof Unauthorized) return fail(ex); err.textContent = ex.message; }
});

// ------------------------------------------------------------------ schede

const TABS = ['storico', 'movimenti', 'ricorrenti', 'budget', 'banche', 'opzioni'];
const SWIPE_TABS = ['storico', 'movimenti', 'ricorrenti', 'budget', 'banche']; // le schede tra cui si scorre col dito (Opzioni sta a parte)
// Indirizzi come «#movimenti:spesa» (li usa il widget): la scheda, e per i Movimenti il tag da filtrare, sul mese in corso.
function applyHash() {
  const [tab, arg] = (location.hash || '#storico').slice(1).split(':');
  if (tab === 'movimenti' && arg && TAGS[arg]) {
    const now = new Date();
    Object.assign(state.mv, { year: now.getFullYear(), month: now.getMonth() + 1, tag: arg, q: '', account: '' });
    $('#mvSearch').value = '';
  }
  show(tab);
}

function show(tab) {
  if (tab === 'statistiche') tab = 'storico'; // la scheda Statistiche non c'è più: il suo lavoro lo fa lo Storico
  if (tab === 'documenti') tab = 'opzioni'; // i Documenti ora stanno nelle Opzioni
  if (!TABS.includes(tab)) tab = 'storico';
  state.tab = tab;
  history.replaceState(null, '', `#${tab}`);
  for (const t of TABS) $(`#${t}`).hidden = t !== tab;
  document.querySelectorAll('.tabs [role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $('#optionsBtn').setAttribute('aria-pressed', String(tab === 'opzioni'));
  ({ storico: loadYear, movimenti: loadMoves, ricorrenti: loadRecurring, budget: loadBudget, banche: loadBanks, opzioni: loadOptions })[tab]().catch(fail);
}
document.querySelector('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; if (b.dataset.tab === 'movimenti') { state.mv.account = ''; state.mv.recurring = null; } show(b.dataset.tab); });
$('#optionsBtn').addEventListener('click', () => show('opzioni'));

// Sul telefono si scorre da una scheda all'altra con un colpo di dito orizzontale (non parte da campi, tabelle larghe o finestre aperte).
(() => {
  let start = null;
  const main = document.querySelector('main');
  main.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && !e.target.closest('input, select, textarea, .tablewrap, dialog') ? { x: t.clientX, y: t.clientY, at: Date.now() } : null;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y, quick = Date.now() - start.at < 900;
    start = null;
    const i = SWIPE_TABS.indexOf(state.tab);
    if (i < 0 || !quick || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    const next = SWIPE_TABS[i + (dx < 0 ? 1 : -1)]; // verso sinistra = scheda seguente
    if (!next) return;
    if (next === 'movimenti') { state.mv.account = ''; state.mv.recurring = null; }
    show(next);
    window.scrollTo(0, 0);
    // la scheda nuova entra dal lato verso cui si è scorso
    try { main.animate([{ transform: `translateX(${dx < 0 ? 36 : -36}px)`, opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'ease-out' }); } catch { /* senza animazione */ }
  }, { passive: true });
  main.addEventListener('touchcancel', () => { start = null; }, { passive: true });
})();
window.addEventListener('hashchange', () => { if (!$('#app').hidden) applyHash(); });

const yearOptions = (years, current) => {
  const list = [...new Set([...years, THIS_YEAR, current])].sort((a, b) => b - a);
  return list.map((y) => `<option value="${y}" ${y === current ? 'selected' : ''}>${y}</option>`).join('');
};

// ------------------------------------------------------------------ storico

async function loadYear() {
  const d = await api('GET', `/api/summary?year=${state.year}`);
  $('#yearSelect').innerHTML = yearOptions(d.years, state.year);
  const t = d.total;
  const tone = (n) => (n >= 0 ? 'pos' : 'neg');
  $('#yearCards').innerHTML = `
    <div class="card"><div class="k">Entrate</div><div class="v pos">${money(t.entrate)}</div></div>
    <div class="card"><div class="k">Uscite</div><div class="v neg">${money(t.uscite)}</div></div>
    <div class="card"><div class="k">Bilancio</div><div class="v ${tone(t.bilancio)}">${money(t.bilancio)}</div></div>`;
  const cell = (n, cls = '') => `<td class="num ${n ? cls : 'zero'}">${n ? money(n) : '–'}</td>`;
  const rows = d.months.map((m) => {
    const open = state.open.has(m.month);
    const empty = !m.entrate && !m.uscite;
    // le uscite del mese, una categoria per riga dalla più grande: nome, barra bianca larga quanto pesa sulle uscite (importi veri) e importo; un tocco apre i movimenti
    const cats = Object.entries(m.uscite ? { utenze: 0, ...m.tags } : m.tags).sort((a, b) => b[1] - a[1]); // «Utenze» c'è sempre, anche a zero
    // tutte le barre del mese hanno la stessa scala in euro (la più grande tra entrate e uscite = tutta la barra) e una tacca sottile ogni 250 euro
    const scale = Math.max(m.entrate, m.uscite, 1);
    const tick = (250 / scale) * 100; // passo delle tacche, in % della barra (se è troppo fitto non si disegnano)
    const row = (k, name, v, extra = '') => `<button class="chip${extra}" data-see="${k}" data-see-month="${m.month}" title="Vedi i movimenti">
      <span class="cname">${icon(k)}${esc(name)}</span><span class="cbar"${tick >= 1.5 ? ` style="--tick:${tick}%"` : ''}><i style="width:${(v / scale) * 100}%"></i></span><span class="camt">${money(v)}</span></button>`;
    // la riga delle entrate del mese (in verde), poi le categorie delle uscite
    const entrate = m.entrate || m.uscite ? row('entrata', 'Entrate', m.entrate, ' in') : '';
    const subs = Object.entries(m.subs ?? {});
    const catRows = cats.map(([k, v]) => row(k, TAGS[k] ?? k, v) + subs.filter(([sk]) => SUB_PARENT[sk] === k).map(([sk, sv]) => row(sk, TAGS[sk] ?? sk, sv, ' sub')).join('')).join('');
    const tags = entrate || cats.length ? `<div class="legend">${entrate}${catRows}</div>` : '';
    const undef = (m.tags.non_definito ?? 0) > 0 ? ' undef' : ''; // il mese ha movimenti «Non definito»: la riga si colora di giallo
    return `<tr class="m${undef}" data-month="${m.month}"><th scope="row">${MONTHS[m.month - 1]}</th>${cell(m.entrate, 'pos')}${cell(m.uscite, 'neg')}${empty ? '<td class="num zero">–</td>' : `<td class="num ${tone(m.bilancio)}"><b>${money(m.bilancio)}</b></td>`}</tr>`
      + (open ? `<tr class="detail"><td colspan="4">${tags || 'Nessun movimento.'}</td></tr>` : '');
  }).join('');
  $('#yearTable').innerHTML = `<thead><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Bilancio</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th>Totale</th><td class="num pos">${money(t.entrate)}</td><td class="num neg">${money(t.uscite)}</td><td class="num ${tone(t.bilancio)}">${money(t.bilancio)}</td></tr></tfoot>`;
}
$('#yearSelect').addEventListener('change', (e) => { state.year = Number(e.target.value); loadYear().catch(fail); });
$('#yearTable').addEventListener('click', (e) => {
  const see = e.target.closest('[data-see]');
  if (see) { // «Vedi movimenti»: la scheda Movimenti già filtrata per quell'anno, mese e categoria
    Object.assign(state.mv, { year: state.year, month: Number(see.dataset.seeMonth), tag: see.dataset.see, q: '', account: '' });
    $('#mvSearch').value = '';
    return show('movimenti');
  }
  const tr = e.target.closest('tr.m');
  if (!tr) return;
  const m = Number(tr.dataset.month);
  if (state.open.has(m)) state.open.delete(m); else state.open.add(m);
  loadYear().catch(fail);
});

// ------------------------------------------------------------------ movimenti

// Si mostrano sempre 100 movimenti alla volta: se ce ne sono di più, in fondo c'è «Mostra altro» (altri 100 ogni volta).
const MORE = 100;
async function loadMoves(keep = false) {
  const { year, month, tag, q } = state.mv;
  const base = `/api/transactions?year=${year}&month=${month}&tag=${tag}&q=${encodeURIComponent(q)}&account=${encodeURIComponent(state.mv.account)}&recurring=${encodeURIComponent(state.mv.recurring?.key ?? '')}&sort=${state.mv.sort}&dir=${state.mv.dir}`;
  const [d, sum] = await Promise.all([
    api('GET', `${base}&limit=1000&offset=0`),
    api('GET', `/api/summary?year=${year}`),
  ]);
  TAGS = withNames(d.tags);
  // Con un server più vecchio (senza ordinamento e totali) la pagina si arrangia da sola sui movimenti che ha ricevuto.
  if (!d.totals) {
    d.totals = { entrate: 0, uscite: 0 };
    for (const t of d.transactions) if (t.tag !== 'giroconto') { if (t.amount > 0) d.totals.entrate += t.amount; else d.totals.uscite -= t.amount; }
  }
  if (!d.sort) {
    const key = { date: (t) => t.date, amount: (t) => t.amount }[state.mv.sort];
    const mul = state.mv.dir === 'asc' ? 1 : -1;
    d.transactions.sort((a, b) => (typeof key(a) === 'number' ? key(a) - key(b) : String(key(a)).localeCompare(String(key(b)))) * mul || b.date.localeCompare(a.date));
  }
  // filtro per conto o pocket (si arriva dalla scheda Banche): si vede e si toglie con un tocco
  const bar = $('#mvAccount');
  bar.hidden = !d.account && !state.mv.recurring;
  if (state.mv.recurring) bar.innerHTML = `Pagamenti ricorrenti: <b>${esc(state.mv.recurring.name)}</b> <button class="link" data-clearaccount="1">Togli il filtro</button>`;
  else if (d.account) bar.innerHTML = `Conto o pocket: <b>${esc(d.account.name)}</b> <button class="link" data-clearaccount="1">Togli il filtro</button>`;
  $('#mvYear').innerHTML = `<option value="0">Tutti</option>${yearOptions(sum.years, year)}`;
  $('#mvMonth').innerHTML = `<option value="0">Tutti</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === month ? 'selected' : ''}>${m}</option>`).join('')}`;
  // il filtro ha solo le categorie principali (il filtro su una categoria include già le sue sotto categorie); una sotto categoria compare solo se è quella già scelta (si arriva dal dettaglio dello Storico)
  $('#mvTag').innerHTML = `<option value="">Tutti</option>${Object.entries(TAGS).filter(([k]) => !SUB_PARENT[k] || k === tag).map(([k, v]) => `<option value="${k}" ${k === tag ? 'selected' : ''}>${esc(tagLabel(k, v))}</option>`).join('')}`;
  // la riga informativa: quanti movimenti e il totale; con il filtro «Entrata» le entrate, con gli altri filtri le uscite, senza filtro entrambe
  // le cifre (numero dei movimenti, entrate, uscite) in bianco, il resto del testo in grigio
  const sums = tag === 'entrata' ? `entrate <b>${money(d.totals.entrate)}</b>` : tag ? `uscite <b>${money(d.totals.uscite)}</b>` : `entrate <b>${money(d.totals.entrate)}</b> · uscite <b>${money(d.totals.uscite)}</b>`;
  $('#mvSummary').innerHTML = d.total
    ? `<b>${d.total}</b> movimenti${d.totals.unassigned ? ` · <span class="red">${d.totals.unassigned} da assegnare</span>` : ''} · ${sums}`
    : 'Nessun movimento. Collega una banca dalla scheda Banche.';
  // sotto la riga, ognuno sopra la sua colonna: «Data» e «Importo», da toccare per ordinare (un secondo tocco inverte il verso)
  const head = (k, label, cls) => {
    const on = state.mv.sort === k;
    const arrow = on ? (state.mv.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return `<button class="sortbtn ${cls}${on ? ' on' : ''}" data-sort="${k}" aria-pressed="${on}" title="Ordina per ${label.toLowerCase()}">${label}${arrow}</button>`;
  };
  $('#mvSort').innerHTML = `${head('date', 'Data', 's-date')}${head('amount', 'Importo', 's-amt')}`;
  state.mv.items = d.transactions;
  state.mv.total = d.total;
  state.mv.base = base;
  state.mv.paged = 'offset' in d; // un server più vecchio non sa dare altre pagine
  state.mv.shown = keep ? Math.max(MORE, state.mv.shown) : MORE;
  await ensureMoves();
  renderMovesList();
}

/** Apre il foglio di assegnazione per un movimento dell'elenco e, a cose fatte, ricarica l'elenco. */
function assignFromMove(t) {
  openAssign({ id: t.id, title: t.customName || t.remittance || t.description, date: t.date, amount: -t.amount, account: t.accountName, current: t.recurring?.key }, { after: () => loadMoves(true).catch(fail) });
}

/** Carica dal server altre pagine di movimenti se ne servono per mostrare quanti se ne chiedono. */
async function ensureMoves() {
  const m = state.mv;
  const want = Math.min(m.shown, m.total);
  while (m.paged && m.items.length < want) {
    const more = await api('GET', `${m.base}&limit=1000&offset=${m.items.length}`);
    if (!more.transactions.length) break;
    m.items = m.items.concat(more.transactions);
  }
}

function renderMovesList() {
  // la lista principale ha solo le categorie; le sotto categorie si scelgono a parte, dalla targhetta sotto il tag
  const options = (sel) => Object.entries(TAGS).filter(([k]) => !SUB_PARENT[k]).map(([k, v]) => `<option value="${k}" ${k === parentTag(sel) ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const subOptions = (parent, sel) => `<option value="">Nessuna</option>${Object.keys(SUB_PARENT).filter((k) => SUB_PARENT[k] === parent && TAGS[k]).map((k) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(TAGS[k])}</option>`).join('')}`;
  const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const rows = state.mv.items.slice(0, state.mv.shown);
  $('#mvList').innerHTML = rows.map((t) => {
    const bankName = { revolut: 'Revolut', unicredit: 'UniCredit', busta: 'Busta paga' }[t.bank] ?? t.bank;
    const where = `${bankName} · ${t.accountName}`;
    const original = t.remittance || t.description; // la causale se c'è, altrimenti il nome
    const title = t.customName || original; // il nome scelto a mano vince
    const dest = t.party && t.party !== title && t.party !== original ? t.party : ''; // il destinatario (o chi paga)
    const was = t.customName && t.customName !== original ? `originale: ${original}` : ''; // se l'hai rinominato, si vede com'era
    const pill = t.pending ? '<span class="pill warn">in sospeso</span>' : '';
    const amt = `<span class="amt ${t.amount > 0 ? 'in' : ''}">${t.amount > 0 ? '+' : ''}${money(t.amount)}</span>`;
    // i movimenti «Ricorrente» mostrano a chi sono assegnati (chip pieno) o che sono da assegnare (chip rosso); un tocco apre il foglio
    // (stile A: il chip sta sotto il tag, nella colonna di destra; sul web a sinistra del tag)
    const chip = t.tag === 'ricorrente' && 'recurring' in t ? `<button class="rchip ${t.recurring ? 'fill' : 'todo'}" data-assign-tx="${t.id}" title="${t.recurring ? 'Assegnato a ' + esc(t.recurring.name) + ': tocca per cambiare' : 'Assegna a un ricorrente'}"><span>${t.recurring ? esc(t.recurring.name) : 'Da assegnare'}</span></button>` : '';
    // targhetta della sotto categoria (pieno = scelta, grigio = da scegliere), per le categorie che ne hanno
    const par = parentTag(t.tag);
    const hasSubs = Object.keys(SUB_PARENT).some((k) => SUB_PARENT[k] === par && TAGS[k]);
    const subChip = hasSubs ? `<label class="rchip schip ${SUB_PARENT[t.tag] ? 'fill' : 'alt'}"><span>${SUB_PARENT[t.tag] ? esc(TAGS[t.tag]) : 'Sotto cat.'}</span><select data-sub="${t.id}" aria-label="Sotto categoria di ${esc(t.description)}">${subOptions(par, t.tag)}</select></label>` : '';
    const select = `<select data-tag="${t.id}" aria-label="Tag di ${esc(t.description)}" style="color:var(--t-${t.tag})">${options(t.tag)}</select>`;
    return `<div class="mv${t.pending ? ' pending' : ''}">
      <div class="d-date"><b>${shortDate(t.date)}</b><small>${t.date.slice(0, 4)}</small></div>
      <div class="d-main"><div class="d-title">${esc(title)}<button class="ren${t.customName ? ' on' : ''}" data-rename-tx="${t.id}" aria-label="Rinomina il movimento" title="Rinomina">✎</button>${pill}</div><div class="d-sub">${esc([was, dest, where].filter(Boolean).join(' · '))}</div></div>
      <div class="d-amt">${amt}</div>
      <div class="d-tag"><div class="tagbox" style="color:var(--t-${t.tag})">${icon(t.tag)}${select}</div>${chip}${subChip}</div>
    </div>`;
  }).join('');
  // «Mostra altro» in fondo, se ci sono altri movimenti da mostrare (un server vecchio ne dà al massimo 1000 e non sa dare altre pagine)
  const left = (state.mv.paged ? state.mv.total : state.mv.items.length) - rows.length;
  const more = $('#mvMore');
  more.hidden = !(left > 0);
  more.innerHTML = more.hidden ? '' : '<button class="ghost" data-more="1">Mostra altro</button>';
}
$('#movimenti').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.id === 'mvYear') state.mv.year = Number(el.value);
  else if (el.id === 'mvMonth') state.mv.month = Number(el.value);
  else if (el.id === 'mvTag') state.mv.tag = el.value;
  else if (el.dataset.tag || el.dataset.sub) { // categoria dalla lista principale, sotto categoria dalla targhetta (vuota = torna alla categoria)
    const id = el.dataset.tag || el.dataset.sub;
    const it = state.mv.items.find((x) => x.id === id);
    const value = el.dataset.sub ? (el.value || parentTag(it?.tag)) : el.value;
    try {
      await api('PUT', `/api/transactions/${id}/tag`, { tag: value });
      if (it) { it.tag = value; if (value === 'ricorrente') it.recurring = null; else delete it.recurring; }
      toast(`Tag: ${TAGS[value]}`);
      if (value === 'ricorrente' && it) { renderMovesList(); assignFromMove(it); return; }
      if (state.mv.tag) { await loadMoves(true); return; }
      renderMovesList();
    } catch (err) { fail(err); }
    return;
  } else return;
  loadMoves().catch(fail);
});
let searchTimer;
$('#movimenti').addEventListener('click', async (e) => {
  const ren = e.target.closest('[data-rename-tx]');
  if (ren) { // rinomina un movimento: vale per quel solo movimento
    const t = state.mv.items.find((x) => x.id === ren.dataset.renameTx);
    if (!t) return;
    const name = prompt('Nome del movimento (vuoto = nome della banca):', t.customName || t.remittance || t.description);
    if (name === null) return;
    try {
      const r = await api('PUT', `/api/transactions/${t.id}/name`, { name });
      t.customName = r.name;
      renderMovesList();
      toast(r.name ? 'Movimento rinominato.' : 'Nome della banca ripristinato.');
    } catch (err) { fail(err); }
    return;
  }
  const as = e.target.closest('[data-assign-tx]');
  if (as) { const t = state.mv.items.find((x) => x.id === as.dataset.assignTx); if (t) assignFromMove(t); return; }
  if (e.target.closest('[data-clearaccount]')) { state.mv.account = ''; state.mv.recurring = null; loadMoves().catch(fail); return; }
  if (e.target.closest('[data-more]')) { // altri 100 movimenti
    state.mv.shown += MORE;
    ensureMoves().then(renderMovesList).catch(fail);
    return;
  }
  const s = e.target.closest('[data-sort]');
  if (!s) return;
  const k = s.dataset.sort;
  const first = { date: 'desc', amount: 'desc' }; // verso di partenza di ogni colonna
  state.mv.dir = state.mv.sort === k ? (state.mv.dir === 'asc' ? 'desc' : 'asc') : first[k];
  state.mv.sort = k;
  loadMoves().catch(fail);
});
$('#mvSearch').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.mv.q = e.target.value; loadMoves().catch(fail); }, 250); });

// Un leggero tocco aptico su ogni pulsante (solo nell'app Android: sul web `Native` non c'è).
document.addEventListener('click', (e) => {
  if (!e.target.closest?.('button, summary, select, [role="button"], [role="tab"], label[for], input[type="checkbox"], input[type="radio"], .tabs a')) return;
  try { window.Native?.tick?.(); } catch { /* fuori dall'app non c'è */ }
}, true);

// ------------------------------------------------------------------ ricorrenti

// I ricorrenti li crei tu (a mano o da un movimento col tag «Ricorrente»); li serve il server (GET /api/recurring): prima gli attivi dal più vicino al più lontano, poi i non più attivi.
// Un tocco su una riga la apre: interruttore «Ancora attivo», promemoria (una notifica nel server legata al ricorrente) e link ai movimenti.
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Promemoria attivo"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15zM10 21h4"/></svg>';
state.rec = { data: null, open: null };

async function loadRecurring() {
  state.rec.pick = null; // tornando alla scheda si riparte dall'elenco
  state.rec.data = await api('GET', '/api/recurring');
  renderRecurring();
}

function recPanel(g) {
  const rm = g.reminder;
  const shortD = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  const pays = (g.payments ?? []).map((p) => `<div class="rpay"><b class="rpd">${shortD(p.date)}</b><span class="rpt">${esc(p.title)}<small>${esc(p.account)}${p.explicit ? ' · assegnato' : ''}</small></span><span class="rpa">${money(p.amount)}</span>${p.explicit ? `<button type="button" class="rx" data-unlink="${esc(p.id)}" aria-label="Scollega questo movimento" title="Scollega">×</button>` : '<span></span>'}</div>`).join('');
  const note = !g.amount ? 'Importo: si calcola dai movimenti che assegni (nessuno ancora).' : `Importo: media dei ${g.count} movimenti assegnati.`;
  const mo = (sel) => MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === sel ? 'selected' : ''}>${m}</option>`).join('');
  const reminder = !g.active ? '<p class="muted rnote">Riattivalo per impostare un promemoria.</p>'
    : !rm ? '<div class="foot"><button class="primary" type="button" data-radd>Aggiungi promemoria</button></div>'
    : `<span class="label">Promemoria</span>
    <div class="fields" style="grid-template-columns:repeat(${g.annual ? 3 : 2},minmax(0,1fr))">
      <label>Giorno <input data-rf="day" type="number" inputmode="numeric" min="1" max="31" step="1" value="${rm.day}"></label>
      ${g.annual ? `<label>Mese <select data-rf="month">${mo(rm.month || 1)}</select></label>` : ''}
      <label>Orario <input data-rf="time" type="time" value="${esc(rm.time)}"></label>
    </div>
    <label>Testo <input data-rf="text" maxlength="200" autocomplete="off" value="${esc(rm.text)}"></label>
    <p class="muted rnote">${g.annual ? 'Il promemoria suona una volta l\'anno.' : 'Il promemoria suona ogni mese.'} Sta nel server, legato a questo ricorrente.</p>
    <div class="foot"><button class="primary" type="button" data-rbtn="del">Togli promemoria</button></div>`;
  return `<div class="rpanel" data-panel="${esc(g.key)}" data-saved="${rm ? '1' : ''}" data-sday="${rm?.day ?? ''}" data-smonth="${rm?.month ?? ''}" data-stime="${esc(rm?.time ?? '')}" data-stext="${esc(rm?.text ?? '')}" data-sname="${esc(g.name)}" data-sannual="${g.annual ? 1 : 0}">
    <button type="button" class="rsw ${g.active ? 'on' : 'off'}" role="switch" aria-checked="${g.active}" data-ractive><i></i><span>${g.active ? 'Attivo' : 'Inattivo'}</span></button>
    <span class="label">Dati</span>
    <label>Nome <input data-df="name" maxlength="80" autocomplete="off" value="${esc(g.name)}"></label>
    <div class="fields" style="grid-template-columns:1fr">
      <label>Cadenza <select data-df="annual"><option value="0" ${g.annual ? '' : 'selected'}>Mensile</option><option value="1" ${g.annual ? 'selected' : ''}>Annuale</option></select></label>
    </div>
    <p class="muted rnote">${note}</p>
    <div class="foot" data-dsave hidden><button class="primary" type="button" data-dsavebtn>Salva modifiche</button></div>
    <span class="label">Movimenti collegati · ${g.count}</span>
    ${pays ? `<div class="rpays">${pays}</div>` : '<p class="muted rnote">Nessun movimento ancora: collegane uno qui sotto o dai Movimenti.</p>'}
    <div class="foot"><button class="ghost" type="button" data-pickopen>Collega altri movimenti</button></div>
    ${reminder}
    <div class="foot rlinks"><button class="link" type="button" data-rmoves>Vedi i movimenti</button>${g.manual ? '<button class="link" type="button" data-rremove>Elimina ricorrente</button>' : ''}</div>
  </div>`;
}

function recRow(g) {
  const open = state.rec.open === g.key;
  const date = g.active ? g.next : (g.last ?? g.next);
  const sub = g.annual ? `${money(g.monthly)}/mese` : ''; // l'importo al mese si vede solo per gli annuali
  // giorno e mese del pagamento · campanella (spazio vuoto senza promemoria) · targhetta ANNO (piena) o MESE · nome · importo
  return `<div class="rrow ${g.active ? '' : 'off'} ${open ? 'open' : ''}" data-rec="${esc(g.key)}" role="button" tabindex="0" aria-expanded="${open}">
    <div class="rday">${Number(date.slice(8))}<small>${MONTHS_SHORT[Number(date.slice(5, 7)) - 1]}</small></div>
    <div class="rbell">${g.reminder ? BELL : ''}</div>
    <div class="rmain"><div class="rname"><em class="tg${g.annual ? ' y' : ''}">${g.annual ? 'Anno' : 'Mese'}</em><span>${esc(g.name)}</span></div>${sub ? `<div class="rsub">${sub}</div>` : ''}</div>
    <div class="ramt">${g.amount ? money(g.amount) : '–'}</div></div>${open ? recPanel(g) : ''}`;
}

// i movimenti col tag «Ricorrente» non ancora assegnati: un chip per ricorrente suggerito, «Nuovo…» e «Altro…»
function recInbox(unassigned, groups) {
  if (!unassigned?.length) return '';
  const name = (k) => groups.find((g) => g.key === k)?.name ?? '';
  const shortD = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }).split(' ');
  return `<div class="rinbox"><div class="rsec"><span>Da assegnare</span><span>${unassigned.length}</span></div>${unassigned.map((u) => {
    const [d, m] = shortD(u.date);
    const chips = u.suggest.slice(0, 2).map((s, i) => `<button type="button" class="rchip${i === 0 ? ' fill' : ''}" data-assign-to="${esc(s.key)}" data-tx="${esc(u.id)}">${esc(name(s.key))}</button>`).join('');
    return `<div class="rinrow"><div class="rday">${d}<small>${m}</small></div><div class="rmain"><div class="rname"><span>${esc(u.title)}</span></div><div class="rsub">−${money(u.amount)} · ${esc(u.account)}</div>
      <div class="rchips">${chips}<button type="button" class="rchip alt" data-assign-open="new" data-tx="${esc(u.id)}">Nuovo…</button><button type="button" class="rchip alt" data-assign-open="" data-tx="${esc(u.id)}">Altro…</button></div></div>
      <div class="rhint">${u.suggest.length ? 'Suggerito' : ''}</div></div>`;
  }).join('')}</div>`;
}

function renderRecurring() {
  const picking = Boolean(state.rec.pick);
  $('#recMain').hidden = picking;
  $('#recPick').hidden = !picking;
  if (picking) return renderPicker();
  const { groups, totals, unassigned } = state.rec.data;
  const act = groups.filter((g) => g.active), off = groups.filter((g) => !g.active);
  // due cifre grandi, calcolate dai ricorrenti attivi: il costo fisso (i mensili) e quanto mettere da parte ogni mese per gli annuali (importo ÷ 12)
  const sumM = (list) => Math.round(list.reduce((t, g) => t + g.monthly, 0) * 100) / 100;
  const fixed = sumM(act.filter((g) => !g.annual)), reserve = sumM(act.filter((g) => g.annual));
  $('#recHero').innerHTML = `<div class="bhero"><div class="bheroh"><div><span class="label">Costo fisso mensile</span><div class="big">${money(fixed)}</div></div><div class="bdays"><span class="label">Da mettere da parte al mese</span><div class="big">${money(reserve)}</div></div></div></div>`;
  $('#recList').innerHTML = recInbox(unassigned, groups) + (groups.length
    ? `<div class="rsec"><span>Attivi · dal più vicino</span><span>${act.length}</span></div>${act.map(recRow).join('') || '<p class="muted">Nessun ricorrente attivo.</p>'}
       <div class="rsec"><span>Non più attivi</span><span>${off.length}</span></div>${off.map(recRow).join('') || '<p class="muted">Nessuno.</p>'}`
    : '<p class="muted">Ancora nessun ricorrente: aggiungine uno qui sotto, oppure scegli il tag «Ricorrente» da un movimento e crea il ricorrente da lì.</p>');
}

// ---- foglio «Assegna a un ricorrente» (dai Movimenti e dalla scheda Ricorrenti)

/** Apre il foglio per un movimento ({ id, title, date, amount (positivo), account, current }); `after` si chiama a cose fatte. */
async function openAssign(tx, { choose = '', after } = {}) {
  let ov;
  try { ov = await api('GET', `/api/recurring?tx=${encodeURIComponent(tx.id)}`); } catch (err) { return fail(err); }
  const dlg = $('#assignDialog');
  const suggested = (ov.suggest ?? []).map((s) => s.key);
  const ordered = [...ov.groups].sort((a, b) => (suggested.includes(b.key) - suggested.includes(a.key)) || (b.active - a.active));
  let value = choose || tx.current || suggested[0] || '__none';
  const why = (g) => { const s = (ov.suggest ?? []).find((x) => x.key === g.key); return s ? ` · suggerito (${s.why === 'nome' ? 'stesso nome' : 'stesso importo'})` : ''; };
  const draw = () => {
    const sel = ordered.find((g) => g.key === value);
    dlg.innerHTML = `<form method="dialog" id="assignForm">
      <div class="grab"></div><h2>Assegna a un ricorrente</h2>
      <div class="amini"><div>${esc(tx.title)}<small>${fmtDate(tx.date)} · ${esc(tx.account)}</small></div><b class="n">−${money(tx.amount)}</b></div>
      <div class="aopts">
        ${ordered.map((g) => `<label class="aopt"><span><b>${esc(g.name)}</b><small>${g.annual ? 'annuale' : 'mensile'} · ${money(g.amount)}${g.active ? '' : ' · non attivo'}${why(g)}</small></span><input type="radio" name="ak" value="${esc(g.key)}" ${value === g.key ? 'checked' : ''}><i></i></label>`).join('')}
        <label class="aopt"><span><b>+ Nuovo ricorrente da questo movimento</b><small>l'importo si calcola dai movimenti</small></span><input type="radio" name="ak" value="__new" ${value === '__new' ? 'checked' : ''}><i></i></label>
        ${value === '__new' ? `<div class="anew"><label>Nome <input id="anName" maxlength="80" autocomplete="off" value="${esc(tx.title)}"></label>
          <div class="fields two"><label>Cadenza <select id="anCad"><option value="0">Mensile</option><option value="1">Annuale</option></select></label><label>Giorno del pagamento <input id="anDay" type="number" inputmode="numeric" min="1" max="31" step="1" value="${Number(tx.date.slice(8))}"></label></div>
          <label id="anMonthRow" hidden>Mese del pagamento <select id="anMonth">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === Number(tx.date.slice(5, 7)) ? 'selected' : ''}>${m}</option>`).join('')}</select></label></div>` : ''}
        <label class="aopt"><span><b class="muted">Solo il tag, nessun ricorrente</b></span><input type="radio" name="ak" value="__none" ${value === '__none' ? 'checked' : ''}><i></i></label>
      </div>
      <p class="muted rnote">Il suggerimento viene dal nome simile o dallo stesso importo. Il movimento conta subito nello storico del ricorrente.</p>
      <div class="foot"><button class="primary" type="submit" id="anOk">${value === '__new' ? 'Crea e assegna' : value === '__none' ? 'Lascia solo il tag' : `Assegna a ${esc(sel?.name ?? '')}`}</button><button class="ghost" type="button" id="anCancel">Annulla</button></div>
    </form>`;
    dlg.querySelectorAll('input[name=ak]').forEach((r) => r.addEventListener('change', () => { value = r.value; draw(); }));
    $('#anCancel').addEventListener('click', () => dlg.close());
    $('#anCad')?.addEventListener('change', (e) => { $('#anMonthRow').hidden = e.target.value !== '1'; });
    $('#assignForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        let msg;
        if (value === '__new') {
          await api('POST', '/api/recurring', { name: $('#anName').value, annual: $('#anCad').value === '1', day: $('#anDay').value, month: $('#anMonth').value, assign: [tx.id] });
          msg = 'Ricorrente creato e movimento assegnato.';
        } else if (value === '__none') {
          await api('PUT', '/api/recurring/assign', { ids: [tx.id], key: null });
          msg = 'Movimento lasciato senza ricorrente.';
        } else {
          await api('PUT', '/api/recurring/assign', { ids: [tx.id], key: value });
          msg = `Assegnato a ${sel.name}.`;
        }
        dlg.close();
        toast(msg);
        after?.();
      } catch (err) { if (err instanceof Unauthorized) { dlg.close(); return fail(err); } toast(err.message); }
    });
  };
  draw();
  if (!dlg.open) dlg.showModal();
}

// ---- «Collega altri movimenti» dentro un ricorrente: selezione multipla
state.rec.sel = new Set();
state.rec.recent = [];
async function openPicker(key) {
  state.rec.pick = key;
  state.rec.sel = new Set();
  state.rec.q = '';
  renderRecurring();
  window.scrollTo(0, 0);
  await loadPickRecent();
}
async function loadPickRecent() {
  try {
    const d = await api('GET', `/api/transactions?year=0&month=0&q=${encodeURIComponent(state.rec.q ?? '')}&limit=60&offset=0`);
    state.rec.recent = d.transactions.filter((t) => t.amount < 0 && t.tag !== 'giroconto');
    renderPicker();
  } catch (err) { fail(err); }
}
function renderPicker() {
  const g = state.rec.data.groups.find((x) => x.key === state.rec.pick);
  if (!g) { state.rec.pick = null; return renderRecurring(); }
  const have = new Set((g.payments ?? []).map((p) => p.id));
  const un = state.rec.data.unassigned.filter((u) => !have.has(u.id));
  const unIds = new Set(un.map((u) => u.id));
  const others = state.rec.recent.filter((t) => !have.has(t.id) && !unIds.has(t.id) && t.recurring?.key !== g.key);
  const shortD = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const row = (id, date, title, sub, amount) => `<label class="pick"><input type="checkbox" data-pick="${esc(id)}" ${state.rec.sel.has(id) ? 'checked' : ''}><i></i><b class="rpd">${shortD(date)}</b><span class="rpt">${esc(title)}<small>${esc(sub)}</small></span><span class="rpa">${money(amount)}</span></label>`;
  const n = state.rec.sel.size;
  const box = $('#recPick');
  const keep = document.activeElement?.id === 'pickSearch';
  box.innerHTML = `<div class="rsec first"><span>Collega a ${esc(g.name)}</span><button type="button" class="link" id="pickCancel">Annulla</button></div>
    <label class="pickq"><input id="pickSearch" type="search" placeholder="Cerca tra i movimenti…" autocomplete="off" value="${esc(state.rec.q ?? '')}"></label>
    ${un.length ? `<span class="label">Da assegnare · suggeriti</span>${un.map((u) => row(u.id, u.date, u.title, `${u.account}${u.suggest.some((s) => s.key === g.key) ? ' · suggerito' : ''}`, u.amount)).join('')}` : ''}
    <span class="label">Altri movimenti recenti</span>
    ${others.map((t) => row(t.id, t.date, t.customName || t.remittance || t.description, `${t.accountName}${t.tag === 'ricorrente' ? ' · Ricorrente' : ''}`, -t.amount)).join('') || '<p class="muted rnote">Nessun movimento.</p>'}
    <p class="muted rnote">Si vedono prima i movimenti «Ricorrente» da assegnare. Gli altri, se li scegli, prendono il tag «Ricorrente».</p>
    <div class="rsticky"><button class="primary" type="button" id="pickOk" ${n ? '' : 'disabled'}>${n ? `Collega ${n} moviment${n === 1 ? 'o' : 'i'}` : 'Scegli almeno un movimento'}</button></div>`;
  if (keep) { const s = $('#pickSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
let pickTimer;
$('#recPick').addEventListener('input', (e) => {
  if (e.target.id !== 'pickSearch') return;
  state.rec.q = e.target.value;
  clearTimeout(pickTimer);
  pickTimer = setTimeout(() => loadPickRecent(), 250);
});
$('#recPick').addEventListener('change', (e) => {
  const id = e.target.dataset?.pick;
  if (!id) return;
  if (e.target.checked) state.rec.sel.add(id); else state.rec.sel.delete(id);
  const n = state.rec.sel.size, ok = $('#pickOk');
  ok.disabled = !n;
  ok.textContent = n ? `Collega ${n} moviment${n === 1 ? 'o' : 'i'}` : 'Scegli almeno un movimento';
});
$('#recPick').addEventListener('click', async (e) => {
  if (e.target.closest('#pickCancel')) { state.rec.pick = null; renderRecurring(); return; }
  if (!e.target.closest('#pickOk')) return;
  const key = state.rec.pick, ids = [...state.rec.sel];
  try {
    state.rec.data = await api('PUT', '/api/recurring/assign', { ids, key });
    state.rec.pick = null;
    renderRecurring();
    toast(`${ids.length} moviment${ids.length === 1 ? 'o collegato' : 'i collegati'}.`);
  } catch (err) { fail(err); }
});

// chip dei suggerimenti, «Altro…», «Nuovo…», × per scollegare e «Collega altri movimenti»
$('#recList').addEventListener('click', async (e) => {
  const to = e.target.closest('[data-assign-to]');
  if (to) return recCall('PUT', '/api/recurring/assign', { ids: [to.dataset.tx], key: to.dataset.assignTo }, 'Movimento assegnato.');
  const open = e.target.closest('[data-assign-open]');
  if (open) {
    const u = state.rec.data.unassigned.find((x) => x.id === open.dataset.tx);
    if (u) openAssign({ id: u.id, title: u.title, date: u.date, amount: u.amount, account: u.account }, { choose: open.dataset.assignOpen === 'new' ? '__new' : '', after: () => loadRecurring().catch(fail) });
    return;
  }
  const un = e.target.closest('[data-unlink]');
  if (un) return recCall('PUT', '/api/recurring/assign', { ids: [un.dataset.unlink], key: null }, 'Movimento scollegato.');
  if (e.target.closest('[data-pickopen]')) openPicker(e.target.closest('.rpanel').dataset.panel);
});

// il pulsante del promemoria è uno solo: «Togli» finché i campi sono quelli salvati, «Salva» appena ne cambi uno
function syncRecButton(panel) {
  const btn = panel.querySelector('[data-rbtn]');
  if (!btn) return;
  const v = (k) => panel.querySelector(`[data-rf="${k}"]`)?.value.trim() ?? '';
  const same = panel.dataset.saved && v('day') === panel.dataset.sday && v('time') === panel.dataset.stime && v('text') === panel.dataset.stext && (!panel.querySelector('[data-rf="month"]') || v('month') === panel.dataset.smonth);
  btn.dataset.rbtn = same ? 'del' : 'save';
  btn.textContent = same ? 'Togli promemoria' : 'Salva promemoria';
}

async function recCall(method, url, body, msg) {
  try {
    state.rec.data = await api(method, url, body);
    renderRecurring();
    if (msg) toast(msg);
  } catch (err) { fail(err); }
}

// i dati del ricorrente (nome, importo, cadenza): il pulsante «Salva modifiche» compare solo se qualcosa è cambiato
function syncRecData(panel) {
  const v = (k) => panel.querySelector(`[data-df="${k}"]`).value.trim();
  const dirty = v('name') !== panel.dataset.sname || v('annual') !== panel.dataset.sannual;
  panel.querySelector('[data-dsave]').hidden = !dirty;
}
$('#recList').addEventListener('input', (e) => { const p = e.target.closest('.rpanel'); if (!p) return; if (e.target.dataset.rf) syncRecButton(p); if (e.target.dataset.df) syncRecData(p); });
$('#recList').addEventListener('change', (e) => {
  const pn = e.target.closest('.rpanel');
  if (pn && e.target.dataset.rf) syncRecButton(pn);
  if (pn && e.target.dataset.df) syncRecData(pn);
});
$('#recList').addEventListener('click', async (e) => {
  const panel = e.target.closest('.rpanel');
  if (panel) {
    const key = panel.dataset.panel;
    const g = state.rec.data.groups.find((x) => x.key === key);
    const btn = e.target.closest('[data-rbtn]');
    if (btn) {
      const v = (k) => panel.querySelector(`[data-rf="${k}"]`)?.value.trim();
      if (btn.dataset.rbtn === 'del') return recCall('DELETE', `/api/recurring/${encodeURIComponent(key)}/reminder`, null, 'Promemoria tolto.');
      return recCall('PUT', `/api/recurring/${encodeURIComponent(key)}/reminder`, { text: v('text'), day: v('day'), month: v('month'), time: v('time') }, 'Promemoria salvato.');
    }
    const sw = e.target.closest('[data-ractive]');
    if (sw) { // lo stato cambia subito sotto il dito, poi il server conferma
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', String(on)); sw.classList.toggle('on', on); sw.classList.toggle('off', !on); sw.querySelector('span').textContent = on ? 'Attivo' : 'Inattivo';
      return recCall('PUT', `/api/recurring/${encodeURIComponent(key)}/active`, { active: on }, on ? 'Ricorrente attivo.' : 'Ricorrente non più attivo.');
    }
    if (e.target.closest('[data-radd]')) return recCall('PUT', `/api/recurring/${encodeURIComponent(key)}/reminder`, {}, 'Promemoria aggiunto.'); // quello di base: 3 giorni prima, alle 9
    if (e.target.closest('[data-dsavebtn]')) {
      const dv = (k) => panel.querySelector(`[data-df="${k}"]`).value.trim();
      const body = { name: dv('name'), annual: dv('annual') === '1' };
      return recCall('PUT', `/api/recurring/${encodeURIComponent(key)}`, body, 'Modifiche salvate.');
    }
    if (e.target.closest('[data-rmoves]')) {
      Object.assign(state.mv, { year: 0, month: 0, tag: '', q: '', account: '', recurring: { key, name: g.name } });
      $('#mvSearch').value = '';
      return show('movimenti');
    }
    if (e.target.closest('[data-rremove]')) {
      if (!confirm(`Eliminare «${g.name}» dai ricorrenti?`)) return;
      state.rec.open = null;
      return recCall('DELETE', `/api/recurring/${encodeURIComponent(key)}`, null, 'Ricorrente eliminato.');
    }
    return;
  }
  const row = e.target.closest('[data-rec]');
  if (!row) return;
  state.rec.open = state.rec.open === row.dataset.rec ? null : row.dataset.rec;
  renderRecurring();
});
$('#recList').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-rec]')) { e.preventDefault(); e.target.click(); } });

$('#rfMonth').innerHTML = MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
$('#rfCadence').addEventListener('change', () => { $('#rfMonthRow').hidden = $('#rfCadence').value !== '1'; });
const showRecForm = (on) => { $('#recForm').hidden = !on; $('#recAddBtn').hidden = on; if (on) { $('#rfMonthRow').hidden = $('#rfCadence').value !== '1'; $('#rfName').focus(); } };
$('#recAddBtn').addEventListener('click', () => showRecForm(true));
$('#recCancel').addEventListener('click', () => { $('#recForm').reset(); showRecForm(false); });
$('#recForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await api('POST', '/api/recurring', { name: $('#rfName').value, annual: $('#rfCadence').value === '1', day: $('#rfDay').value, month: $('#rfMonth').value });
    e.target.reset(); showRecForm(false);
    state.rec.data = r; state.rec.open = r.key;
    renderRecurring();
    toast('Ricorrente aggiunto.');
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ budget

const BRICK = 75; // euro per mattoncino delle barre del budget

async function loadBudget() {
  const d = await api('GET', '/api/budgets');
  const t = d.month.totals;
  // in cima il mese (residuo, budget, speso, giorni rimanenti); poi per ogni categoria titolo con icona, residuo, barra con tacche al 25/50/75%
  // (il livello è il residuo del budget) e il segno del ritmo (dove saresti oggi spendendo in modo uniforme), speso su budget e media 3 mesi
  // in alto residuo e giorni rimanenti (stessa dimensione); sotto tre colonne: budget e media spese (con i ricorrenti), spesa reale e spesa stimata, media entrate (verde); sotto la barra delle entrate medie divise in ricorrenti, budget e risparmio
  const stat = (label, v, dim) => `<div${dim ? ' class="dim"' : ''}><span class="label">${label}</span><span class="n">${v}</span></div>`;
  // terza colonna e barra delle entrate medie: solo se il server le dà (un server non ancora aggiornato non ha `income3`)
  const hasInc = t && t.income3 != null && t.recurring != null;
  const incomeBar = () => {
    const rec = t.recurring, bud = t.budget, sav = t.saving, tot = Math.max(t.income3, rec + bud, 1);
    const w = (v) => `${(Math.max(0, v) / tot) * 100}%`;
    const pct = (v) => (Math.max(0, v) / tot) * 100;
    return `<div class="mbar" title="Entrate medie dei 3 mesi, divise tra ricorrenti, budget e risparmio possibile">
      <div class="lab3">${rec > 0 ? `<span style="width:${w(rec)}">${money(rec)}</span>` : ''}<span style="width:${w(bud)}">${money(bud)}</span>${sav >= 0 ? `<span class="pos" style="width:${w(sav)}">${money(sav)}</span>` : `<span class="neg" style="flex:1;text-align:right">${money(sav)}</span>`}</div>
      <div class="stk">${rec > 0 ? `<i style="background:var(--mute);width:${w(rec)}"></i>` : ''}<i style="background:var(--ink);width:${w(bud)}"></i>${sav >= 0 ? `<i style="background:var(--green);width:${w(sav)}"></i>` : ''}</div>
      <div class="lab3 nm3">${rec > 0 ? `<span style="width:${w(rec)}">Ricorr.</span>` : ''}<span style="width:${w(bud)}">Budget</span>${sav >= 0 ? `<span style="width:${w(sav)}">Risparmio</span>` : `<span class="neg" style="flex:1;text-align:right">Sfora</span>`}</div></div>`;
  };
  const hero = t ? `<div class="bhero"><div class="bheroh"><div><span class="label">Residuo del mese</span><div class="big ${t.left < 0 ? 'neg' : ''}">${money(t.left)}</div></div><div class="bdays"><span class="label">Giorni rimanenti</span><div class="big">${t.daysLeft}</div></div></div>
      <div class="bstats${hasInc ? ' c3' : ''}"><div class="bcol">${stat('Budget', money(t.budget))}${t.avg3 == null ? '' : stat('Media spese', money(t.avg3), true)}</div><div class="bcol">${stat('Spesa reale', money(t.spent))}${t.pace == null ? '' : stat('Spesa stimata', money(t.pace), true)}</div>${hasInc ? `<div class="bcol"><div><span class="label">Media entrate</span><span class="n pos">${money(t.income3)}</span></div></div>${incomeBar()}` : ''}</div></div>` : '';
  const maxBudget = Math.max(1, ...Object.values(d.month.cats).map((c) => c.budget)); // scala comune: un mattoncino è largo uguale in tutte le barre
  $('#budgetCards').innerHTML = hero +Object.entries(d.month.cats).map(([k, c]) => {
    const ratio = c.budget > 0 ? c.spent / c.budget : 0;
    const leftE = c.budget > 0 ? Math.max(0, c.budget - c.spent) : 0; // la barra mostra il residuo, non la spesa
    const pace = c.pace != null && c.budget > 0 ? ((c.budget - c.pace) / maxBudget) * 100 : null; // dove sarebbe il residuo spendendo in modo uniforme
    // mattoncini da BRICK euro ciascuno (l'ultimo può essere più corto); ognuno largo quanto i suoi euro, pieno in proporzione al residuo
    const bricks = [];
    for (let at = 0; at < c.budget; at += BRICK) {
      const size = Math.min(BRICK, c.budget - at);
      bricks.push(`<b style="width:calc(${(size / maxBudget) * 100}% - 2px)"><i style="width:${Math.max(0, Math.min(1, (leftE - at) / size)) * 100}%"></i></b>`);
    }
    return `<div class="bcat"><div class="bh"><span class="bname">${icon(k)}${esc(c.label)}</span><span class="n ${c.budget && c.left < 0 ? 'neg' : ''}">${c.budget ? money(c.left) : money(c.spent)}</span></div>
      <div class="bbar${ratio > 1 ? ' over' : leftE / (c.budget || 1) < 0.25 && c.budget > 0 ? ' low' : ''}" title="Un mattoncino = ${money(BRICK)}">${bricks.join('')}${pace == null ? '' : `<em style="left:${pace}%" title="Spesa stimata a oggi: ${money(c.pace)}"></em>`}</div>
      <div class="bsub"><span>${c.budget ? `Spesi <b>${money(c.spent)}</b> di <b>${money(c.budget)}</b>` : 'Nessun budget'}</span><span>Media <b>${c.avg3 == null ? '–' : money(c.avg3)}</b></span></div></div>`;
  }).join('');
  $('#budgetFields').innerHTML = Object.entries(d.month.cats).map(([k, c]) => `<label><span>${icon(k)}${esc(c.label)}</span><input name="${k}" inputmode="decimal" placeholder="0" aria-label="Budget mensile di ${esc(c.label)} (€ al mese)" value="${d.budgets[k] || ''}"></label>`).join('');
}
const showBudgetEdit = (on) => { $('#budgetEdit').hidden = !on; $('#budgetEditBtn').hidden = on; };
$('#budgetEditBtn').addEventListener('click', () => { showBudgetEdit(true); $('#budgetFields input')?.focus(); });
$('#budgetCancel').addEventListener('click', () => { showBudgetEdit(false); loadBudget().catch(fail); });
$('#budgetForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  try { await api('PUT', '/api/budgets', body); showBudgetEdit(false); $('#budgetMsg').textContent = 'Salvato.'; setTimeout(() => { $('#budgetMsg').textContent = ''; }, 2500); await loadBudget(); } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ banche

async function loadBanks() {
  const d = await api('GET', '/api/banks');
  TAGS = withNames(d.tags ?? TAGS);
  const auto = d.lastAuto;
  const hrs = d.auto.hours;
  const pad = (h) => `${String(h).padStart(2, '0')}:00`;
  const options = (list, sel) => list.map((h) => `<option value="${h}" ${h === sel ? 'selected' : ''}>${pad(h)}</option>`).join('');
  const all = Array.from({ length: 24 }, (_, h) => h);
  const rows = hrs.map((h) => `<div class="hour"><select data-hour-edit="${h}" aria-label="Orario ${pad(h)}: cambia">${options(all.filter((x) => x === h || !hrs.includes(x)), h)}</select>
    <button class="x" data-hour-del="${h}" aria-label="Togli l'orario ${pad(h)}" title="Togli" ${hrs.length <= 1 ? 'disabled' : ''}>×</button></div>`).join('');
  const adder = hrs.length < d.auto.max
    ? `<div class="hour add"><select id="hourAdd" aria-label="Aggiungi un orario">${options(all.filter((x) => !hrs.includes(x)), -1)}</select><button class="ghost" id="hourAddBtn">Aggiungi</button></div>`
    : '';
  const autoErrors = d.lastAuto?.errors?.length ? `<p class="error">Ultimo aggiornamento automatico (${fmtDateTime(d.lastAuto.at)}): ${esc(d.lastAuto.errors.join(' · '))}</p>` : '';
  // richieste fatte alle banche nelle ultime 24 ore (le banche ne concedono 4 automatiche e 10 a mano al giorno) e quante ne restano
  const reqs = d.connections.length ? `<div class="reqs">${d.connections.map((c) => {
    const ua = c.limits.auto - c.left.auto, um = c.limits.manual - c.left.manual;
    return `<p>${esc(c.label)} <span class="dim">· Richieste automatiche</span> ${ua}/${c.limits.auto} <span class="dim">· Manuali</span> ${um}/${c.limits.manual}</p>`;
  }).join('')}</div>` : '';
  $('#syncPanel').innerHTML = `
    <h2>Aggiornamento</h2>
    <p><span class="dim">Ultimo aggiornamento</span> <b>${fmtDateTime(d.lastSync)}</b></p>
    ${reqs}
    <div class="hours">${rows}${adder}</div>
    ${autoErrors}
    <div class="foot"><button class="primary" id="syncBtn" ${d.connections.length ? '' : 'disabled'}><span class="spin" hidden></span><span>Aggiorna ora</span></button></div>`;
  $('#ebStatus').textContent = d.configured ? '· configurato' : '· da configurare';
  $('#ebRedirect').value = d.redirectUrl;
  $('#ebAppId').value = d.appId;
  $('#ebKey').placeholder = d.hasKey ? 'Chiave già salvata: lascia vuoto per tenerla' : '-----BEGIN PRIVATE KEY-----';
  if (!d.configured) $('#ebPanel').open = true;
  $('#bankList').innerHTML = d.banks.map((b) => {
    const c = d.connections.find((x) => x.bank === b.key);
    const open = state.bankOpen[b.key] ?? b.key !== 'revolut'; // Revolut ha molti pocket: di base è chiusa
    const wrap = (status, body) => `<details class="bank" data-bank="${b.key}" ${open ? 'open' : ''}><summary><h2>${esc(b.label)}</h2>${status}</summary>${body}</details>`;
    if (!c) return wrap('<span class="status no">Non collegata</span>', `<div class="foot"><button class="primary" data-link="${b.key}" ${d.configured ? '' : 'disabled'}>Collega ${esc(b.label)}</button>${d.configured ? '' : '<span class="muted">Prima configura Enable Banking qui sotto.</span>'}</div>`);
    const status = c.expired ? '<span class="status late">Consenso scaduto</span>' : `<span class="status ok">Collegata · ${c.daysLeft} giorni</span>`;
    return wrap(status, `
      <p class="muted">Ultima lettura ${fmtDateTime(c.lastSync)} · oggi restano ${c.left.auto} accessi automatici e ${c.left.manual} letture a mano.</p>
      ${c.accounts.map((a) => `<div class="acct" data-account="${esc(a.uid)}" role="button" tabindex="0" title="Tocca per vedere i movimenti di ${esc(a.name)}"><div class="n">${esc(a.name)}<div class="s">${a.main ? `Conto${a.iban ? ` · ${esc(a.iban)}` : ''}` : `Pocket · nome ${esc(a.nameSource)}`} · ${a.movements} movimenti</div></div>
        <button class="link" data-rename="${esc(a.uid)}" data-name="${esc(a.name)}">Rinomina</button></div>`).join('')}
      <div class="foot"><button class="ghost" data-link="${b.key}">${c.expired ? 'Ricollega' : 'Rinnova il consenso'}</button><button class="link danger" data-unlink="${c.id}">Scollega</button></div>`);
  }).join('');
}

$('#syncPanel').addEventListener('change', async (e) => {
  const el = e.target;
  if (!el.dataset?.hourEdit) return;
  const current = [...document.querySelectorAll('[data-hour-edit]')].map((x) => Number(x.dataset.hourEdit));
  const hours = current.map((h) => (h === Number(el.dataset.hourEdit) ? Number(el.value) : h));
  try { await api('PUT', '/api/banks/schedule', { hours }); toast('Orario cambiato.'); } catch (err) { fail(err); }
  loadBanks().catch(fail);
});
$('#bankList').addEventListener('toggle', (e) => { const k = e.target.dataset?.bank; if (k) state.bankOpen[k] = e.target.open; }, true);
$('#banche').addEventListener('click', async (e) => {
  const t = e.target.closest('button');
  if (!t) {
    // un tocco su una riga di conto o pocket apre i Movimenti filtrati per quel conto
    const row = e.target.closest('[data-account]');
    if (row) { Object.assign(state.mv, { year: THIS_YEAR, month: 0, tag: '', q: '', account: row.dataset.account }); $('#mvSearch').value = ''; show('movimenti'); }
    return;
  }
  try {
    if (t.dataset.hourDel || t.id === 'hourAddBtn') {
      const current = [...document.querySelectorAll('[data-hour-edit]')].map((x) => Number(x.dataset.hourEdit));
      const hours = t.id === 'hourAddBtn' ? [...current, Number($('#hourAdd').value)] : current.filter((h) => h !== Number(t.dataset.hourDel));
      await api('PUT', '/api/banks/schedule', { hours });
      await loadBanks();
      toast('Orari aggiornati.');
    } else if (t.id === 'syncBtn') {
      t.disabled = true; t.querySelector('.spin').hidden = false;
      try {
        const r = await api('POST', '/api/banks/sync', {});
        toast(r.errors.length ? r.errors.join(' · ') : `Aggiornato: ${r.added} nuovi movimenti.`);
      } finally { await loadBanks(); }
      window.Native?.refreshWidget?.();
    } else if (t.dataset.link) {
      t.disabled = true;
      const { url } = await api('POST', '/api/banks/link', { bank: t.dataset.link });
      location.href = url; // si va a autorizzare nel sito della banca; al ritorno l'app conclude il collegamento
    } else if (t.dataset.unlink) {
      if (!confirm('Scollegare la banca? I suoi movimenti vengono tolti da MyBank (si rileggono ricollegandola).')) return;
      await api('DELETE', `/api/banks/${t.dataset.unlink}`);
      await loadBanks();
    } else if (t.dataset.rename) {
      const name = prompt('Nome del conto o pocket (es. «01 Spesa»). Vuoto = nome automatico:', t.dataset.name);
      if (name === null) return;
      await api('PUT', `/api/banks/accounts/${encodeURIComponent(t.dataset.rename)}/name`, { name });
      await loadBanks();
    }
  } catch (err) { fail(err); loadBanks().catch(() => {}); }
});

$('#ebForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#ebError').textContent = '';
  try {
    await api('PUT', '/api/banks/app', { appId: $('#ebAppId').value, privateKey: $('#ebKey').value });
    $('#ebKey').value = '';
    toast('Enable Banking salvato.');
    await loadBanks();
  } catch (err) { if (err instanceof Unauthorized) return fail(err); $('#ebError').textContent = err.message; }
});

// ------------------------------------------------------------------ documenti (tre cartelle online)

const DOC_LABELS = { payslips: 'Buste paga', statements: 'Estratti conto', bills: 'Bollette' };
const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const openExternal = (url) => {
  try { if (window.Native?.openUrl) return window.Native.openUrl(url); } catch { /* si apre come in un browser */ }
  window.open(url, '_blank', 'noopener');
};
state.docOpen = {};
state.staged = {};

async function loadDocuments() {
  const d = await api('GET', '/api/documents');
  state.docs = Object.fromEntries(d.links.map((l) => [l.key, l]));
  $('#docGroups').innerHTML = d.links.map((l) => `<details class="group doc" data-doc="${esc(l.key)}" ${state.docOpen[l.key] ? 'open' : ''}>
    <summary><h2 class="section">${esc(l.label)}</h2></summary>
    <div class="docbody">
      <div class="doclist" data-list="${esc(l.key)}"><p class="muted">${l.url ? 'Leggo la cartella…' : 'Inserisci qui sotto il link della cartella per vedere i documenti.'}</p></div>
      ${l.url ? `<div class="docupload"><label class="ghost filebtn">Carica documenti<input type="file" multiple hidden data-pick="${esc(l.key)}"></label><div class="staged" data-staged="${esc(l.key)}"></div></div>` : ''}
      <details class="docset" ${l.url ? '' : 'open'}><summary>LINK</summary>
        <form data-links="${esc(l.key)}">
          <label>LINK della cartella (Seafile)<input name="url" type="url" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://…" value="${esc(l.url)}"></label>
          <div class="foot"><button class="primary" type="submit">Salva LINK</button></div>
        </form>
      </details>
    </div></details>`).join('');
  for (const l of d.links) { renderStaged(l.key); if (state.docOpen[l.key]) loadFolder(l.key).catch(() => {}); }
}

/** Sotto un estratto mensile: com'è andata la lettura automatica dei suoi movimenti. */
function statementNote(f, i) {
  const s = f.statement;
  if (!s) return '';
  if (s.state === 'errore') return `<p class="docnote bad">Non letto: ${esc(s.error)} <button class="link" data-retry="${i}">Riprova</button></p>`;
  if (s.state === 'banca') return '<p class="docnote">Da agosto i movimenti li legge la banca: nessuna lettura.</p>';
  if (s.state === 'letto') return `<p class="docnote">${s.count} movimenti letti${s.visible ? '' : ' · per ora non mostrati'}</p>`;
  return '<p class="docnote">In attesa di lettura…</p>';
}

/** Sotto una busta paga: com'è andata la lettura automatica del netto. */
function payslipNote(f) {
  const s = f.payslip;
  if (!s) return '';
  if (s.state === 'errore') return `<p class="docnote bad">Non letta: ${esc(s.error)}</p>`;
  if (s.state === 'banca') return '<p class="docnote">Da agosto lo stipendio lo legge la banca: nessuna lettura.</p>';
  if (s.state === 'letto') return `<p class="docnote">Netto ${money(s.amount)} · aggiunto ai movimenti</p>`;
  return '<p class="docnote">In lettura…</p>';
}

async function loadFolder(key) {
  const box = document.querySelector(`[data-list="${key}"]`);
  if (!box || !state.docs?.[key]?.url) return;
  try {
    const d = await api('GET', `/api/documents/${key}/files`);
    state.docFiles = { ...(state.docFiles ?? {}), [key]: d };
    // il server sta leggendo le buste paga in sottofondo: si ricarica l'elenco finché ha finito (si ferma se si cambia scheda o si chiude la categoria)
    clearTimeout(state.docTimer);
    if (d.busy && state.tab === 'opzioni' && state.docOpen[key]) state.docTimer = setTimeout(() => loadFolder(key).catch(() => {}), 6000);
    // gli estratti nuovi li ha appena letti il server: si dice quanti
    if (d.read?.length) toast(`Letti ${d.read.length} estratti conto nuovi${d.read.some((r) => r.error) ? ' (alcuni con errori)' : ''}.`);
    box.innerHTML = d.files.length
      ? `${d.files.map((f, i, all) => `${f.folder !== (all[i - 1]?.folder ?? '') && f.folder ? `<p class="docgroup">${esc(f.folder)}</p>` : ''}<div class="docitem"><button class="docfile" data-file="${key}:${i}"><span class="n">${esc(f.name)}</span><span class="s">${fmtSize(f.size)}${f.modified ? ` · ${esc(new Date(f.modified).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }))}` : ''}</span></button>${statementNote(f, i)}${payslipNote(f)}</div>`).join('')}
        ${d.total > d.files.length ? `<p class="muted">Mostro i primi ${d.files.length} di ${d.total}.</p>` : ''}
        <p class="muted"><button class="link" data-folder="${esc(d.folderUrl)}">Apri la cartella su Seafile</button></p>`
      : '<p class="muted">La cartella è vuota.</p>';
  } catch (err) {
    if (err instanceof Unauthorized) throw err;
    box.innerHTML = `<p class="error">${esc(err.message)}</p>`;
  }
}

function renderStaged(key) {
  const box = document.querySelector(`[data-staged="${key}"]`);
  if (!box) return;
  const list = state.staged[key] ?? [];
  box.innerHTML = list.length
    ? `${list.map((s, i) => `<div class="stagedrow"><input data-rename="${key}:${i}" value="${esc(s.name)}" aria-label="Nome del file ${i + 1}" maxlength="150"><button class="x" data-unstage="${key}:${i}" title="Togli">×</button></div>`).join('')}
       <div class="foot"><button class="primary" data-upload="${key}">Carica ${list.length === 1 ? 'il file' : `${list.length} file`}</button><span class="muted">Puoi cambiare il nome prima di caricare.</span></div>`
    : '';
}

$('#docGroups').addEventListener('toggle', (e) => {
  const key = e.target.dataset?.doc;
  if (!key) return;
  state.docOpen[key] = e.target.open;
  if (e.target.open) loadFolder(key).catch(fail);
}, true);

$('#docGroups').addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.pick) {
    const key = el.dataset.pick;
    state.staged[key] = [...(state.staged[key] ?? []), ...[...el.files].map((file) => ({ file, name: file.name }))];
    el.value = '';
    renderStaged(key);
  } else if (el.dataset.rename) {
    const [key, i] = el.dataset.rename.split(':');
    if (state.staged[key]?.[i]) state.staged[key][i].name = el.value;
  }
});

$('#docGroups').addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset?.rename) return;
  const [key, i] = el.dataset.rename.split(':');
  if (state.staged[key]?.[i]) state.staged[key][i].name = el.value;
});

$('#docGroups').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.file) { // un documento rilevato: si apre su Seafile
      const [key, i] = b.dataset.file.split(':');
      const f = state.docFiles?.[key]?.files?.[Number(i)];
      if (f) openExternal(f.url);
    } else if (b.dataset.retry !== undefined) { // rilegge a mano un estratto che non si era letto
      const f = state.docFiles?.statements?.files?.[Number(b.dataset.retry)];
      if (!f) return;
      b.disabled = true;
      try {
        const r = await api('POST', `/api/documents/statements/import?path=${encodeURIComponent(f.path ?? f.name)}`);
        toast(`${f.name}: ${r.found} movimenti letti.`);
      } finally { await loadFolder('statements'); }
    } else if (b.dataset.folder) openExternal(b.dataset.folder);
    else if (b.dataset.unstage) {
      const [key, i] = b.dataset.unstage.split(':');
      state.staged[key].splice(Number(i), 1);
      renderStaged(key);
    } else if (b.dataset.upload) {
      const key = b.dataset.upload;
      const list = state.staged[key] ?? [];
      b.disabled = true;
      let done = 0;
      try {
        for (const s of list) {
          const res = await fetch(`/api/documents/${key}/files?name=${encodeURIComponent(s.name)}`, {
            method: 'POST', body: s.file,
            headers: { 'Content-Type': s.file.type || 'application/octet-stream', ...(local.on && local.server ? { 'X-MyBank-Server': local.server } : {}) },
          });
          if (res.status === 401) throw new Unauthorized();
          const out = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`${s.name}: ${out.error ?? `errore ${res.status}`}`);
          done++;
        }
      } finally {
        state.staged[key] = list.slice(done); // quelli già caricati si tolgono
        renderStaged(key);
      }
      toast(done === 1 ? 'File caricato.' : `${done} file caricati.`);
      await loadFolder(key);
    }
  } catch (err) { fail(err); }
});

$('#docGroups').addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-links]');
  if (!form) return;
  e.preventDefault();
  const key = form.dataset.links;
  const fd = Object.fromEntries(new FormData(form).entries());
  try {
    await api('PUT', '/api/documents', { [key]: { url: fd.url } });
    toast('LINK salvato.');
    state.docOpen[key] = true;
    await loadDocuments();
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ notifiche (Opzioni)

const notify = { edit: '' };
const resetNotifyForm = () => {
  notify.edit = '';
  $('#notifyForm').reset();
  $('#nfSave').textContent = 'Aggiungi notifica';
  $('#nfCancel').hidden = true;
};
async function loadNotifications() {
  const d = await api('GET', '/api/notifications');
  $('#notifyList').innerHTML = d.notifications.length
    ? d.notifications.map((n) => `<div class="acct"><div class="n">${esc(n.text)}<div class="s">${n.month ? `Il ${n.day} ${MONTHS[n.month - 1].toLowerCase()} di ogni anno` : `Il ${n.day} di ogni mese`} · ${esc(n.time)}</div></div>
        <button class="link" data-nf-edit="${esc(n.id)}">Modifica</button><button class="link danger" data-nf-del="${esc(n.id)}">Elimina</button></div>`).join('')
    : '<p class="muted">Nessuna notifica impostata.</p>';
  notify.list = d.notifications;
  $('#notifyHint').hidden = false;
  try { window.Native?.syncNotifications?.(); } catch { /* fuori dall'app non ci sono notifiche */ }
}
$('#notifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { text: $('#nfText').value, day: Number($('#nfDay').value), time: $('#nfTime').value };
  try {
    await (notify.edit ? api('PUT', `/api/notifications/${encodeURIComponent(notify.edit)}`, body) : api('POST', '/api/notifications', body));
    toast(notify.edit ? 'Notifica salvata.' : 'Notifica aggiunta.');
    resetNotifyForm();
    await loadNotifications();
  } catch (err) { fail(err); }
});
$('#nfCancel').addEventListener('click', resetNotifyForm);
$('#notifyList').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  try {
    if (b.dataset.nfDel) {
      if (!confirm('Eliminare la notifica?')) return;
      await api('DELETE', `/api/notifications/${encodeURIComponent(b.dataset.nfDel)}`);
      if (notify.edit === b.dataset.nfDel) resetNotifyForm();
      await loadNotifications();
    } else if (b.dataset.nfEdit) {
      const n = (notify.list ?? []).find((x) => x.id === b.dataset.nfEdit);
      if (!n) return;
      notify.edit = n.id;
      $('#nfText').value = n.text; $('#nfDay').value = n.day; $('#nfTime').value = n.time;
      $('#nfSave').textContent = 'Salva modifiche';
      $('#nfCancel').hidden = false;
      $('#nfText').focus();
    }
  } catch (err) { fail(err); }
});

// ------------------------------------------------------------------ avvio

(async () => {
  try {
    const c = await fetch('/local-config.json');
    if (c.ok && (c.headers.get('content-type') ?? '').includes('json')) {
      const cfg = await c.json();
      local.on = Boolean(cfg.local);
      let saved = '';
      try { saved = localStorage.getItem(SERVER_KEY) ?? ''; } catch { /* nessun valore salvato */ }
      local.server = normServer(saved || cfg.server);
    }
  } catch { /* sul server vero non c'è: modalità normale */ }
  if (local.on && !local.server) return showLogin(); // prima si sceglie il server
  try { await enter(await api('GET', '/api/session')); } catch (e) { if (e instanceof Unauthorized || local.on) showLogin(); else toast(e.message); }
})();
