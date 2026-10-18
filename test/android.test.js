import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Un widget è fatto di RemoteViews: il launcher gradisce solo poche classi di view (View, ad esempio, no) e, se ne trova una vietata,
// mostra «Problema nel caricamento del widget». Questo controllo evita di scoprirlo solo sul telefono.
const ALLOWED = new Set(['FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout', 'AnalogClock', 'Button', 'Chronometer', 'ImageButton', 'ImageView', 'ProgressBar', 'TextClock', 'TextView', 'ViewFlipper', 'AdapterViewFlipper', 'GridView', 'ListView', 'StackView']);
const tags = (file) => [...fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([A-Za-z][\w.]*)[\s>/]/g)].map((m) => m[1]).filter((t) => t !== 'layer-list');

for (const file of ['android/res/layout/widget_mybank.xml', 'android/res/layout/widget_mybank_preview.xml', 'android/res/layout/widget_mybank_barre.xml', 'android/res/layout/widget_mybank_barre_preview.xml', 'android/res/layout/widget_mybank_4x2.xml', 'android/res/layout/widget_mybank_4x2_preview.xml']) {
  test(`${file}: solo view ammesse nei widget`, () => {
    const bad = tags(file).filter((t) => !ALLOWED.has(t));
    assert.deepEqual(bad, []);
  });
}

test('il widget usa solo identificativi che esistono nel layout', () => {
  const java = fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget.java', 'utf8');
  const used = new Set([...java.matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]));
  const layout = fs.readFileSync('android/res/layout/widget_mybank.xml', 'utf8');
  const defined = new Set([...layout.matchAll(/@\+id\/(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((id) => !defined.has(id)), []);
  assert.ok(used.size >= 10);
});

test("il file dell'icona e il manifest puntano a risorse che esistono", () => {
  const manifest = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
  for (const ref of manifest.matchAll(/@(xml|mipmap|style)\/(\w+)/g)) {
    const [, kind, name] = ref;
    const dirs = { xml: ['android/res/xml'], mipmap: ['android/res/mipmap-anydpi-v26', 'android/res/mipmap-anydpi'], style: ['android/res/values'] }[kind];
    const found = dirs.some((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => (kind === 'style' ? fs.readFileSync(`${d}/${f}`, 'utf8').includes(`name="${name}"`) : f.startsWith(`${name}.`))));
    assert.ok(found, `${kind}/${name}`);
  }
});

test("ogni cella di categoria ha il suo nome scritto nel layout (non lo imposta il codice); le cinque celle hanno la stessa larghezza", () => {
  for (const file of ['android/res/layout/widget_mybank.xml', 'android/res/layout/widget_mybank_preview.xml']) {
    const xml = fs.readFileSync(file, 'utf8');
    for (const [key, name] of [['spesa', 'SPESA'], ['svago', 'SVAGO'], ['carburante', 'AUTO'], ['altro', 'ALTRO']]) {
      const m = new RegExp(`@\\+id/widget_${key}_label"[\\s\\S]*?android:text="([^"]*)"`).exec(xml);
      assert.equal(m?.[1], name, `${file}: nome di ${key}`);
    }
    const cells = [...xml.matchAll(/android:layout_width="0dp"\s+android:layout_height="match_parent"\s+android:layout_weight="1"/g)];
    assert.equal(cells.length, 5, file); // le cinque celle (Mese, Spesa, Svago, Auto, Altro) occupano lo stesso spazio
  }
});

test("il widget apre i Movimenti filtrati per la categoria della cella", () => {
  const java = fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget.java', 'utf8');
  assert.match(java, /"movimenti:" \+ KEYS\[i\]/);
  assert.match(java, /widget_month_cell, tap\(c, 2, "budget"\)/); // la prima cella apre il Budget
  const activity = fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8');
  assert.match(activity, /onNewIntent/);
});

test("l'APK contiene il frontend e la webview lo serve al posto di quello del server", () => {
  const build = fs.readFileSync('scripts/build-apk.mjs', 'utf8');
  assert.match(build, /cpSync\(path\.join\(root, 'public'\), path\.join\(build, 'assets', 'www'\)/);
  const activity = fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8');
  assert.match(activity, /shouldInterceptRequest/);
  for (const f of ['index.html', 'app.js', 'style.css', 'icon.svg']) assert.ok(fs.existsSync(`public/${f}`), f);
});

test('notifiche: permessi, ricevitore nel manifest, icona e ponte per la pagina', () => {
  const manifest = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
  for (const perm of ['POST_NOTIFICATIONS', 'RECEIVE_BOOT_COMPLETED', 'USE_EXACT_ALARM']) assert.match(manifest, new RegExp(`android.permission.${perm}`));
  assert.match(manifest, /android:name="\.NotifyReceiver"/);
  for (const f of ['Notifier', 'NotifyReceiver']) assert.ok(fs.existsSync(`android/src/app/mybank/mobile/${f}.java`), f);
  assert.ok(fs.existsSync('android/res/drawable/ic_notify.xml'));
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8'), /void syncNotifications\(\)/);
  assert.match(fs.readFileSync('public/app.js', 'utf8'), /Native\?\.syncNotifications/);
  assert.match(fs.readFileSync('public/app.js', 'utf8'), /Native\?\.tick/); // tocco aptico sui pulsanti
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8'), /performHapticFeedback/);
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/Notifier.java', 'utf8'), /\/api\/notifications/);
});

test("widget: ogni categoria ha un'immagine a tutta cella per il livello, il mese ha le settimane e nessun orario di aggiornamento", () => {
  const xml = fs.readFileSync('android/res/layout/widget_mybank.xml', 'utf8');
  for (const id of ['spesa_bg', 'svago_bg', 'carburante_bg', 'altro_bg', 'month_bg', 'weeks', 'days_num', 'days_text']) assert.match(xml, new RegExp(`@\\+id/widget_${id}"`), id);
  assert.doesNotMatch(xml, /widget_updated/);
  const java = fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget.java', 'utf8');
  assert.doesNotMatch(java, /lastSync|aggiornato/);
  assert.match(java, /static Bitmap weeks\(\)/);
});

test("login: un pulsante sceglie http o https e nel campo basta l'indirizzo (app e localhost)", () => {
  const activity = fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8');
  assert.match(activity, /"https:\/\/"/);
  assert.match(activity, /"http:\/\/"/);
  assert.match(fs.readFileSync('public/index.html', 'utf8'), /id="schemeBtn"/);
  assert.match(fs.readFileSync('public/app.js', 'utf8'), /setScheme/);
});

test('widget a barre (seconda versione): registrato nel manifest accanto al primo, con layout e identificativi suoi', () => {
  const manifest = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android:name="\.MyBankWidget"/);
  assert.match(manifest, /android:name="\.MyBankWidgetBarre"/);
  assert.match(fs.readFileSync('android/res/xml/widget_info_barre.xml', 'utf8'), /@layout\/widget_mybank_barre"/);
  const java = fs.readFileSync('android/src/app/mybank/mobile/MyBankWidgetBarre.java', 'utf8');
  assert.match(java, /R\.layout\.widget_mybank_barre\b/);
  const layout = fs.readFileSync('android/res/layout/widget_mybank_barre.xml', 'utf8');
  const defined = new Set([...layout.matchAll(/@\+id\/(\w+)/g)].map((m) => m[1]));
  const used = new Set([...java.matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((id) => !defined.has(id)), []);
  for (const id of ['spesa_bar', 'svago_bar', 'carburante_bar', 'altro_bar', 'weeks', 'days_num', 'days_text']) assert.ok(defined.has('widget_' + id), id);
  assert.match(java, /static Bitmap levelBar\(/);
  assert.doesNotMatch(java, /TICK|lastSync|aggiornato/); // niente tacche e niente orario di aggiornamento
  // il primo widget aggiorna anche la seconda versione
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget.java', 'utf8'), /MyBankWidgetBarre\.refreshAll/);
});

test('widget a barre: nomi nel layout e cinque celle di uguale larghezza', () => {
  for (const file of ['android/res/layout/widget_mybank_barre.xml', 'android/res/layout/widget_mybank_barre_preview.xml']) {
    const xml = fs.readFileSync(file, 'utf8');
    for (const [key, name] of [['spesa', 'SPESA'], ['svago', 'SVAGO'], ['carburante', 'AUTO'], ['altro', 'ALTRO']]) {
      const m = new RegExp(`@\\+id/widget_${key}_label"[\\s\\S]*?android:text="([^"]*)"`).exec(xml);
      assert.equal(m?.[1], name, `${file}: nome di ${key}`);
    }
    const cells = [...xml.matchAll(/android:layout_width="0dp"\s+android:layout_height="match_parent"\s+android:layout_weight="1"/g)];
    assert.equal(cells.length, 5, file);
  }
});

test('widget 4×2: registrato nel manifest, solo Spesa, Svago e Auto, striscia del mese e celle di uguale larghezza', () => {
  const manifest = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android:name="\.MyBankWidget4x2"/);
  const info = fs.readFileSync('android/res/xml/widget_info_4x2.xml', 'utf8');
  assert.match(info, /@layout\/widget_mybank_4x2"/);
  assert.match(info, /targetCellWidth="4"/);
  assert.match(info, /targetCellHeight="2"/);
  const java = fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget4x2.java', 'utf8');
  assert.match(java, /R\.layout\.widget_mybank_4x2\b/);
  assert.match(java, /static Bitmap daysStrip\(\)/);
  assert.match(java, /"movimenti:" \+ KEYS\[i\]/);
  assert.match(java, /widget_month_cell, MyBankWidget\.tap\(c, 4, "budget"\)/);
  assert.doesNotMatch(java, /widget_altro/); // niente Altro
  const layout = fs.readFileSync('android/res/layout/widget_mybank_4x2.xml', 'utf8');
  const defined = new Set([...layout.matchAll(/@\+id\/(\w+)/g)].map((m) => m[1]));
  const used = new Set([...java.matchAll(/R\.id\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].filter((id) => !defined.has(id)), []);
  assert.doesNotMatch(layout, /widget_altro/);
  for (const file of ['android/res/layout/widget_mybank_4x2.xml', 'android/res/layout/widget_mybank_4x2_preview.xml']) {
    const xml = fs.readFileSync(file, 'utf8');
    for (const [key, name] of [['spesa', 'SPESA'], ['svago', 'SVAGO'], ['carburante', 'AUTO']]) {
      const m = new RegExp(`@\\+id/widget_${key}_label"[\\s\\S]*?android:text="([^"]*)"`).exec(xml);
      assert.equal(m?.[1], name, `${file}: nome di ${key}`);
    }
    assert.equal([...xml.matchAll(/android:layout_width="0dp"\s+android:layout_height="match_parent"\s+android:layout_weight="1"/g)].length, 3, file);
  }
  // il primo widget aggiorna anche questa versione
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/MyBankWidget.java', 'utf8'), /MyBankWidget4x2\.refreshAll/);
});

test("app Android: rotazione bloccata in verticale, tocco aptico leggero con il permesso VIBRATE", () => {
  const manifest = fs.readFileSync('android/AndroidManifest.xml', 'utf8');
  assert.match(manifest, /android:screenOrientation="portrait"/);
  assert.match(manifest, /android\.permission\.VIBRATE/);
  assert.match(fs.readFileSync('android/src/app/mybank/mobile/MainActivity.java', 'utf8'), /createOneShot\(HAPTIC_MS, HAPTIC_AMPLITUDE\)/);
});

test('stile: il CSS usa solo la scala del testo 11/13/15/22/34 (niente misure in px fuori scala)', () => {
  const css = fs.readFileSync('public/style.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const sizes = [...css.matchAll(/font(?:-size)?:\s*(?:[\d.]+\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => m[1]);
  const off = sizes.filter((n) => !['11', '13', '15', '16', '22', '28', '34'].includes(n));
  assert.deepEqual(off, []);
});
