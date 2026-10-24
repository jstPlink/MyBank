# MyBank

App per monitorare i movimenti di UniCredit e Revolut (via Enable Banking) dal web e da Android, con budget, tag per pocket e widget.
Vedi README.md per le schede, i tag, il widget, l'avvio, le API e la struttura. Riscrittura da zero di Bilancio (archiviata nel ramo `archivio/bilancio`: non riusarne il codice per abitudine).

## Architettura (da rispettare)

- **Tutta la logica e tutti i dati stanno nel server** (`src/`): tag, movimenti non contabili, storico, budget e totali del Budget, aggiornamenti. Il **frontend** (`public/`) è solo grafica e chiede tutto a `/api/…`; il localhost (`npm start`) e l'app Android non hanno dati né logica propri.
- Una funzione nuova = prima l'API nel server (con un test in `test/flow.test.js`), poi la grafica. Un'API nuova richiede il server aggiornato: il frontend mostra «Il server non ha ancora questa funzione» se risponde 404.
- Il frontend è incluso nell'APK (`assets/www`): per portare una modifica grafica sul telefono basta ricostruire l'APK.

## Tecnologia

Node 24 + Express 5, dati in un file JSON (`data/mybank.json`), pagine web in HTML/CSS/JS senza dipendenze (`public/`), app Android in Java costruita senza Gradle (`scripts/build-apk.mjs`). Lingua dell'interfaccia, dei commenti e della documentazione: italiano.

## Regole di rilascio

- **Commit e push solo quando l'utente li chiede.**
- **La versione si alza solo subito prima di un commit** (una versione per commit, niente salti): `npm version <x.y.z> --no-git-tag-version` e la voce in `CHANGELOG.md` si fanno quando l'utente chiede il commit, non a ogni modifica. Tra un commit e l'altro le modifiche si accumulano nella stessa versione ancora da rilasciare (l'APK installato per provarle porta il numero dell'ultimo commit).
- **Ad ogni modifica dell'app**: esegui `npm test` e, se il telefono è collegato col debug wireless, aggiorna l'app con `npm run apk:installa`
  (l'SDK si trova da solo in `~/Android/Sdk` o `%LOCALAPPDATA%\Android\Sdk`; `adb` sta in `platform-tools` dell'SDK, non nel PATH; se il telefono non risponde prova `adb mdns services` e `adb devices -l`, e se resta muto dillo all'utente).
- **Quando l'utente chiede commit e push**: committa tutto, crea il tag `mybank-vX.Y.Z` della versione corrente e pusha anche i tag (i tag `vX.Y.Z` sono tutti della vecchia app Bilancio: non vanno riusati). Il server (NAS) si aggiorna a parte: `docker compose pull && docker compose up -d` dopo che GitHub ha costruito l'immagine.
- Semver: patch per correzioni, minor per nuove funzioni, major per cambi incompatibili.
- Non committare mai `data/`, `.env`, chiavi, password o indirizzi privati (sono in `.gitignore`): l'indirizzo del server e le password non vanno in codice, documentazione, commit o messaggi di commit.
- Dopo modifiche a `src/`, `public/` o `android/` esegui `npm test` (controlla anche che i layout del widget usino solo view ammesse nei RemoteViews: `View` no).
- **Documentazione sempre allineata**: a ogni modifica aggiorna `README.md` (e questo file se cambiano le regole) insieme a `CHANGELOG.md`.
- **A fine aggiornamenti**: ricostruisci e installa l'APK sul telefono (`npm run apk:installa`) e rilancia il localhost (`npm start`, dopo aver fermato quello vecchio) senza aspettare che l'utente lo chieda.

## Provare l'app

- `npm run demo` (banca finta + dati inventati su `http://localhost:4871`, database a parte in `data/demo`): per vedere la grafica e provare i flussi senza banche vere. Fermalo a fine prova; mai riempire di dati di prova il database vero (`data/mybank.json`) o il server dell'utente.
- **Il localhost è solo frontend e punta a un server**: `npm start` (`src/local.js`, `src/proxy.js`) serve le pagine di questa cartella e inoltra dati e login al server che l'utente sceglie nella pagina di accesso (o a `MYBANK_SERVER` del file `.env`, che precompila il campo). Tutta la logica sta nel server (`src/server.js`, avviato con `npm run server` e da Docker): non aggiungere logica o dati al frontend locale. Quando lanci l'app in localhost per l'utente usa `npm start`; l'indirizzo del server lo sceglie l'utente al login (se vuoi precompilarlo scrivilo in `.env`, una volta sola, e mai in codice, documentazione, commit o messaggi di commit).
- Se il server non ha ancora una funzione nuova (la chiamata dà errore), per far provare la grafica usa `npm run demo` su una porta a parte; non toccare il localhost collegato al server. Un processo di sfondo si ferma da solo dopo un po': se serve di nuovo, rilancialo.
- `npm run server` avvia il server completo con i dati locali in `data/` (solo per sviluppo).

## Mockup

Le proposte grafiche si fanno prima come mockup HTML in `design/` (393 px di larghezza per il telefono), **solo in tema scuro**, con dati inventati e più varianti affiancate; si implementa solo quella scelta dall'utente. L'importo di un ricorrente non si scrive mai: è la media dei movimenti assegnati.

## Estetica (regole uniche, vedi README «Estetica»)

Carta e inchiostro, un solo rosso vermiglio (più un giallo solo per i mesi dello Storico con movimenti «Non definito»), angoli vivi, filetti da 1px (2px a inizio sezione), serif per numeri e titoli, monospazio maiuscolo per le etichette. Scala del testo 11/13/15/22/34. Pulsanti e campi alti `--h`. Il widget usa un solo carattere (sans-serif), fondo inchiostro e testo carta. Nuove schermate e il widget seguono le stesse regole: niente colori o forme nuove senza aggiornare queste righe e il README.

## Prima di fare domande

Controlla README.md e questo file: avvio, configurazione e regole sono scritti lì. Fai domande solo per ciò che la documentazione non dice.
