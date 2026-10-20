# MyBank

Monitora i movimenti delle tue banche (**UniCredit** e **Revolut**, collegate con [Enable Banking](https://enablebanking.com), in sola lettura) dal **web** e dal **telefono** (app Android con widget).

> MyBank è la riscrittura da zero di Bilancio. La vecchia app è archiviata: ramo `archivio/bilancio` e tag `archivio-bilancio-v0.45.0` (in realtà punta all'ultimo stato, la 0.55.5). Per consultarla senza toccare `main`: `git worktree add ../Bilancio-archivio archivio/bilancio`.

## Come è fatta

Tre parti, con i compiti ben separati:

- **Il server** (Node + Express, `src/server.js`) ha **tutta la logica e tutti i dati**: collega le banche, legge i movimenti, assegna i tag, calcola storico, statistiche e budget, fa gli aggiornamenti automatici. Gira su un NAS (Docker) o dove vuoi.
- **Il frontend** (`public/`: HTML, CSS e JavaScript senza dipendenze) è solo grafica: chiede tutto al server (`/api/…`) e non calcola niente di importante. Lo usano il sito, il localhost e l'app Android.
- **L'app Android** (`android/`, Java, costruita senza Gradle) è una WebView che mostra il frontend (che sta **dentro l'APK**) e parla col server; in più c'è il **widget** della Home.

```
src/       server.js (API) · start.js (avvio del server) · local.js e proxy.js (localhost solo frontend)
           eb.js (client Enable Banking) · banks.js (collegamento, letture, limiti) · tags.js (tag e movimenti non contabili)
           notifications.js (notifiche) · recurring.js (pagamenti ricorrenti) · documents.js (cartelle dei documenti) · import.js, estratto.js e unicredit.js (importazione da estratto conto) · stats.js (storico, budget, widget) · auth.js (password e gettone) · schedule.js (orari) · store.js (dati)
public/    index.html, style.css, app.js, icon.svg
android/   MainActivity, MyBankWidget, MyBankWidgetBarre, MyBankWidget4x2, WidgetData, Server, Notifier, NotifyReceiver; layout e risorse del widget; manifest
scripts/   banca-finta.mjs, demo.mjs, build-apk.mjs, estratto-revolut.mjs
design/    logo scelto e tutte le proposte (SVG, con le pagine di confronto), mockup delle schede (HTML, solo tema scuro)
test/      schedule, tags, flow (giro completo con la banca finta), proxy, android (layout del widget e dell'app)
```

## Cosa fa

**Da quando.** Per ora MyBank memorizza e mostra solo i movimenti **dal 1 agosto 2026** (se la data viene anticipata, la prima lettura successiva rilegge tutto dalla nuova data): quelli di prima non si leggono né si salvano (all'avvio il server toglie dai dati quelli già presenti).

**Tag dei movimenti.** Revolut è la banca principale ed è divisa in pocket. Ogni movimento in uscita *potrebbe* prendere il tag del **pocket da cui parte**, ma **i movimenti nuovi** (letti dalla banca o importati) **restano tutti «Non definito» finché non li smisti tu** (`db.unsorted`; le entrate e i non contabili restano automatici): scegliere un tag dal menu del movimento li smista, e anche «automatico» li smista dando il tag del pocket. I movimenti già presenti non cambiano. Il tag del pocket è:

| Pocket Revolut | Tag |
|---|---|
| 01 Spesa | **Spesa** |
| 02 Svago | **Svago** |
| 03 Carburante (o 03 Auto) | **Auto** |
| 04 Altro | **Altro** |
| qualsiasi altro pocket, conto principale, UniCredit | **Non definito** (lo smisti tu) |

Il tag **Auto** si chiamava «Carburante»: la chiave interna resta `carburante`, quindi i dati e le scelte già salvate non cambiano, e il nome «Auto» si vede anche con un server non ancora aggiornato; il pocket di Revolut può chiamarsi «Carburante» o «Auto». Le **sotto categorie** si scelgono a mano, **a parte** dalla lista principale (che ha solo le categorie): sotto il tag di ogni movimento di una categoria che ne ha c'è una **targhetta** (grigia «Sotto cat.» se non l'hai scelta, piena col nome se l'hai scelta; un tocco apre l'elenco, «Nessuna» torna alla categoria): **Cibo** (sotto Spesa), **Carburante** e **Autostrada** (sotto Auto; la chiave interna `auto_carburante` evita il confronto con `carburante`, che è la categoria Auto). Contano nel totale della loro categoria (budget, widget e Storico) e il filtro su una categoria include le sue sotto categorie; nel dettaglio dei mesi dello Storico compaiono rientrate sotto la categoria (`subs` in `GET /api/summary`). I tag **Utenze** e **Ricorrente** (pagamenti che si ripetono) non sono mai assegnati in automatico: nessun movimento ci finisce da solo, li scegli tu a mano dal menu del movimento (non hanno un budget). Ogni categoria ha una piccola **icona** (nelle righe dei Movimenti, nel dettaglio dello Storico e nel Budget). Gli altri due tag sono automatici: **Entrata** (denaro che arriva da fuori) e **Non contabile** (si chiamava «Giroconto»; la chiave interna resta `giroconto`, quindi le scelte già salvate non cambiano, e il nome «Non contabile» si vede anche con un server non ancora aggiornato: denaro che sposti tra i tuoi conti e pocket, o l'addebito della carta di credito già dettagliato: non conta in nessun totale). Il tag si cambia a mano dal menu di ogni movimento (scheda Movimenti): vale per quel movimento e vince sull'automatico. Se in quel momento c'è un filtro per tag, l'elenco si aggiorna subito (il movimento cambiato sparisce se non rientra più nel filtro).
Il nome vero di un pocket la banca non lo dà (dà il nome dell'intestatario): MyBank lo ricava dal testo dei movimenti («Accredita EUR 01 Spesa da EUR») e, se serve, lo imposti a mano con **Rinomina** (scheda Banche).
Un movimento non contabile si riconosce da: testo del giro tra pocket, IBAN della controparte che è un tuo conto, oppure lo stesso importo che esce da un conto e rientra in un altro della stessa banca entro un giorno.

### Le schede

Sul telefono le schede stanno in una **barra in basso** (il segno rosso sopra quella scelta) e la pagina non scorre di lato: si passa da Storico a Movimenti, Ricorrenti, Budget e Banche **scorrendo il dito** in orizzontale (un colpo di almeno 50 px, più orizzontale che verticale; non parte da campi o tabelle larghe) e la scheda nuova entra scorrendo dal lato verso cui hai trascinato. I titoli delle schede sono a 15 px sul web e 13 sul telefono. Nell'app Android ogni pulsante dà un **tocco aptico leggero** (una vibrazione breve e debole, più lieve di un tasto della tastiera; usa il permesso `VIBRATE`, che Android concede da solo; se il telefono non regola l'intensità si ripiega sul tocco di sistema) e lo **schermo resta in verticale** (la rotazione è bloccata).

- **Storico** (principale): l'anno scelto (il selettore dice già di che anno si parla: i titoli sono solo «Entrate», «Uscite», «Bilancio»), mese per mese, con il totale; in alto i tre totali dell'anno, sempre affiancati su tre colonne. I mesi con movimenti **«Non definito»** hanno la riga **gialla**. Un tocco su un mese mostra prima la riga delle **entrate** (tutta in verde: nome, barra e importo) e poi le sue uscite **una categoria per riga** (la riga «Utenze» c'è sempre, anche a zero), dalla più grande alla più piccola: nome, una **barra bianca** (tutte le barre del mese hanno la stessa scala in euro: la più grande tra entrate e uscite è la barra intera) con una **tacca sottile ogni 250 €** per leggere meglio l'importo e l'importo, con una riga sottile sotto che la fa capire cliccabile. Un tocco su una riga (anche quella delle entrate, filtro «Entrata») apre la scheda Movimenti già filtrata per quell'anno, mese e categoria. (La scheda Statistiche non c'è più: faceva quasi lo stesso lavoro.)
- **Movimenti**: l'elenco con filtri (anno, mese, tag, ricerca; il filtro per tag elenca **solo le categorie principali** e include già le loro sotto categorie) e il tag modificabile (il menu della categoria non lascia il contorno rosso dopo il tocco). Sopra l'elenco una riga informativa, con le cifre in bianco (quanti movimenti e il totale: le **entrate** con il filtro «Entrata», le uscite con gli altri filtri, entrambe senza filtro; i totali sono su tutti i movimenti filtrati, non solo quelli mostrati, e lasciano fuori i «Non contabile») e, sotto la riga, **Data** e **Importo**, ognuno sopra la sua colonna: toccandone uno si ordina per quella colonna (data dal più recente, importo dal più alto; un secondo tocco inverte il verso, la freccia dice quale). `GET /api/transactions?sort=date|amount&dir=asc|desc&limit=&offset=`. Si mostrano sempre **100 movimenti alla volta**: se ce ne sono di più, in fondo c'è **Mostra altro** (altri 100 ogni volta). Per i movimenti col tag «Ricorrente» sotto il tag (sul web a sinistra) c'è un chip: **«Da assegnare»** in rosso oppure il **nome del ricorrente** a cui è assegnato (un tocco apre il foglio di assegnazione). Ogni riga è: **data** (giorno e mese, sotto l'anno), **titolo** (la causale se c'è) con sotto il **destinatario** e il conto, **importo**, **categoria**: sul web in quattro colonne, sul telefono in tre (data, titolo e destinatario, importo con sotto la categoria). Accanto al titolo c'è una **matita (✎)**: tocca per **rinominare quel movimento** (vale per quel solo movimento, non cambia il dato della banca, resta anche alle letture successive, si cerca per nome e sotto compare «originale: …»; nome vuoto = torna il nome della banca). I pagamenti in sospeso contano subito e hanno una targhetta e una barra rossa a sinistra; le altre righe hanno lo stesso margine, quindi la spaziatura non cambia. Toccando una riga di conto o pocket nella scheda Banche si arriva ai Movimenti filtrati per quel conto o pocket (con «Togli il filtro»).
- **Ricorrenti** (tra Movimenti e Budget): i pagamenti che si ripetono (abbonamenti, assicurazioni…). **Il server non ne riconosce nessuno da solo**: un ricorrente esiste solo se lo crei tu, con **Aggiungi ricorrente** (nome, cadenza e **solo il giorno del pagamento** se è mensile, **giorno e mese** — senza anno — se è annuale; **l'importo non si scrive**: è la media dei movimenti che assegni, `POST /api/recurring` con `day` e `month`) o da un movimento col tag «Ricorrente» (`GET /api/recurring`). In cima due cifre grandi, calcolate dai ricorrenti attivi: il **costo fisso mensile** (la somma dei mensili) e la somma **da mettere da parte al mese** (gli annuali, importo ÷ 12); sotto prima gli **attivi dal pagamento più vicino al più lontano** (**giorno e mese** del pagamento, la **campanella** del promemoria — spazio vuoto se non c'è —, la **targhetta** della cadenza prima del nome — «Anno» piena e «Mese» vuota, della stessa larghezza —, il nome e l'importo; solo per gli annuali, sotto il nome, l'importo al mese), poi i **non più attivi** in grigio. Un gruppo è attivo se l'ultimo pagamento è recente (entro 45 giorni; 400 per gli annuali), e si può forzare con l'interruttore «Ancora attivo». Un tocco su una riga la apre: l'interruttore **Attivo** (bianco, pallino a destra) / **Inattivo** (grigio, pallino a sinistra); i **dati** (nome e cadenza: il pulsante «Salva modifiche» compare solo se cambi qualcosa; **l'importo non si scrive né si modifica**); i movimenti collegati; il **promemoria**; il link «Vedi i movimenti» (apre i Movimenti filtrati su quel ricorrente: `GET /api/transactions?recurring=<chiave>`). **L'importo è sempre la media dei movimenti assegnati** (la riga dice «media dei N movimenti assegnati»; finché non ce ne sono resta «–»). Senza promemoria la riga mostra solo «Aggiungi promemoria», che crea quello **di base**: «Pagamento imminente: <nome> di <importo>», **3 giorni prima** del prossimo pagamento, alle 9:00; con un promemoria compaiono giorno, orario (e mese per gli annuali, che suonano una volta l'anno) e testo, con un solo pulsante («Togli promemoria» finché i campi sono quelli salvati, «Salva promemoria» appena ne cambi uno). **Ogni ricorrente nuovo nasce già con il promemoria di base.** Il promemoria è una **notifica nel server legata al ricorrente** (`recurringKey`): compare anche nelle Opzioni, e si toglie da sola quando il ricorrente non è più attivo. Il tag «Ricorrente» resta sempre una scelta a mano (così il budget non cambia).

  **Assegnare i movimenti ai ricorrenti.** Un movimento col tag «Ricorrente» è **da assegnare** finché non lo assegni a un ricorrente (`db.recurringLinks`, id del movimento → chiave del ricorrente) o non crei un ricorrente da lui. Un movimento assegnato conta nello storico del ricorrente (ultimo pagamento, prossimo, importo). Si assegna in tre modi: (1) **dai Movimenti**: la riga mostra un chip (rosso «Da assegnare», pieno col nome del ricorrente se assegnato; sotto il tag sul telefono, a sinistra sul web) che apre un **foglio** con il ricorrente suggerito (stesso nome o stesso importo) in cima, gli altri, «Nuovo ricorrente da questo movimento» e «Solo il tag»; il foglio si apre anche subito dopo aver scelto il tag «Ricorrente» dal menu del movimento, e la riga informativa conta i «da assegnare»; (2) **dalla scheda Ricorrenti**: in cima la casella **Da assegnare**, con un chip per ogni ricorrente suggerito (un tocco assegna), «Nuovo…» e «Altro…»; (3) **dal ricorrente**: nella riga aperta i **movimenti collegati** (× per scollegare quelli assegnati a mano) e «Collega altri movimenti», una selezione multipla (prima i «Ricorrente» da assegnare, poi gli altri recenti, con ricerca; quelli senza tag prendono il tag «Ricorrente»). Eliminare un ricorrente aggiunto a mano scollega i suoi movimenti.
- **Budget**: in cima il **residuo del mese** (in grande) con i **giorni rimanenti** a destra (stessa dimensione, un po' più grande dei numeri normali) e, sotto un filetto, **tre colonne**: a sinistra **budget** e sotto la **media spese** (media dei 3 mesi precedenti delle categorie **più i ricorrenti attivi al mese**, mensili + annuali ÷ 12), al centro **spesa reale** e sotto **spesa stimata** (il ritmo di tutte le categorie), a destra la **media entrate** (entrate medie dei 3 mesi precedenti, giroconti esclusi) in verde; media spese e stima in un grigio scuro, il resto in bianco. Sotto le colonne una **barra** dice se il budget rientra: le entrate medie divise in **ricorrenti** (grigio), **budget impostato** (inchiostro) e **risparmio possibile** (verde: entrate medie − ricorrenti − budget; se è negativo la barra si riempie e a destra compare in rosso «Sfora»), con le cifre sopra i segmenti e i nomi sotto (`totals.recurring`, `income3`, `saving`, `avg3` con i ricorrenti e `avg3Cats` senza in `GET /api/budgets`; con un server non aggiornato la terza colonna e la barra non compaiono); sotto, **una riga per categoria** (Spesa, Svago, Auto, Altro): titolo con l'icona e residuo (o «Speso» se non c'è un budget), una **barra alta a mattoncini** da **75 €** ciascuno (l'ultimo più corto se il budget non è multiplo di 75; la scala è la stessa in tutte le barre, quindi un mattoncino è largo uguale ovunque e le barre hanno lunghezze diverse, in proporzione al budget; la più grande occupa tutta la larghezza) che mostra il **residuo** (i mattoncini si svuotano da destra man mano che spendi), e un **segno rosso** che indica il **ritmo** (dove sarebbe il residuo oggi spendendo in modo uniforme, cioè quanto avresti speso: budget × giorni passati / giorni del mese; lo calcola il server, campo `pace`, e `totals` per il mese). La barra è inchiostro, rossa solo sotto il 25% di residuo (tutti i mattoncini rossi oltre il budget); il residuo è rosso se negativo. Sotto la barra: «Spesi … di …» a sinistra e la **media 3 mesi** a destra (spesa media dei 3 mesi completi precedenti, solo da quando ci sono dati). Il budget si cambia con **Modifica budget** (campi alti, uno per categoria) e «Salva budget». Solo inchiostro, carta e il rosso dell'app, niente colori per categoria. «Altro» richiede il server aggiornato (se manca, la riga non compare); il ritmo e il totale richiedono il server aggiornato (se mancano, la riga resta senza segno e il riquadro del mese non compare).
- **Documenti** (dentro le **Opzioni**, dopo le Notifiche; la sezione si chiude e si apre con un tocco sul titolo, di base chiusa): tre categorie che si chiudono e si aprono: **Buste paga**, **Estratti conto**, **Bollette**. Ognuna è una cartella su Seafile, collegata con un solo **LINK** (il link di condivisione `…/d/codice/`, salvato nel server, mai nel codice). Aprendo una categoria si vedono i **documenti rilevati** nella cartella e nelle sue **sottocartelle** (fino a 3 livelli; la radice per prima, poi le sottocartelle dalla più recente, ognuna con il suo titolo; dentro, dal più recente per nome): un tocco apre il file su Seafile (nell'app, nel browser del telefono). **Carica documenti** sceglie uno o più file dal dispositivo, ne mostra i nomi **modificabili** e li carica nella stessa cartella: Seafile lo accetta solo se il link ha il permesso di caricamento (altrimenti l'app lo dice). Sotto ogni estratto conto mensile si vede com'è andata la lettura dei suoi movimenti (vedi sotto).
- **Banche**: collegamento di UniCredit e Revolut (ogni banca si chiude e si apre; Revolut, con i suoi pocket, parte chiusa); **aggiornamento**: fino a **4 automatici al giorno**, di base alle **5, 11, 14 e 19** (ora italiana), in una riga che sul telefono occupa tutta la larghezza: si tocca un orario per cambiarlo, la × lo toglie, un menu ne aggiunge; più il pulsante **Aggiorna ora** per le letture in più. Il riquadro mostra, per ogni banca, le **richieste fatte nelle ultime 24 ore** nella forma «Revolut · Richieste automatiche 1/4 · Manuali 3/10» (le restanti sono la differenza). Poi la rinomina dei pocket e le credenziali di Enable Banking. Ogni banca ed Enable Banking sono un titolo con la riga sotto, che resta anche a sezione chiusa.
- **Opzioni** (pulsante in alto a destra): in cima le **Notifiche** (sezione che si chiude e si apre con un tocco sul titolo), poi i **Documenti** (le tre cartelle, vedi sotto), poi **Cambia password** (finestra con la password attuale e due volte la nuova, almeno 5 caratteri; da lì in poi vale la nuova, salvata come impronta in `data/auth.json`, e gli altri accessi devono rifare il login), **Server** con «Cambia server» (solo nell'app e nel localhost) e in fondo **Esci**. Ogni categoria è un titolo con la riga sotto.

In alto, a sinistra, il logo e il nome; a destra la **versione** (nell'app è quella dell'app, sul web quella del server) e il pulsante Opzioni.

### Notifiche (Opzioni → Notifiche)

Promemoria per il telefono: per ognuno scegli il **testo** (fino a 200 caratteri), il **giorno del mese** (1-31) e l'**orario**; si aggiungono, si modificano e si eliminano dalle Opzioni. Stanno **nel server** (`GET/POST /api/notifications`, `PUT/DELETE /api/notifications/:id`), non sul dispositivo; quelle dei **ricorrenti** portano `recurringKey` (il ricorrente a cui sono legate; le crea la scheda Ricorrenti, che propone «Pagamento imminente: <nome> di <importo>» 3 giorni prima del pagamento, alle 9:00) e, per i ricorrenti annuali, anche `month` (1-12): suonano una volta l'anno invece che ogni mese. Un promemoria di base che non hai mai modificato (`auto`) segue i movimenti assegnati al ricorrente; l'app Android le legge a ogni apertura, nell'aggiornamento periodico del widget e dopo ogni modifica, e le programma con l'AlarmManager (la prossima volta di ognuna: poi riprogramma da sola; anche dopo il riavvio del telefono o un aggiornamento dell'app). Nei mesi più corti il giorno 29, 30 o 31 vale l'ultimo giorno del mese. L'orario è quello del telefono. Alla prima volta Android 13+ chiede il permesso di mostrare le notifiche. Sul sito e sul localhost si gestiscono ma non suonano.

### Importazione automatica dagli estratti conto

La banca rende disponibili solo gli ultimi mesi: per quelli più vecchi MyBank legge da sola gli **estratti conto in PDF** della cartella «Estratti conto» **e delle sue sottocartelle** (per esempio una per anno). Tre tipi, riconosciuti dal nome del file:

| File | Cosa è | Come si legge |
|---|---|---|
| `Estratto conto AAAA.MM.pdf` | conto **Revolut**, mensile (conto, pocket, deposito) | testo del PDF (`pdftotext -raw`) |
| `Estratto conto AAAA.MM - AAAA.MM.pdf` | conto corrente **UniCredit**, trimestrale | coordinate delle parole (`pdftotext -bbox`): la colonna dice se un importo è un'uscita o un'entrata |
| `Estratto Conto Carte Flexia AAAA.MM.pdf` | carta di credito **UniCredit Flexia**, mensile | coordinate delle parole |

Ogni estratto **nuovo o cambiato** viene letto quando si apre l'elenco dei documenti e a ogni aggiornamento automatico delle banche: il **server** lo scarica da Seafile e ne ricava i movimenti con `pdftotext` (poppler, già nell'immagine Docker). **Controlla sempre i conti con i totali del PDF** (Revolut: saldo iniziale e finale di conto, pocket e deposito; conto UniCredit: uscite, entrate e saldo finale del riepilogo; carta: totale del mese); se non tornano registra l'errore (sotto il file, con «Riprova») e non ritenta finché il file non cambia o il lettore non migliora. Regole:
- si leggono gli estratti dei mesi **prima della data di inizio** (oggi: fino a luglio); da **agosto** in poi non si scarica né si legge nulla, perché li legge la banca;
- i movimenti letti si **salvano tutti** e si **mostrano tutti** (in Storico, Movimenti, Budget, widget); se serve nasconderne dei mesi si imposta `settings.importedVisible` (elenco dei mesi «AAAA-MM» da mostrare). Sotto ogni estratto l'app dice quanti movimenti ha letto;
- i movimenti importati **restano anche prima della data di inizio** e le letture o lo scollegamento della banca non li toccano; leggere due volte lo stesso estratto non duplica nulla;
- l'estratto Revolut non dice da quale pocket parte una spesa: i movimenti sono sul «Conto», sul «Pocket» (tutti insieme) o sul «Deposito» e le spese restano **Non definito** da smistare a mano; i giri tra conto, pocket e deposito si riconoscono come non contabili (anche la dicitura «Prelievo da Pocket»);
- **carta di credito**: l'addebito mensile sul conto UniCredit («PAGAMENTO PER UTILIZZO CARTE DI CREDITO … ESTRATTO 12/2024») è **non contabile** quando di quel mese c'è l'estratto della carta (gli acquisti sono già movimenti), altrimenti resta una spesa come le altre;
- versioni diverse di `pdftotext` scrivono gli importi con «€» o mettono più voci sulla stessa riga: il lettore Revolut le tratta allo stesso modo.

Da riga di comando (con `pdftotext` nel PATH): `node scripts/estratto-revolut.mjs "Estratto conto 2026.06.pdf" giugno.json` scrive il JSON dei movimenti Revolut (`POST /api/import`).

### Buste paga tra i movimenti (lettura automatica)

Le buste paga della cartella «Buste paga» (e delle sue sottocartelle) sono **scansioni**: il server ne legge il **netto a pagare** con il riconoscimento dei caratteri (OCR, `tesseract.js` dentro il server, senza installare altro; le pagine si ricavano con `pdftoppm`, del pacchetto `poppler-utils` dell'immagine Docker). Ogni busta **nuova o cambiata** viene letta da sola, **in sottofondo**, quando si apre l'elenco dei documenti e a ogni aggiornamento automatico delle banche, e diventa un movimento di **entrata** («Stipendio Giugno 2026», conto «Busta paga»). Sotto ogni busta l'app dice com'è andata («Netto 2.577,00 € · aggiunto ai movimenti», «In lettura…» o l'errore). Regole:
- il **mese e l'anno** si ricavano dal nome del file («Busta Paga … AAAA.MM.pdf»; «Quatt.ma» e «Tredic.ma» per quattordicesima e tredicesima); la **data** del movimento è l'ultimo giorno del mese (30 giugno e 20 dicembre per quattordicesima e tredicesima);
- il riquadro del netto si sposta un po' da una scansione all'altra: lo script legge una riga di cifre in tante finestre sovrapposte e vale l'importo letto da almeno 3 finestre. Provato sulle 59 buste 2022–2026: tutti gli importi coincidono con quelli letti a occhio. Se una busta non si legge, l'errore resta sotto il file e non si ritenta finché il file non cambia o il lettore non migliora;
- come per gli estratti conto, dalla data di inizio (agosto 2026) in poi **non si legge nulla**: lo stipendio arriva su un conto che legge la banca e si conterebbe due volte;
- importare di nuovo non duplica nulla. Attenzione ai doppi conteggi con il conto su cui lo stipendio viene accreditato, quando quel conto è caricato.

Resta `POST /api/import` per importare a mano un file di movimenti già letti (origine `busta`, `revolut` o `unicredit`), ma non serve più per le buste paga.

### Widget Android 5×1

Cinque celle **di uguale larghezza** (un solo carattere, sans-serif; fondo inchiostro scuro, tessere appena arrotondate, testo carta, rosso come accento): **Mese**, **Spesa**, **Svago**, **Auto**, **Altro**.

- **Spesa, Svago, Auto, Altro**: il **livello del residuo riempie tutta la cella, dal basso** (immagine disegnata dall'app), con una linea sul bordo del livello e tre **tacche leggere** (sottili e quasi trasparenti) al 25, 50 e 75%. Il riempimento diventa **rosso solo quando scende sotto il 25%**; il rosso di stima e reale resta nei numeri. Il **nome** e il **residuo del budget** (budget meno speso nel mese; senza centesimi sopra i 10 €) stanno su una **targhetta scura** (il testo non si mescola con il livello; il residuo è rosso con la stessa regola del livello, cioè solo sotto il 25% del budget). Sotto, in due etichette piene: «**stima**» (budget diviso i giorni del mese, al giorno) e «**reale**» (speso diviso i giorni passati, oggi compreso; bianca se è pari o migliore della stima, rossa se peggiore). Un tocco apre i **Movimenti del mese filtrati per quella categoria**. «Altro» ha un budget come le altre (scheda Budget).
- **Mese**: «**19**» in grande con accanto «**giorni rimanenti**» (stessa dimensione di «stima», centrati rispetto al numero) e, sotto, le **settimane del calendario** (una riga per settimana, lunedì-domenica, allineate al giorno vero in cui parte il mese): i giorni passati (oggi compreso) sono chiari, quelli che restano scuri; **sabato e domenica sono in rosso** (più vivo se passati, scurissimo se restano). Non c'è l'orario di aggiornamento delle banche. Un tocco apre il **Budget**.
- Si aggiorna ogni mezz'ora, quando apri l'app e quando premi «Aggiorna ora»; un tocco fuori dalle celle apre l'app. Se la sessione è scaduta il mese dice «accedi in app». Con un server non ancora aggiornato «Altro» mostra «nessun budget». Nella lista dei widget l'anteprima è con dati di esempio (da Android 15 con i dati reali).
- Un widget è fatto di *RemoteViews*: il launcher ammette solo poche classi di view (`FrameLayout`, `LinearLayout`, `ImageView`, `TextView`…; `View` no, dà «Problema nel caricamento del widget»). I layout si modificano a mano e `npm test` controlla che restino validi.

### Widget Android 5×1, versione a barre («MyBank barre»)

Una seconda versione del widget, **accanto a quella a livello**: nella lista dei widget compaiono due voci, «MyBank» (a livello) e «MyBank barre», e si può mettere sulla Home quella che preferisci (o tutte e due). Stesse cinque celle e stessi dati (anche gli stessi tocchi: il mese apre il Budget, una categoria i Movimenti filtrati); cambia come si disegna ogni categoria:

- **Barra a due blocchi** a sinistra (12 dp), **senza tacche**: in alto la parte vuota (grigio scuro), poi uno spazio di 3 dp, in basso il **livello del residuo** (chiaro; **rosso solo sotto il 25%**), con gli angoli appena arrotondati.
- A destra il **nome**, il **residuo** (15 sp come nell'altro widget; la cifra si rimpicciolisce da sola se è lunga) e, in basso, «**stima**» e «**reale**» (la reale rossa se supera la stima).
- Il **mese** è come nell'altra versione: «giorni rimanenti» e le settimane del calendario con i weekend in rosso.

### Widget Android 4×2 («MyBank 4×2»)

Una terza voce nella lista dei widget, nello stile di quello a livello ma più grande (griglia 4×2): in alto la **striscia del mese** (senza la scritta «Mese»: il **numero dei giorni rimanenti** grande, con «giorni rimanenti» su due righe accanto, e su una sola riga **i giorni del mese**: passati chiari, weekend in rosso; targhette di 7 dp, **una tacca ogni sette giorni con il numero sotto**: 1, 8, 15, 22, 29; la riga ha sempre 33 colonne, così tacche e numeri restano allineati anche nei mesi corti); sotto **tre celle uguali**, **Spesa**, **Svago** e **Auto** (niente Altro), con il **livello del residuo** che riempie la cella dal basso (rosso solo sotto il 25%), nome e residuo su una targhetta scura e, in basso, «stima» e «reale». Stessi dati e stessi tocchi degli altri widget (il mese apre il Budget, una categoria i Movimenti filtrati). Mockup in `design/mockup-widget-4x2.html` (variante C).

**Limiti delle banche.** Le banche concedono 4 accessi al giorno senza l'utente presente (PSD2): sono esattamente i 4 automatici, per questo gli orari sono al massimo 4. Le letture a mano (fino a 10 al giorno per banca) dichiarano alla banca che c'è una persona presente (intestazioni «PSU») e contano a parte. Il consenso dura al massimo 180 giorni: alla scadenza si ricollega con un tocco.

**Ricollegare una banca non rimette niente a zero.** Ogni nuovo consenso porta da Enable Banking identificativi di conto nuovi; MyBank riconosce i conti già noti (dall'IBAN o, per i pocket senza IBAN, da nome, tipo e valuta, solo se non ci sono due conti uguali) e tiene il loro `uid` della prima volta (`apiUid` è quello di adesso, l'unico che si manda alla banca). I movimenti già presenti restano gli stessi (nessun duplicato) e tag, nomi e ricorrenti scelti a mano restano al loro posto; la lettura riparte dall'ultima. Scollegare una banca invece toglie i suoi movimenti, come prima.

## Come si avvia

Serve Node 24.

```bash
npm install
cp .env.example .env     # poi imposta MYBANK_PASSWORD (per il server)
npm run server           # il server, su http://127.0.0.1:4870
npm start                # il localhost: solo frontend, sceglie il server al login
npm test                 # i test
```

`MYBANK_PASSWORD` è la password **iniziale**: la cambi dalle Opzioni e da quel momento il valore nel file non conta più. Senza `MYBANK_PASSWORD` il server parte solo su `127.0.0.1` (accesso libero, per provare in locale); su altri indirizzi (`HOST=0.0.0.0`) la password è obbligatoria. Altre variabili: `PORT`, `HOST`, `MYBANK_DATA` (cartella dei dati), `MYBANK_PUBLIC_URL`, `MYBANK_AUTO_HOURS` (orari di base), `MYBANK_NO_AUTO` (spegne gli aggiornamenti automatici), `MYBANK_SERVER` (vedi sotto). I dati del server stanno in `data/` (`mybank.json`, la chiave di firma `secret.key`, `auth.json`); non finiscono mai su GitHub.

**Localhost = solo frontend.** `npm start` non avvia un server: serve soltanto le pagine di questa cartella (le modifiche al codice si vedono subito) e **non ha dati né logica**. Nella pagina di accesso scegli **a quale server collegarti**: un pulsante davanti al campo sceglie `https://` o `http://` e nel campo scrivi solo l'indirizzo (`mybank.miodominio.it`, oppure di casa come `192.168.1.20:4870` con http); lo stesso pulsante c'è nella schermata dell'app e inserisci la password; ogni chiamata (`/api/…`) viene inoltrata a quel server, quindi dati, banche, aggiornamenti e password sono sempre quelli del server e in locale non si legge né si scrive nulla. Il server scelto si ricorda nel browser; **Opzioni → Cambia server** lo cambia. Con `MYBANK_SERVER` nel file `.env` l'indirizzo è già compilato. Se il server è più vecchio del frontend e non ha una funzione nuova, compare «Il server non ha ancora questa funzione: aggiornalo».

**Provare senza banche vere:** `npm run demo` avvia una banca finta e un'app con dati inventati su `http://localhost:4871` (database a parte in `data/demo`, avviso rosso «Dati di prova inventati»).

### Collegare le banche
1. Su [enablebanking.com](https://enablebanking.com) crea un'applicazione (gratis per uso personale) e registra come **indirizzo di ritorno** quello mostrato in *scheda Banche → Enable Banking* (`https://<il tuo server>/api/banks/callback`; per Enable Banking serve https, tranne in prova).
2. In *scheda Banche → Enable Banking* incolla l'**ID** e la **chiave privata** (file `.pem`): restano solo sul server. La chiave si scarica **una sola volta**, quando crei l'applicazione sul sito di Enable Banking, e non si può rivedere; se la perdi crea una nuova applicazione (o una nuova chiave) e aggiorna ID e chiave qui.
3. Premi **Collega UniCredit** / **Collega Revolut**: si apre il sito della banca per autorizzare la sola lettura; al ritorno MyBank legge lo storico dal 1 agosto 2026.

### Sul server (NAS, Docker)
```bash
docker compose up -d                          # imposta prima MYBANK_PASSWORD in docker-compose.yml
docker compose pull && docker compose up -d   # aggiornamento
```
GitHub costruisce l'immagine `ghcr.io/jstplink/mybank` a ogni push su `main` e a ogni tag `mybank-vX.Y.Z`. Serve un indirizzo https raggiungibile dal telefono (reverse proxy del NAS o simile). L'aggiornamento non richiede altri file: i dati restano in `data/`.

### App Android
```bash
npm run apk              # costruisce android/build/MyBank-<versione>.apk
npm run apk:installa     # costruisce e installa sul telefono (debug wireless attivo)
```
Serve l'SDK Android (si trova da solo in `~/Android/Sdk` o `%LOCALAPPDATA%\Android\Sdk`) e Java 17. Se in `.env` c'è `MYBANK_SERVER` l'indirizzo finisce nell'APK; altrimenti l'app lo chiede alla prima apertura (https, oppure un indirizzo di casa come `192.168.1.20:4870`).
**Il frontend (pagine, script, stile, icona) sta dentro l'APK** (`assets/www`, copiato da `public/` a ogni build) e la WebView lo serve al posto di quello del server; dati e logica sono sul server. Per vedere una modifica alla grafica sul telefono basta ricostruire e installare l'APK; le funzioni nuove che chiedono dati al server richiedono anche il server aggiornato. Dopo il login l'app consegna al widget il gettone di accesso. Il widget si aggiunge dal menu dei widget → MyBank.

## API

Tutte dietro password (cookie o `Authorization: Bearer`), tranne login, versione e il ritorno dalla banca.

| | |
|---|---|
| `POST /api/login`, `POST /api/logout`, `GET /api/session`, `POST /api/password` | accesso e cambio password |
| `GET /api/version` | versione del server |
| `GET /api/summary?year=` | storico: entrate, uscite, bilancio per mese |
| `GET /api/stats?year=&month=` | statistiche: categorie, mesi, controparti, entrate (non più usate dall'app) |
| `GET /api/transactions?year=&month=&tag=&q=&account=&recurring=` | movimenti con tag; `account` = un conto o pocket, `recurring` = i pagamenti di un ricorrente |
| `PUT /api/transactions/:id/tag` | tag a mano (`null` = automatico) |
| `PUT /api/transactions/:id/name` | nome a mano di un movimento (`name` vuoto = nome della banca; al massimo 120 caratteri); `GET /api/transactions` lo dà in `customName` |
| `GET/PUT /api/documents`, `GET/POST /api/documents/:key/files` | il LINK delle tre cartelle (`payslips`, `statements`, `bills`), l'elenco dei file letto da Seafile e il caricamento di un file (corpo = file, `?name=`) |
| `POST /api/documents/statements/import?name=` | rilegge a mano un estratto conto mensile (per riprovare dopo un errore); gli estratti nuovi si leggono da soli |
| `POST /api/import` | importa movimenti già letti (JSON), solo prima della data di inizio |
| `GET/POST /api/notifications`, `PUT/DELETE /api/notifications/:id` | notifiche (testo, giorno del mese, orario; `recurringKey` se legate a un ricorrente) |
| `GET /api/recurring`, `POST /api/recurring`, `DELETE /api/recurring/:key` | ricorrenti raggruppati (con totale al mese), aggiunta e rimozione a mano (solo quelli aggiunti a mano) |
| `PUT /api/recurring/:key/active`, `PUT/DELETE /api/recurring/:key/reminder` | «ancora attivo» e promemoria del ricorrente (una notifica legata alla chiave) |
| `GET /api/recurring?tx=`, `PUT /api/recurring/assign` | movimenti «da assegnare» e suggerimenti (con `tx`, per quel movimento); assegna (`ids`, `key`) o scollega (`key: null`) dei movimenti; `POST /api/recurring` accetta `assign` (id da assegnare al nuovo ricorrente) |
| `GET /api/budgets`, `PUT /api/budgets` | budget mensile (`spesa`, `svago`, `carburante`, `altro`) e stato del mese |
| `GET /api/widget` | dati del widget |
| `GET /api/banks`, `PUT /api/banks/app`, `POST /api/banks/link`, `GET /api/banks/callback`, `DELETE /api/banks/:id` | banche ed Enable Banking |
| `POST /api/banks/sync`, `PUT /api/banks/schedule`, `PUT /api/banks/accounts/:uid/name` | aggiornamenti, orari, nome dei pocket |

## Logo

Tre barre in crescita (carta, l'ultima rossa) su una linea di base, su fondo inchiostro, con ampi margini perché il ritaglio circolare di Android non le tagli: `design/logo-scelto.svg`, usato come icona del sito `public/icon.svg`, a sinistra del nome nell'app web e come icona adattiva di Android `android/res/drawable/ic_foreground.xml` (disegno ridotto al 72% per restare nella zona sicura) (fondo `ic_background` in `android/res/values/colors.xml`). Le proposte, compresa la cassaforte e le barre su rosso usate prima, sono in `design/` (`proposte-icona-2.html` per l'ultima scelta, la 4).

## Estetica

Stile tipografico da giornale svizzero: **carta e inchiostro** (chiaro e scuro come il sistema), un solo **rosso vermiglio** come accento (più un **giallo** solo per i mesi dello Storico con movimenti «Non definito»), **angoli vivi** e filetti (1px sottili, 2px a inizio sezione), numeri grandi in **serif**, etichette in **monospazio maiuscolo**, testo in sans. Scala del testo, **l'unica usata in tutta l'app**: 11 etichette · 13 secondario · 15 testo, campi e pulsanti · 22 titoli · 34 numeri (28 sul telefono; i tre totali dello Storico sono a 34 sul web e 22 sul telefono). Caratteri: **serif** per titoli e per tutti gli importi (cifre tabulari, anche in Movimenti, Storico, Budget e Ricorrenti), **monospazio maiuscolo** per etichette e nomi, **sans** per il resto; colori solo quelli delle variabili in `public/style.css` (carta, inchiostro, rosso, i colori dei tag). Pulsanti: primario = inchiostro pieno (rosso al passaggio), secondario = solo filetto, link = sottolineato rosso; schede = sottolineatura rossa spessa. Il widget è la stessa pagina in piccolo: fondo inchiostro, testo carta, un solo carattere sans-serif; i weekend del mese sono in rosso. Le sotto categorie usano il colore della loro categoria; gli interruttori sono a contorno (pallino a sinistra e tutto grigio se spenti, pieni con il pallino a destra se accesi); le schede stanno in basso sul telefono.

**Targhette** (sotto categoria nei Movimenti, ANNO / MESE nei Ricorrenti, ricorrente assegnato): rettangolo a spigoli vivi, filetto da 1px, testo monospazio maiuscolo da 11 px; **piena** (inchiostro con testo carta) quando dice qualcosa di scelto o di forte (sotto categoria scelta, ANNO), **vuota** o grigia quando è neutra o da scegliere (MESE, «Sotto cat.»), rossa quando manca qualcosa («Da assegnare»). La campanella del promemoria è rossa.

## Sicurezza e dati

- Il server è protetto da una sola **password**; la prima è quella di `MYBANK_PASSWORD` (nel `docker-compose.yml` c'è un segnaposto: **cambiala subito** da Opzioni → Cambia password). Dopo 8 tentativi sbagliati in 10 minuti l'accesso da quell'indirizzo si blocca per un po'.
- L'**ID e la chiave privata di Enable Banking** stanno solo nel server (`data/mybank.json`) e non tornano mai all'interfaccia. Le banche si leggono **solo in lettura**: MyBank non può spostare denaro.
- Il **widget** e l'app usano un gettone firmato, valido 180 giorni, che decade quando cambi la password.
- **Backup**: basta copiare la cartella `data/` del server (movimenti, tag e nomi scelti a mano, budget, collegamenti, password). Non va mai su GitHub (è in `.gitignore`, come `.env`).

## Problemi frequenti

| Sintomo | Causa e rimedio |
|---|---|
| «Il server non ha ancora questa funzione» | Il server è più vecchio dell'app: `docker compose pull && docker compose up -d`. |
| «Redirect URI not allowed» collegando la banca | L'indirizzo di ritorno non è registrato su Enable Banking: apri MyBank dall'indirizzo https pubblico e registra esattamente quello mostrato in *scheda Banche → Enable Banking* (finisce con `/api/banks/callback`); si può fissare con `MYBANK_PUBLIC_URL`. |
| La password è ancora quella del file | La password cambiata dalle Opzioni sostituisce quella di `MYBANK_PASSWORD`; se non l'hai cambiata vale ancora il segnaposto del `docker-compose.yml`. Per tornare a quella del file, cancella `data/auth.json` e riavvia. |
| Dopo un aggiornamento la pagina del browser sembra vecchia | La pagina non si tiene in cache ma il browser può avere il vecchio script: ricarica con Ctrl+F5. |
| Il widget dice «Problema nel caricamento» | Nel layout c'è una view non ammessa nei RemoteViews: lancia `npm test`. |
| Il widget dice «accedi in app» | La sessione è scaduta: apri l'app e fai il login. |
| Il widget o l'app non si aggiornano sul telefono | `npm run apk:installa` con il debug wireless attivo; se `adb` non vede il telefono, ripeti l'abbinamento (Opzioni sviluppatore → Debug wireless). L'app Android firmata con una chiave diversa non si aggiorna: va disinstallata e reinstallata (la chiave di debug sta in `~/.android/debug.keystore`). |
| Un movimento è «Non definito» | Viene da un pocket senza nome riconosciuto o da UniCredit: dai un nome al pocket con **Rinomina** (es. «01 Spesa») o scegli il tag a mano. |

## Versioni e rilascio

Ogni commit alza la versione (`package.json`, una sola volta, subito prima del commit) e aggiunge una voce a `CHANGELOG.md`; il tag Git è `mybank-vX.Y.Z` (i tag `vX.Y.Z` sono della vecchia app Bilancio). Dopo un push GitHub costruisce l'immagine Docker; il NAS si aggiorna con `docker compose pull && docker compose up -d`; il telefono con `npm run apk:installa`.
