# MyBank

App per monitorare i movimenti di UniCredit e Revolut (via Enable Banking) dal web e da Android, con budget, tag per pocket e widget.
Vedi README.md per le schede, i tag, il widget, l'avvio, le API e la struttura. Riscrittura da zero di Bilancio (archiviata nel ramo `archivio/bilancio`: non riusarne il codice per abitudine).

## Architettura (da rispettare)

- **I dati stanno nel server** (`src/`): l'elenco completo dei movimenti con tag e parametri, i budget, i ricorrenti, le notifiche, gli aggiornamenti dalle banche. Il **frontend** (`public/`, web e app Android) prende questi dati da `/api/…` e li **organizza e somma da solo** (`public/calc.js`: Storico dell'anno, cifre del Budget come la spesa totale): una cifra che si ricava dai movimenti si calcola nel frontend, così cambia senza aggiornare il server. Il localhost (`npm start`) e l'app non hanno dati propri.
- Nel server resta solo ciò che serve a chi non ha il frontend (il widget Android usa `/api/widget`) o ciò che è dato, non cifra. Una funzione nuova che richiede dati nuovi = prima l'API (con un test in `test/flow.test.js`), poi la grafica; i calcoli di `public/calc.js` si provano in `test/calc.test.js`. Un'API nuova richiede il server aggiornato: il frontend mostra «Il server non ha ancora questa funzione» se risponde 404.
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

## Estetica (regole uniche, vedi README «Estetica» e «Stile vetro»)

Stile **vetro** su tutte le schede dopo l'accesso (classe `glass` sul body): sfondo quasi nero verdastro con una sfumatura leggerissima, schede di vetro scuro (filetto chiaro, riflesso sul bordo alto, ombra morbida, angoli 22px), un solo accento lime (`--acc`; il corallo `--red` solo per uscite e avvisi), carattere **Figtree** (in `public/fonts/`, incluso nell'APK), barre tonde, targhette a pillola. Le sezioni principali (Documenti, Opzioni) sono schede con testata a fascia: collassabile = fascia piena d'accento con testo sull'accento (chiusa, la scheda è la sola fascia, stondata), non collassabile = solo una sfumatura d'accento con filetto sottile; nessuna barra verticale; il widget usa gli stessi colori (fondo quasi nero, lime per i livelli, corallo per gli avvisi) con un solo carattere sans-serif (le tinte stanno nelle costanti dei tre `MyBankWidget*.java` e nei drawable `widget_*.xml`). Scala del testo 11/13/15/22/34 (il test CSS ammette solo queste misure). La palette sta in variabili in fondo a `style.css` (una per ogni scelta di Opzioni → Aspetto, `body.glass[data-pal]`; di partenza grafite): per cambiarla o aggiungerne una si ridefiniscono lì e nell'elenco `PALETTES` di `app.js`. L'app ha anche la **modalità chiara** (`body.glass.light`, scelta in Opzioni → Aspetto): i veli sul vetro usano `rgba(var(--w), …)` (mai bianco fisso) così funzionano in entrambe. Nuove schermate seguono le stesse regole e i mockup (in `design/`) usano questo stile: niente colori o forme nuove senza aggiornare queste righe e il README.

## Prima di fare domande

Controlla README.md e questo file: avvio, configurazione e regole sono scritti lì. Fai domande solo per ciò che la documentazione non dice.
