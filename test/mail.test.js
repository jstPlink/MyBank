import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { fetchMessages, parseMessage, decodeWords } from '../src/mail.js';

const pdf = Buffer.from('%PDF-1.4 Totale da pagare 25,18\nScadenza 20 novembre 2026\nGas');
const mime = `From: =?utf-8?B?SGVyYQ==?= <fatture@hera.it>\r\nSubject: La tua bolletta del gas\r\nDate: Mon, 02 Nov 2026 09:00:00 +0100\r\nContent-Type: multipart/mixed; boundary="XX"\r\n\r\n--XX\r\nContent-Type: text/plain\r\n\r\nciao\r\n--XX\r\nContent-Type: application/pdf; name="hera_bolletta_1.pdf"\r\nContent-Disposition: attachment; filename="hera_bolletta_1.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\n${pdf.toString('base64').replace(/(.{20})/g, '$1\r\n')}\r\n--XX--\r\n`;

test('mail: il messaggio MIME dà oggetto, mittente e solo i PDF', () => {
  const m = parseMessage(mime);
  assert.equal(m.subject, 'La tua bolletta del gas');
  assert.match(m.from, /^Hera/);
  assert.deepEqual(m.attachments.map((a) => [a.filename, a.data.equals(pdf)]), [['hera_bolletta_1.pdf', true]]);
  assert.equal(decodeWords('=?utf-8?Q?Elettricit=C3=A0?='), 'Elettricità');
});

test('mail: il client IMAP legge le mail nuove e salta quelle già viste', async (t) => {
  const server = net.createServer((s) => {
    s.write('* OK pronto\r\n');
    let buf = '';
    s.on('data', (d) => {
      buf += d.toString('latin1');
      for (let i; (i = buf.indexOf('\r\n')) >= 0;) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const [tag, cmd, ...rest] = line.split(' ');
        if (cmd === 'LOGIN') s.write(rest[1] === '"giusta"' ? `${tag} OK ok\r\n` : `${tag} NO no\r\n`);
        else if (cmd === 'SELECT') s.write(`* 2 EXISTS\r\n* OK [UIDVALIDITY 7] x\r\n${tag} OK ok\r\n`);
        else if (cmd === 'UID' && rest[0] === 'SEARCH') s.write(`* SEARCH 4 5\r\n${tag} OK ok\r\n`);
        else if (cmd === 'UID' && rest[0] === 'FETCH') s.write(`* 1 FETCH (UID ${rest[1]} BODY[] {${Buffer.byteLength(mime, 'latin1')}}\r\n${mime})\r\n${tag} OK ok\r\n`);
        else s.write(`${tag} OK ok\r\n`);
      }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const o = { host: '127.0.0.1', port: server.address().port, secure: false, email: 'a@gmail.com', password: 'giusta', since: '2026-10-01' };
  const r = await fetchMessages({ ...o, seen: ['7:4'] });
  assert.deepEqual([r.total, r.messages.map((m) => m.id), r.messages[0].attachments.length], [1, ['7:5'], 1]);
  await assert.rejects(fetchMessages({ ...o, password: 'sbagliata' }), /password per app/);
});

test('mail: i PDF trovati restano «da caricare» finché scegli il nome e confermi', async (t) => {
  const uploads = [];
  const fetchImpl = async (url, opt) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/upload/')) return new Response(JSON.stringify({ upload_link: 'https://seafile.test/up/1' }), { headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/up/1') { uploads.push(opt.body.get('file').name); return new Response('[]'); }
    return new Response('', { status: 404 });
  };
  const calls = [];
  const mailFetch = async (o) => { calls.push({ ...o, seen: [...o.seen] }); return o.limit === 0 || calls.length > 2 ? { messages: [], total: 0 } : { messages: [{ id: '1:9', subject: 'Bolletta gas', from: 'hera', date: new Date('2026-11-02'), attachments: [{ filename: 'x.pdf', data: pdf }] }], total: 1 }; };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mybank-'));
  const { app } = createApp({ dir, password: '', fetchImpl, mailFetch });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, url, body) => { const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) }; };

  assert.equal((await api('PUT', '/api/mail/bills', { email: 'no', password: 'x' })).status, 400);
  const saved = (await api('PUT', '/api/mail/bills', { email: 'a@gmail.com', password: 'abcd efgh' })).json;
  assert.deepEqual([saved.connected, 'password' in saved, saved.inbox], [true, false, []]);
  const r = (await api('POST', '/api/mail/bills/sync')).json;
  assert.deepEqual([r.last.imported, r.inbox.length, r.inbox[0].filename, uploads], [1, 1, 'x.pdf', []]); // niente si carica da solo
  await api('POST', '/api/mail/bills/sync');
  assert.deepEqual(calls.at(-1).seen, ['1:9']); // la mail letta non si rilegge
  const id = r.inbox[0].id;
  assert.equal((await api('POST', `/api/mail/bills/inbox/${id}/upload`, { name: 'Gas 2026.09' })).status, 400); // manca il link della cartella
  await api('PUT', '/api/documents', { bills: { url: 'https://seafile.test/d/BILL1/' } });
  const up = await api('POST', `/api/mail/bills/inbox/${id}/upload`, { name: 'Gas 2026.09' });
  assert.deepEqual([up.json.inbox, uploads], [[], ['Gas 2026.09.pdf']]);
  assert.equal((await api('DELETE', `/api/mail/bills/inbox/${id}`)).status, 400); // già caricato
  assert.equal((await api('DELETE', '/api/mail/bills')).json.connected, false);
});
