import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server.js';
import { addMonth, billName, normalizeExtra, parseBillText } from '../src/bills.js';

test('bollette: il nome dà tipo e mese, il mese di scadenza è il successivo', () => {
  assert.deepEqual(billName('Gas 2026.08.pdf'), { type: 'Gas', from: '2026-08', to: '2026-08', due: '2026-09' });
  assert.deepEqual(billName('2026/Elettricità 2025.12.pdf'), { type: 'Elettricità', from: '2025-12', to: '2025-12', due: '2026-01' });
  assert.deepEqual(billName('Acqua 2026.02 - 2026.03.pdf'), { type: 'Acqua', from: '2026-02', to: '2026-03', due: '2026-04' });
  assert.equal(billName('hera_bolletta_0000412523003137.pdf'), null);
  assert.equal(addMonth('2026-12', 1), '2027-01');
});

test('bollette: importo e scadenza dal testo del PDF (Hera e Vodafone)', () => {
  assert.deepEqual(parseBillText('Gas 25,18\nTotale da pagare 25,18 \n...\nScadenza 28 settembre 2026\n'), { amount: 25.18, due: '2026-09-28' });
  assert.deepEqual(parseBillText('Scadenza\n12\nnovembre\n2026\nImporto totale\n28,89\nTotale da pagare\n1.028,89 \n'), { amount: 1028.89, due: '2026-11-12' });
  assert.deepEqual(parseBillText('niente'), { amount: null, due: null });
});

test('altre spese: nome, importo, ogni mese o ogni anno con il mese', () => {
  assert.deepEqual(normalizeExtra({ name: ' Affitto ', amount: '650,5', every: 'month' }, 'a', '2026-11'), { id: 'a', name: 'Affitto', amount: 650.5, every: 'month', from: '2026-11' });
  assert.deepEqual(normalizeExtra({ name: 'Tari', amount: 112, every: 'year', month: 11 }, 'b', '2026-11').month, 11);
  assert.throws(() => normalizeExtra({ name: 'Tari', amount: 1, every: 'year' }), /mese/);
  assert.throws(() => normalizeExtra({ name: '', amount: 1 }), /nome/);
  assert.throws(() => normalizeExtra({ name: 'x', amount: 'boh' }), /Importo/);
});

test('bollette e altre spese: arretrati, importi dal PDF, spunte salvate nel server', async (t) => {
  const cur = new Date().toISOString().slice(0, 7);
  const dot = (i) => addMonth(cur, i).replace('-', '.'); // il mese nel nome: AAAA.MM
  const names = [`Gas ${dot(-1)}.pdf`, `Gas ${dot(-2)}.pdf`, `Elettricità ${dot(-6)}.pdf`, 'hera_bolletta_1.pdf'];
  const months = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const fetchImpl = async (url) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/dirents/')) return new Response(JSON.stringify({ dirent_list: names.map((n) => ({ is_dir: false, file_name: n, file_path: `/${n}`, size: 100, last_modified: '2026-09-30T10:00:00+00:00' })) }), { headers: { 'Content-Type': 'application/json' } });
    const name = u.searchParams.get('p').slice(1);
    const m = billName(name);
    return new Response(`Totale da pagare ${name.startsWith('Gas') ? '25,18' : '57,00'}\nScadenza 20 ${months[Number(m.due.slice(5)) - 1]} ${m.due.slice(0, 4)}\n`);
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mybank-'));
  const { app } = createApp({ dir, password: '', fetchImpl, pdfToText: async (buf) => buf.toString() });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = async (method, url, body) => { const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: res.status, json: await res.json().catch(() => ({})) }; };

  assert.equal((await api('GET', '/api/bills')).json.configured, false);
  await api('PUT', '/api/documents', { bills: { url: 'https://seafile.test/d/BILL1/' } });
  const b = (await api('GET', '/api/bills')).json;
  assert.equal(b.from, addMonth(cur, -1)); // si tiene il conto dal mese prima del primo uso
  assert.deepEqual(b.items.map((i) => [i.name, i.due, i.paid, i.amount]), [
    [`Gas ${dot(-1)}.pdf`, cur, false, 25.18], // scade questo mese
    [`Gas ${dot(-2)}.pdf`, addMonth(cur, -1), false, 25.18], // arretrato del mese scorso
    [`Elettricità ${dot(-6)}.pdf`, addMonth(cur, -5), true, 57], // archivio: già pagata, ma l'importo si legge lo stesso
  ]);
  // spunta e importo scritto a mano
  const arrear = b.items[1].path;
  let r = await api('PUT', '/api/bills/paid', { path: arrear, paid: true });
  assert.equal(r.json.items[1].paid, true);
  r = await api('PUT', '/api/bills/paid', { path: arrear, amount: '30,5' });
  assert.deepEqual([r.json.items[1].paid, r.json.items[1].amount], [true, 30.5]);
  r = await api('PUT', '/api/bills/paid', { path: arrear, paid: false });
  assert.equal(r.json.items[1].paid, false);
  assert.equal((await api('PUT', '/api/bills/paid', { path: 'hera_bolletta_1.pdf', paid: true })).status, 404);

  // quota: la percentuale che si paga di un tipo di bolletta
  r = await api('PUT', '/api/bills/share', { percent: '50' });
  assert.deepEqual(r.json.share, 50);
  assert.equal((await api('PUT', '/api/bills/share', { percent: 150 })).status, 400);
  const { payables } = await import('../public/calc.js');
  assert.deepEqual(payables(r.json, null, cur).filter((p) => p.title === 'Gas').map((p) => [p.full, p.amount]), [[25.18, 12.59], [30.5, 15.25]]);
  assert.deepEqual((await api('PUT', '/api/bills/share', { percent: 100 })).json.share, 100);

  // altre spese
  const e1 = (await api('POST', '/api/extras', { name: 'Affitto', amount: '650', every: 'month' })).json;
  assert.deepEqual([e1.from, e1.extras[0].from, e1.extras[0].amount], [addMonth(cur, -1), cur, 650]);
  const id = e1.extras[0].id;
  assert.equal((await api('POST', '/api/extras', { name: 'Tari', amount: '112', every: 'year' })).status, 400); // manca il mese
  assert.equal((await api('PUT', `/api/extras/${id}/paid`, { month: cur, paid: true })).json.paid[`${id}:${cur}`].paid, true);
  assert.equal((await api('PUT', `/api/extras/${id}/paid`, { month: cur, amount: '700' })).json.paid[`${id}:${cur}`].amount, 700);
  assert.equal((await api('PUT', `/api/extras/${id}`, { amount: '660' })).json.extras[0].amount, 660);
  assert.equal((await api('PUT', `/api/extras/${id}/paid`, { month: 'boh' })).status, 400);
  const gone = (await api('DELETE', `/api/extras/${id}`)).json;
  assert.deepEqual([gone.extras.length, Object.keys(gone.paid).length], [0, 0]);
});
