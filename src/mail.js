// Gmail: legge le mail con un allegato PDF (bollette, buste paga) con IMAP e la «password per app» di Google, senza dipendenze.
// Il server rinomina i PDF col modello scelto dall'utente e li carica nella cartella Seafile (vedi server.js).
import tls from 'node:tls';
import net from 'node:net';

const CRLF = '\r\n';
const q = (s) => `"${String(s).replace(/[\\"]/g, '\\$&')}"`;

/** Una conversazione IMAP minima: comandi con etichetta, risposte con i «literal» {n}. */
class Imap {
  constructor(socket) {
    this.socket = socket; this.buf = Buffer.alloc(0); this.n = 0; this.waiter = null; this.err = null;
    socket.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.wake(); });
    socket.on('error', (e) => { this.err = e; this.wake(); });
    socket.on('close', () => { this.err ??= new Error('Gmail ha chiuso la connessione.'); this.wake(); });
  }
  wake() { const w = this.waiter; this.waiter = null; w?.(); }
  async more() { if (this.err) throw this.err; await new Promise((r) => { this.waiter = r; }); if (this.err && !this.buf.length) throw this.err; }
  async line() { // una riga (senza CRLF)
    for (;;) {
      const i = this.buf.indexOf(CRLF);
      if (i >= 0) { const l = this.buf.subarray(0, i).toString('latin1'); this.buf = this.buf.subarray(i + 2); return l; }
      await this.more();
    }
  }
  async bytes(n) {
    while (this.buf.length < n) await this.more();
    const b = this.buf.subarray(0, n); this.buf = this.buf.subarray(n); return b;
  }
  /** Invia un comando; restituisce le risposte non etichettate: { line, literals }. Lancia se la risposta non è OK. */
  async cmd(text) {
    const tag = `A${++this.n}`;
    this.socket.write(`${tag} ${text}${CRLF}`);
    const out = [];
    for (;;) {
      let line = await this.line();
      const literals = [];
      let m;
      while ((m = /\{(\d+)\}$/.exec(line))) { literals.push(await this.bytes(Number(m[1]))); line += await this.line(); }
      if (line.startsWith(`${tag} `)) {
        if (!/^\S+ OK/i.test(line)) throw new Error(line.replace(/^\S+ /, ''));
        return out;
      }
      out.push({ line, literals });
    }
  }
}

function connect({ host, port, secure }) {
  return new Promise((resolve, reject) => {
    const s = secure ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
    s.setTimeout(60000, () => s.destroy(new Error('Gmail non risponde.')));
    s.once('error', reject);
    s.once(secure ? 'secureConnect' : 'connect', () => { s.off('error', reject); resolve(s); });
  });
}

// ---------------------------------------------------------------- lettura dei messaggi (MIME)
const split = (s) => { const i = s.indexOf('\r\n\r\n'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 4)]; };
function headersOf(text) {
  const h = {};
  for (const l of text.replace(/\r\n[ \t]+/g, ' ').split('\r\n')) { const i = l.indexOf(':'); if (i > 0) h[l.slice(0, i).toLowerCase()] ??= l.slice(i + 1).trim(); }
  return h;
}
/** «=?utf-8?B?…?=» e simili → testo. */
export function decodeWords(s) {
  return String(s ?? '').replace(/=\?([\w-]+)\?([bq])\?([^?]*)\?=/gi, (_, cs, enc, t) => {
    const buf = enc.toLowerCase() === 'b' ? Buffer.from(t, 'base64') : Buffer.from(t.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (__, x) => String.fromCharCode(parseInt(x, 16))), 'latin1');
    try { return new TextDecoder(cs).decode(buf); } catch { return buf.toString('utf8'); }
  }).replace(/\?=\s+=\?/g, '');
}
const param = (v, name) => {
  const star = new RegExp(`${name}\\*=(?:[\\w-]*'[^']*')?"?([^";]+)"?`, 'i').exec(v ?? '');
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* si prova l'altro */ } }
  const m = new RegExp(`${name}="?([^";]+)"?`, 'i').exec(v ?? '');
  return m ? decodeWords(m[1]) : '';
};

/** Un messaggio (testo grezzo in latin1) → { subject, from, date, attachments: [{ filename, data }] } con i soli PDF. */
export function parseMessage(raw) {
  const [head, body] = split(raw);
  const h = headersOf(head);
  const attachments = [];
  (function walk(headers, content) {
    const ct = headers['content-type'] ?? 'text/plain';
    const boundary = /multipart\//i.test(ct) ? param(ct, 'boundary') : '';
    if (boundary) {
      for (const part of content.split(`--${boundary}`).slice(1)) {
        if (part.startsWith('--')) break;
        const [ph, pb] = split(part.replace(/^\r\n/, ''));
        walk(headersOf(ph), pb.replace(/\r\n$/, ''));
      }
      return;
    }
    const filename = param(headers['content-disposition'], 'filename') || param(ct, 'name');
    if (/message\/rfc822/i.test(ct)) { const [ih, ib] = split(content); walk(headersOf(ih), ib); return; }
    if (!(/application\/pdf/i.test(ct) || /\.pdf$/i.test(filename))) return;
    const enc = (headers['content-transfer-encoding'] ?? '').toLowerCase();
    const data = enc === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'latin1');
    if (data.length) attachments.push({ filename: filename || 'documento.pdf', data });
  })(h, body);
  return { subject: decodeWords(h.subject), from: decodeWords(h.from), date: h.date ? new Date(h.date) : null, attachments };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const imapDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d}-${MON[m - 1]}-${y}`; };

/**
 * Le mail con PDF non ancora viste. `seen` = elenco degli id già elaborati («validità:uid»); `since` = AAAA-MM-GG; `from` = testo del mittente (facoltativo).
 * Restituisce { messages: [{ id, subject, from, date, attachments }], total } (al massimo `limit` per volta, le più vecchie prima).
 */
export async function fetchMessages({ email, password, from = '', since, seen = [], limit = 20, host = 'imap.gmail.com', port = 993, secure = true }) {
  const imap = new Imap(await connect({ host, port, secure }));
  try {
    await imap.line(); // saluto
    try { await imap.cmd(`LOGIN ${q(email)} ${q(String(password).replace(/\s+/g, ''))}`); } catch { throw new Error('Gmail non accetta l\'accesso: controlla l\'indirizzo e la password per app (non la password normale).'); }
    const sel = await imap.cmd('SELECT INBOX');
    const validity = sel.map((r) => /UIDVALIDITY (\d+)/i.exec(r.line)?.[1]).find(Boolean) ?? '1';
    const found = await imap.cmd(`UID SEARCH SINCE ${imapDate(since)}${from ? ` FROM ${q(from)}` : ''}`);
    const uids = (found.find((r) => /^\* SEARCH/i.test(r.line))?.line.replace(/^\* SEARCH\s*/i, '').split(/\s+/).filter(Boolean).map(Number)) ?? [];
    const todo = uids.filter((u) => !seen.includes(`${validity}:${u}`));
    const messages = [];
    for (const uid of todo.slice(0, limit)) {
      const r = await imap.cmd(`UID FETCH ${uid} (BODY.PEEK[])`);
      const lit = r.find((x) => x.literals.length)?.literals[0];
      if (!lit) continue;
      messages.push({ id: `${validity}:${uid}`, ...parseMessage(lit.toString('latin1')) });
    }
    await imap.cmd('LOGOUT').catch(() => {});
    return { messages, total: todo.length };
  } finally { imap.socket.destroy(); }
}
