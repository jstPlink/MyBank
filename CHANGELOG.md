# Changelog

Ogni push aggiorna la versione (`package.json`) e aggiunge una voce qui, con il tag Git `mybank-vX.Y.Z` (i tag `vX.Y.Z` appartengono alla vecchia app Bilancio).

## 0.39.0
- **Ricollegare una banca non rimette niente a zero**: un nuovo consenso porta da Enable Banking `uid` di conto nuovi e prima tutti i movimenti venivano riletti come nuovi (duplicati, tag da riassegnare). Ora i conti già noti si riconoscono (IBAN o, per i pocket, nome, tipo e valuta, solo se non ce ne sono due uguali), tengono il loro `uid` e si legge dall'ultima lettura; `apiUid` è quello di adesso, l'unico mandato alla banca. Scollegare una banca toglie ancora i suoi movimenti. Serve il server aggiornato. Test in `test/banks.test.js`.
- **Nuova icona**: tre barre in crescita (carta, l'ultima rossa) su una linea di base su fondo inchiostro, ridotte al 72% per restare nella zona sicura del ritaglio di Android (icona adattiva, `public/icon.svg`, `design/logo-scelto.svg`).
- **Widget 4×2, striscia del mese**: tolta la scritta «Mese»; il numero dei giorni rimanenti è più grande (24 sp) con «giorni rimanenti» su due righe accanto; i giorni del mese hanno una **tacca ogni sette giorni con il numero sotto** (1, 8, 15, 22, 29), riga sempre a 33 colonne per restare allineata nei mesi corti; striscia alta 42 dp.
- Mockup in `design/`: icona (`proposte-icona-2.html`) e striscia del mese del widget (`mockup-widget-mese.html`, scelta B con tacche T3).

## Da rilasciare
- **Nuova icona**: tre barre che crescono con un filetto di base, inchiostro su vermiglio (al posto della cassaforte): icona del sito, logo accanto al nome e icona adattiva di Android. Proposte in `design/proposte-icona*.html`.

## 0.38.1
- **Movimenti nuovi da smistare**: quelli letti dalla banca (pagamenti in sospeso compresi) o importati da estratto conto restano tutti «Non definito» finché non scegli tu il tag; anche «automatico» li smista dando il tag del pocket. Le entrate e i non contabili restano automatici; i movimenti già presenti non cambiano. Server: `db.unsorted`.

## 0.38.0
- **Budget**: la voce «Media 3 mesi» diventa **«Media spese»** e ora **comprende i ricorrenti** attivi (mensili + annuali ÷ 12); nelle statistiche in alto c'è una **terza colonna «Media entrate»** (entrate medie dei 3 mesi precedenti, in verde) e sotto una **barra** con le entrate divise in ricorrenti, budget e risparmio possibile (se il budget non rientra compare «Sfora» in rosso). Server: `GET /api/budgets` aggiunge `totals.recurring`, `income3`, `saving`, `avg3Cats` e `avg3` con i ricorrenti (con un server non aggiornato terza colonna e barra non compaiono).
- **App Android**: tocco aptico più leggero (vibrazione breve e debole, permesso `VIBRATE`) e schermo bloccato in verticale.
- **Stile omologato**: una sola scala del testo (11/13/15/22/34, nessuna misura fuori scala) e tutti gli importi in serif a cifre tabulari (anche Movimenti e Storico); un test controlla la scala.
- Mockup in `design/`: Budget con ricorrenti, entrate e risparmio (scelta la barra C3).

## 0.37.0
- **Widget Android 4×2** («MyBank 4×2», terza voce nella lista dei widget): nello stile del widget a livello, con una striscia bassa del mese in alto (giorni rimanenti e i giorni del mese su una sola riga, weekend in rosso) e sotto Spesa, Svago e Auto (senza Altro) con il livello del residuo, stima e reale. Stessi dati e stessi tocchi degli altri widget.
- Mockup in `design/`: widget 4×2 (varianti A-E; scelta la C).

## 0.36.3
- **Movimenti**: il filtro per categoria elenca solo le **categorie principali** (le sotto categorie Cibo, Carburante e Autostrada non ci sono più; filtrando una categoria si vedono comunque quelle delle sue sotto categorie; una sotto categoria compare solo se è già il filtro scelto, per esempio dal dettaglio dello Storico). Dopo il tocco sul menu della categoria nelle righe non resta più il contorno rosso.

## 0.36.2
- Documentazione: nel README («Estetica») la regola delle targhette (piena, vuota o grigia, rossa) e della campanella.

## 0.36.1
- **Righe dei Ricorrenti riviste**: sotto il giorno c'è sempre il mese del prossimo pagamento (non più «mensile»); la **campanella** del promemoria sta tra il giorno e la targhetta (spazio vuoto senza promemoria); la targhetta «Anno» / «Mese» passa a sinistra del nome, della stessa larghezza; tolto il filetto a sinistra delle righe annuali; l'importo al mese sta sotto il nome solo per gli annuali.
- Mockup in `design/`: targhetta, pagamento, mese e notifica dei ricorrenti.

## 0.36.0
- **Sotto categorie a parte** (scheda Movimenti): la lista principale del tag ha solo le categorie; la sotto categoria si sceglie da una **targhetta** sotto il tag (grigia «Sotto cat.» se non scelta, piena col nome se scelta; «Nessuna» torna alla categoria). Nessun cambio al server.
- **Ricorrenti, mensili e annuali ben distinti**: targhetta della cadenza accanto al nome («Anno» piena, «Mese» vuota), filetto a sinistra delle righe annuali, «mensile» sotto il giorno dei mensili e l'equivalente al mese per gli annuali.
- Mockup in `design/`: cadenza dei ricorrenti (varianti A, B, C; scelta la B).

## 0.35.0
- **Sotto categorie dei movimenti**: **Cibo** (sotto Spesa), **Carburante** e **Autostrada** (sotto Auto; chiave interna `auto_carburante` per distinguerla dalla categoria Auto, `carburante`). Si scelgono a mano dal menu del tag di ogni movimento (nei menu hanno un trattino davanti), non sono mai automatiche. Contano nel totale della loro categoria (budget, widget e Storico) e il filtro su una categoria include le sue sotto categorie; nel dettaglio dei mesi dello Storico compaiono rientrate sotto la categoria (`subs` in `GET /api/summary`). Serve il server alla 0.35.0 (il menu dei tag arriva dal server).
- Documentazione: regola sui mockup in `CLAUDE.md`.

## 0.34.0
- **Importo dei ricorrenti = media dei movimenti assegnati** (campo `average`); si può scrivere a mano («Importo scelto a mano») e tornare alla media con «Usa la media». Nella riga aperta una sezione «Dati» (nome, importo, cadenza) con «Salva modifiche» che compare solo se cambi qualcosa: `PUT /api/recurring/:key`.
- **Creare un ricorrente senza importo**: si sceglie il nome e, se è mensile, solo il giorno del pagamento; se è annuale giorno e mese, senza anno (`POST /api/recurring` con `day` e `month`). Lo stesso nel foglio «Nuovo ricorrente da questo movimento». Finché non ci sono movimenti l'importo è «–».
- **Promemoria**: senza promemoria la riga mostra solo «Aggiungi promemoria», che crea quello di base «Pagamento imminente: <nome> di <importo>», 3 giorni prima e alle 9:00; ogni ricorrente nuovo nasce già con quello. I promemoria dei ricorrenti annuali hanno anche il **mese** e suonano una volta l'anno (`month` nelle notifiche; l'app Android lo legge).
- **Interruttore** «Attivo» (bianco) / «Inattivo» (grigio). In cima ai Ricorrenti due cifre: costo fisso mensile e da mettere da parte al mese (annuali ÷ 12), senza il totale e senza i contatori.
- **Movimenti, stile A**: il secondo livello dei movimenti «Ricorrente» sta nella colonna del tag, sotto il tag sul telefono e a sinistra sul web: chip rosso «Da assegnare» o chip pieno col nome del ricorrente. I pulsanti «Nuovo…» e «Altro…» della casella «Da assegnare» hanno la stessa misura dei tag e il testo sotto è tolto.
- Mockup in `design/`: righe dei Movimenti con due tag e assegnazione dei movimenti.

## 0.33.1
- **Ricorrenti solo a mano**: tolto il riconoscimento automatico. Un ricorrente esiste solo se lo crei tu (`Aggiungi ricorrente` o «Nuovo…» da un movimento); i movimenti col tag «Ricorrente» restano «da assegnare» finché non li assegni. Cambia `GET /api/recurring`: niente più gruppi automatici.
- **Schede in basso sul telefono**: barra fissa con il segno rosso sopra la scheda scelta; messaggio a comparsa e pulsante «Collega» spostati sopra la barra.
- **Swipe**: la pagina non scorre più di lato (`overflow-x: hidden`, `touch-action: pan-y`), così il dito in orizzontale cambia scheda.

## 0.33.0
- **Nuova scheda «Ricorrenti»** (tra Movimenti e Budget): i pagamenti che si ripetono, raggruppati dal server per beneficiario (mensili: 3 pagamenti di importo simile a circa un mese; annuali: 2 a circa un anno) oppure aggiunti a mano. In cima «Ricorrenti al mese» (gli annuali contano per un dodicesimo) e «Gruppi attivi»; gli attivi dal pagamento più vicino al più lontano, poi i non più attivi in grigio. Un tocco su una riga la apre: interruttore «Ancora attivo», **promemoria** (giorno, orario, testo; un solo pulsante, «Togli» finché i campi sono quelli salvati e «Salva» appena ne cambi uno) e link ai Movimenti filtrati su quel ricorrente.
- **Promemoria nel server legati al ricorrente**: sono notifiche del database del server con `recurringKey` (compaiono anche nelle Opzioni e si tolgono da sole se il ricorrente non è più attivo).
- **Assegnare i movimenti ai ricorrenti**: i movimenti col tag «Ricorrente» sono «da assegnare» finché non appartengono a un ricorrente. Chip nella riga dei Movimenti e foglio di assegnazione (suggerimento per nome o importo, «Nuovo ricorrente da questo movimento», «Solo il tag»; si apre anche scegliendo il tag dal menu), casella «Da assegnare» in cima ai Ricorrenti con un tocco per suggerimento, «Movimenti collegati» e «Collega altri movimenti» (selezione multipla) dentro ogni ricorrente.
- **Nuovo tag «Ricorrente»** (solo manuale, senza budget). **Documenti** spostati nelle Opzioni (sezione che si chiude e si apre).
- **Budget**: «Speso» diventa «Spesa reale» e «Dovresti aver speso» «Spesa stimata»; riquadro del mese con residuo e giorni rimanenti grandi e sotto due colonne (budget e media 3 mesi; spesa reale e spesa stimata, in grigio scuro la media e la stima); barre a **mattoncini da 75 €** nella stessa scala per tutte le categorie, lunghe in proporzione al budget; sotto la barra «Spesi X di Y» e la media.
- **Nuovo logo**: la cassaforte (corpo e piedini rossi), applicata a sito, app e icona adattiva di Android; in `design/` tutte le proposte e i mockup (Ricorrenti, assegnazione dei movimenti).
- **Swipe** tra le schede più facile (50 px) e con un'animazione di ingresso; la scheda Ricorrenti è nello scorrimento.
- **Server**: `GET/POST /api/recurring`, `PUT /api/recurring/assign`, `PUT /api/recurring/:key/active`, `PUT/DELETE /api/recurring/:key/reminder`, `DELETE /api/recurring/:key`; `GET /api/transactions` accetta `recurring` e dà `recurring` e `totals.unassigned`. Serve il server alla 0.33.0 (altrimenti «Il server non ha ancora questa funzione»).

## 0.32.0
- **Riquadro del mese più ricco** (scheda Budget): valori a 22 px (su una riga sul web, su più righe sul telefono) e due dati nuovi, la **media dei 3 mesi precedenti** e «**dovresti aver speso**» (il ritmo di tutte le categorie). Il server aggiunge `totals.avg3`; serve il server alla 0.32.0 per vederli.
- **Tocco aptico** su ogni pulsante nell'app Android (`Native.tick()`, nessun permesso; segue l'impostazione di vibrazione al tocco del telefono).
- Scheda Budget: tacche da 3 px, segno del ritmo più visibile (4 px con bordo), barre a tutta larghezza sul web.

## 0.31.0
- **Scheda Budget ridisegnata (B2)**: in cima il **residuo del mese** con budget, speso e giorni rimanenti; poi una riga per categoria con una **barra alta che mostra il residuo** (si accorcia man mano che spendi; rossa sotto il 25%, tutta rossa oltre il budget), tacche da 3 px al 25, 50 e 75% e un **segno rosso del ritmo** (dove sarebbe il residuo spendendo in modo uniforme fino a oggi). Sotto la barra «Speso … di …» e la media 3 mesi. Il budget si cambia con «Modifica budget». Solo inchiostro, carta e il rosso dell'app; a tutta larghezza anche sul web.
- **Server**: `GET/PUT /api/budgets` aggiungono `pace` a ogni categoria e `totals` (budget, speso, residuo, ritmo, giorni rimanenti) al mese, con un test. Serve il server alla 0.31.0 per vedere il ritmo e il riquadro del mese (con uno più vecchio compaiono solo le barre).
- **Widget «MyBank barre»**: seconda versione del widget 5×1, accanto a quella a livello, con una barra a due blocchi per categoria; il residuo è rosso solo sotto il 25%; margini del widget a livello più larghi.
- Mockup della scheda Budget in `design/`.

## 0.30.0
- **Budget di «Altro»**: nuova quarta categoria con budget mensile, come Spesa, Svago e Auto (`BUDGET_TAGS`: `altro`); `PUT /api/budgets` e `GET /api/widget` la includono. Serve il server alla 0.30.0 (con uno più vecchio la scheda non compare e il widget dice «nessun budget»).
- **Scheda Budget riprogettata**: una scheda per categoria, una sotto l'altra sul telefono (più colonne su schermi larghi): titolo con icona e filetto da 2 px sotto, poi Residuo con la barra, Media 3 mesi e Budget (il campo), con l'etichetta a sinistra e il valore a destra. Residuo, media e budget hanno lo stesso carattere (serif); residuo e budget la stessa dimensione (22).
- **Widget Android ridisegnato, cinque celle** (Mese, Spesa, Svago, Auto, Altro): in ogni categoria il livello del residuo riempie tutta la cella dal basso, con linea e tre tacche leggere al 25, 50 e 75%; il riempimento è rosso solo sotto il 25%. Nome e residuo su una targhetta scura, stima e reale in due etichette piene (rossa la reale se supera la stima). Il mese mostra i giorni rimanenti e le settimane del calendario (lunedì-domenica) con i weekend in rosso; tolto l'orario di aggiornamento delle banche.

## 0.29.0
- **Storico, dettaglio del mese**: nuova riga **Entrate** in cima (nome, barra e importo in verde), cliccabile come le categorie: apre i Movimenti filtrati per quel mese e il tag Entrata. Tutte le barre del mese hanno la stessa **scala in euro** (la più grande tra entrate e uscite è la barra intera) e una **tacca sottile ogni 250 €** per leggere meglio l'importo. Un mese senza movimenti dice «Nessun movimento».
- **«Carburante» si chiama «Auto»** in tutta l'app (tag, filtri, Budget, Storico, widget, documentazione). La chiave interna resta `carburante`: dati, scelte a mano e budget già salvati non cambiano; il nome «Auto» si vede anche con un server non ancora aggiornato; il pocket di Revolut può chiamarsi «03 Carburante» o «03 Auto».

## 0.28.0
- **Rinominare un movimento**: accanto al titolo di ogni movimento c'è una matita (✎); toccandola si sceglie un nome per quel solo movimento. Il dato della banca non cambia, il nome resta anche alle letture successive, sotto compare «originale: …», la ricerca lo trova e un nome vuoto ripristina quello della banca (al massimo 120 caratteri). API: `PUT /api/transactions/:id/name`; `GET /api/transactions` dà `customName`. I nomi dei movimenti tolti per la data di inizio si tolgono con loro. Serve il server alla 0.28.0.
- **Movimenti, 100 alla volta**: la pagina mostra sempre 100 movimenti; se ce ne sono di più, in fondo c'è «Mostra altro» (altri 100 ogni volta), sul web e nell'app (prima: fino a 1000 tutti, oltre i primi 200). Con un server vecchio, che dà al massimo 1000 movimenti, il pulsante sparisce quando sono finiti.
- **Android**: l'app si installa con la chiave di debug di questo computer (quella dell'app già sul telefono era di un'altra: reinstallata una volta).

## 0.27.0
- **Il tag «Giroconto» si chiama «Non contabile»** (movimenti che non contano in nessun totale: giri tra i tuoi conti, addebito della carta di credito già dettagliato). La chiave interna resta `giroconto`: i dati e le scelte già salvate non cambiano. Il nome si vede anche con un server non ancora aggiornato (la pagina lo impone da sola). Icona e colore sono quelli di prima.
- **Movimenti**: tolta la frase «i giroconti non contano» dalla riga informativa.

## 0.26.0
- **Estratti conto in tutte le sottocartelle**: gli estratti si leggono anche dalle sottocartelle della cartella condivisa (prima solo dalla radice: per questo molti non risultavano letti).
- **Conto corrente UniCredit** (estratti trimestrali «Estratto conto AAAA.MM - AAAA.MM.pdf»): nuovo lettore che usa le coordinate delle parole (`pdftotext -bbox`): la colonna dice se un importo è uscita o entrata. Si ferma se uscite, entrate o saldo finale non tornano con il riepilogo del PDF. Provato su 13 estratti dal 2021 al 2026 (tutti con i totali esatti).
- **Carta di credito Flexia** (mensile «Estratto Conto Carte Flexia AAAA.MM.pdf»): acquisti letti e controllati con il totale del mese.
- **Addebito della carta sul conto**: «PAGAMENTO PER UTILIZZO CARTE DI CREDITO … ESTRATTO MM/AAAA» è un giroconto quando di quel mese c'è l'estratto della carta (gli acquisti sono già movimenti), altrimenti resta una spesa.
- Gli estratti già falliti si rileggono da soli dopo l'aggiornamento (versione dei lettori). La rilettura a mano usa il percorso del file (`POST /api/documents/statements/import?path=`). Serve il server alla 0.26.0.

## 0.25.0
- **Movimenti, ordinamento**: restano solo **Data** e **Importo** (tolti Movimento e Categoria), ognuno sopra la sua colonna sotto la riga informativa.
- **Movimenti, riga informativa**: le cifre (numero dei movimenti, entrate, uscite) sono in bianco.
- **Movimenti, categoria**: l'icona sta dentro il blocco del menu della categoria, dello stesso colore del testo.
- **Movimenti, tanti risultati**: fino a 1000 movimenti si mostrano tutti; se sono di più si mostrano i primi 200, senza messaggi, e in fondo c'è **Mostra altro** (altri 200 ogni volta). `GET /api/transactions` accetta `limit` e `offset`. Con un server più vecchio si vedono al massimo i primi 1000. Serve il server alla 0.25.0.

## 0.24.0
- **Movimenti**: il testo informativo è più staccato dalla riga. Nella riga ci sono anche le **entrate** (con il filtro «Entrata» solo quelle; senza filtro entrate e uscite; con gli altri filtri le uscite), calcolate dal server su tutti i movimenti filtrati e non solo sui primi 1000.
- **Movimenti, ordinamento**: sotto la riga i nomi delle colonne **Data · Movimento · Importo · Categoria**; toccandone uno si ordina per quella colonna, un secondo tocco inverte il verso (freccia ▲/▼). `GET /api/transactions?sort=date|title|amount|tag&dir=asc|desc`. Con un server più vecchio la pagina ordina da sola i movimenti ricevuti e ne calcola i totali. Serve il server alla 0.24.0 per l'ordinamento su più di 1000 movimenti.

## 0.23.0
- **Buste paga lette in automatico**: ogni busta paga nuova o cambiata nella cartella (e nelle sue sottocartelle) si scarica e se ne legge il «netto a pagare» con il riconoscimento dei caratteri (`tesseract.js`, nel server; le pagine con `pdftoppm`). Diventa un'entrata («Stipendio Giugno 2026», conto «Busta paga»; quattordicesima e tredicesima comprese). La lettura va in sottofondo: l'elenco dei documenti dice «In lettura…» e poi il netto; si riprova da sola dopo un errore se il lettore migliora. Provata su 59 buste 2022–2026: importi tutti uguali a quelli letti a occhio. Da agosto 2026 non si legge nulla (il conto lo legge la banca).
- Tolto il pulsante «Importa movimenti da file» dalle buste paga (resta `POST /api/import`).
- Nuove dipendenze: `tesseract.js` e `@tesseract.js-data/eng`. Serve il server alla 0.23.0.

## 0.22.1
- **Documenti**: l'elenco dei documenti rilevati comprende anche le **sottocartelle** della cartella condivisa (fino a 3 livelli): prima la radice, poi le sottocartelle dalla più recente, ognuna con il suo titolo (per le buste paga: 2025, 2024, 2023, 2022). Prima si vedeva solo la radice. Gli estratti conto si leggono ancora solo dalla radice.

## 0.22.0
- **Storico**: i mesi con movimenti «Non definito» hanno la riga **gialla** (nuovo colore, solo per questo).
- **Tutti i mesi letti dagli estratti conto si mostrano** (prima solo alcuni); `settings.importedVisible` resta per nasconderne se serve.
- **Buste paga tra i movimenti**: l'importazione accetta l'origine «busta» (il netto del mese come entrata, conto «Busta paga»); in Documenti → Buste paga c'è «Importa movimenti da file» per caricare il `.json`. Le buste paga sono scansioni: il server non le legge da solo.
- Serve il server alla 0.22.0.

## 0.21.1
- **Estratti conto**: il lettore capisce anche il testo di altre versioni di `pdftotext` (quella dell'immagine Docker scrive gli importi con «€», per esempio `10,00€ 24,46€`, e può mettere «ID transazione:» e simili sulla stessa riga): prima, sul server, tutti gli estratti davano «manca il saldo». Gli estratti rimasti in errore si rileggono da soli dopo l'aggiornamento (versione del lettore).

## 0.21.0
- **Estratti conto letti in automatico**: ogni «Estratto conto AAAA.MM.pdf» nuovo o cambiato nella cartella dei documenti, dei mesi prima di agosto 2026, si legge da solo (aprendo l'elenco e a ogni aggiornamento automatico delle banche): il server lo scarica da Seafile, lo legge con `pdftotext` e controlla che i conti tornino con il riepilogo. Da agosto in poi non si scarica né si legge nulla (li legge la banca). L'esito di ogni file si vede sotto il nome (movimenti letti, errore con «Riprova»).
- **Per ora si mostrano solo maggio e giugno 2026**: i movimenti letti si salvano tutti, ma gli altri mesi restano nascosti in ogni schermata (`settings.importedVisible`).
- **Un solo LINK per cartella** (niente più link di caricamento separato): il caricamento usa lo stesso link se Seafile lo permette, altrimenti l'app lo dice.
- Il lettore dell'estratto passa in `src/estratto.js`; l'immagine Docker include `poppler-utils`. Serve il server alla 0.21.0.

## 0.20.0
- **Documenti**: tre categorie che si chiudono e si aprono (Buste paga, Estratti conto, Bollette), ognuna legata a una cartella Seafile (link di consultazione e, facoltativo, di caricamento, salvati nel server). Si vedono i **documenti rilevati** nella cartella e un tocco li apre su Seafile; si possono **caricare documenti** nella stessa cartella cambiando il nome prima dell'invio. API `GET/PUT /api/documents`, `GET/POST /api/documents/:key/files`.
- **Importazione da estratto conto** (Documenti → Estratti conto → Importa movimenti da file): nuovo script `scripts/estratto-revolut.mjs` che legge il PDF mensile di Revolut (conto, pocket, deposito), ricava il segno dal saldo e si ferma se i conti non tornano con il riepilogo; `POST /api/import` salva i movimenti anche prima della data di inizio, senza duplicati e senza mai toccare i mesi letti dalla banca. «Prelievo da Pocket» è riconosciuto come giroconto.
- **App Android**: il selettore di file funziona dentro l'app (caricamenti e importazione) e i documenti si aprono nel browser del telefono.
- Serve il server alla 0.20.0.

## 0.19.0
- **Budget** ridisegnato in tre colonne (Spesa, Svago, Carburante): titolo con icona, riga sotto, **spesa media degli ultimi 3 mesi** (etichetta grigia, valore bianco), campo del budget mensile, **importo residuo** con la scritta «residuo» (bianco se positivo, rosso se negativo) e barra dello stato; sotto «Salva budget». Tolti descrizione, titolo «Budget mensile», «Questo mese» e le stime giornaliere. Testi coerenti con il resto dell'app. Serve il server alla 0.19.0 per la spesa media (`avg3` in `GET /api/budgets`; col server vecchio mostra «–»).
- **Movimenti**: cambiando la categoria di un movimento con un filtro per tag attivo, l'elenco si aggiorna subito.

## 0.18.0
- **Nuova categoria «Utenze»**: non è mai assegnata in automatico (nessun movimento si sposta da solo) e non ha un budget: si sceglie a mano dal menu di ogni movimento. Nel dettaglio dello Storico la riga «Utenze» c'è sempre, anche a zero. Serve il server alla 0.18.0 (altrimenti «Tag non valido»).
- **Icone**: ogni categoria ha una piccola icona (Movimenti, dettaglio dello Storico, Budget).
- **Budget**: tolti la descrizione e il titolo «Questo mese»; in alto i tre riquadri con il nome (e l'icona) sopra, sotto il budget mensile.

## 0.17.0
- **Storico**: toccando un mese si vedono le uscite una categoria per riga, dalla più grande: nome, barra bianca larga quanto pesa sulle uscite del mese (importi veri, senza colori) e importo, in colonne allineate. Un tocco su una riga apre i **Movimenti** già filtrati per quell'anno, mese e categoria.
- **Statistiche**: la scheda non c'è più (lo Storico fa lo stesso lavoro). `GET /api/stats` resta sul server ma l'app non lo usa.
- **Banche**: torna una scheda (tra Budget e Documenti); le Opzioni hanno Notifiche, Account, Server e Sessione. Lo scorrimento col dito passa tra Storico, Movimenti, Budget e Banche.
- **Movimenti da agosto**: i movimenti si leggono e si mostrano dal **1 agosto 2026** (prima dal 1 settembre); i collegamenti già esistenti rileggono tutto dalla nuova data alla prima lettura dopo l'aggiornamento del server.
- **Banche → Aggiornamento**: le richieste delle ultime 24 ore si leggono come «Revolut · Richieste automatiche 1/4 · Manuali 3/10».
- **Regole di lavoro**: la versione si alza una sola volta, subito prima di un commit (`CLAUDE.md`, README).

## 0.16.7
- **Accesso**: davanti al campo del server c'è un pulsante che sceglie **http** o **https** (si autocompila `://`): basta scrivere `mybank.miodominio.it`. Vale per il localhost e per la schermata dell'app; un indirizzo incollato con `http://` o `https://` vale com'è.
- **Widget**: le righe dei giorni del mese (vuoti a fine domenica) sono sottili come le tacche delle categorie.
- **Opzioni**: la distanza tra titolo e riga è uguale in tutte le categorie; Banche e Notifiche sono più staccate dalle altre sezioni.

## 0.16.6
- **Widget**: gli angoli delle barre sono leggermente arrotondati (circa 3 dp).

## 0.16.5
- **Widget**: barre larghe altri 20% (34,27 dp); nella prima cella «aggiornamento» diventa «aggiornato» (e «nessun aggiornamento» «mai aggiornato»).
- **Opzioni**: la stessa distanza (34 px) tra tutte le sezioni.

## 0.16.4
- **Widget**: barre larghe altri 25% (28,56 dp).

## 0.16.3
- **Opzioni**: stile uniforme. Ogni categoria (Banche, Notifiche, Account, Server, Sessione) è un titolo con la riga sotto, come «Account»; in Banche e Notifiche, e in UniCredit, Revolut ed Enable Banking, la riga resta visibile anche quando la sezione è chiusa.
- **Banche**: «Ultimo aggiornamento» (senza «delle banche») in grigio, così risalta l'orario.
- **Statistiche**: tolte «Dove vanno i soldi» e «Da dove arrivano le entrate» (il server continua a calcolarle: nessuna modifica all'API).

## 0.16.2
- **Opzioni → Notifiche**: anche questa sezione si chiude e si apre toccando il titolo.

## 0.16.1
- **Opzioni → Banche**: l'intera sezione si chiude e si apre toccando il titolo.
- **Aggiornamento**: per ogni banca si vedono le **richieste fatte nelle ultime 24 ore** (automatiche su 4, a mano su 10) e quante ne restano.
- **Widget**: barre larghe altri 25% (22,85 dp); i nomi delle categorie scendono a 7,5 sp.
- **Versione dell'app**: testo più piccolo del 25%.

## 0.16.0
- **Movimenti da settembre**: i movimenti si leggono e si mostrano dal **1 settembre 2026** (prima dal 1 ottobre). I collegamenti già esistenti rileggono tutto dalla nuova data alla prossima lettura (ricordano da quando hanno letto: `from`), quindi settembre arriva da solo con il primo «Aggiorna ora» o automatico dopo l'aggiornamento del server.
- **Schede**: titoli più grandi (18 px sul web, 14 sul telefono). **Banche** non è più una scheda: sta in cima alle **Opzioni**. Nuova scheda **Documenti**, per ora vuota e separata dalle altre.
- **Scorrimento col dito** (telefono): un colpo orizzontale passa tra Storico, Movimenti, Statistiche e Budget.
- **Notifiche** (Opzioni): testo, giorno del mese e orario; salvate nel server, programmate dall'app Android sul telefono (anche dopo il riavvio). API `/api/notifications` (serve il server alla 0.16.0). Nuovi permessi dell'app: notifiche, sveglie precise, avvio del telefono.
- **Widget**: barre più larghe del 30% (18,28 dp); i nomi Spesa, Svago e Carburante scendono a 8,5 sp.
- **Intestazione sul telefono**: nome dell'app, versione e pulsante Opzioni sono allineati al centro.
- **Storico**: i titoli sono «Entrate», «Uscite», «Bilancio» senza l'anno (c'è il selettore).

## 0.15.1
- **Storico (web)**: i valori di entrate, uscite e bilancio sono più piccoli del 15%; sul telefono restano come prima.
- **Documentazione**: README riscritto per intero (architettura server/frontend/app, schede, widget, API, avvio, rilascio) e `CLAUDE.md` aggiornato con le regole di lavoro.
- **Documentazione** (ritocco finale, senza cambiare l'app): aggiunte le sezioni «Sicurezza e dati» (password, chiavi, gettone, backup) e «Problemi frequenti» (404 dopo un aggiornamento, «Redirect URI not allowed», password, cache della pagina, widget, installazione sul telefono).

## 0.15.0
- **Statistiche**: anche le **entrate**. In alto Entrate, Uscite e Bilancio (con il numero di movimenti); poi uscite per categoria, mese per mese (una barra verde sottile per le entrate sopra quella delle uscite, e a destra entrate e uscite del mese), dove vanno i soldi e, nuovo, **da dove arrivano le entrate** (le otto controparti che pesano di più). I giroconti non contano. Il totale coincide con lo Storico (test). Serve il server alla 0.15.0.
- **Widget**: «19 giorni rimanenti» e «aggiornamento 22.45» hanno la stessa dimensione del titolo dei pocket delle celle accanto (9,5).

## 0.14.1
- **Widget**: nella prima cella il testo è in parole: «19 giorni rimanenti» e «aggiornamento 22.45» (con la data se non è di oggi), per occupare più spazio.
- **Errore 404**: se il server è più vecchio dell'app e non ha una funzione (per esempio le Statistiche prima dell'aggiornamento a 0.13.0), compare «Il server non ha ancora questa funzione: aggiornalo» invece di «Errore 404».

## 0.14.0
- **Banche → Movimenti**: un tocco su una riga di conto o pocket (anche di Revolut) apre la scheda Movimenti filtrata per quel conto o pocket; sopra l'elenco compare «Conto o pocket: …» con «Togli il filtro». Il filtro si somma agli altri (tag, mese, ricerca) e sparisce toccando la scheda Movimenti. API: `GET /api/transactions?account=<uid>` (serve il server alla 0.14.0).

## 0.13.1
- **Widget**: ripristinata la stessa larghezza per le quattro celle (la prima non è più stretta); restano le barre larghe 14 dp, i testi su due righe nella prima cella e il tocco che apre il Budget.

## 0.13.0
- **Nuova scheda Statistiche** (tra Movimenti e Budget): le **uscite** dell'anno (o di un mese) divise per **categoria** con quota e importo, **mese per mese** con le barre divise per categoria (un tocco su un mese lo filtra, un secondo tocco torna a tutto l'anno) e **dove vanno i soldi** (le otto controparti che pesano di più). Contano solo le uscite: giroconti ed entrate no. API: `GET /api/stats?year=&month=` (serve il server alla 0.13.0).
- **Widget**: barre più larghe del 25% (14 dp); la prima cella (mese) è più stretta del 35% e mostra «AGG.» e l'ora su due righe; **un tocco sulla prima cella apre il Budget**.
- **Banche → orari**: sul telefono occupano tutta la larghezza dello schermo (quattro in una riga).
- **Storico**: testi di entrate, uscite e bilancio più grandi del 20% (etichette e numeri); **versione** dell'app più grande del 20%.

## 0.12.0
- **Widget**: le barre sono più larghe del 50% (11,25 dp); le barre dei pocket (Spesa, Svago, Carburante) hanno tre tacche, al 25%, 50% e 75% dell'altezza, per leggere meglio lo stato; la spesa giornaliera **reale** migliore della stima è **bianca** (non più verde), peggiore resta rossa.

## 0.11.0
- **Versione**: nell'app Android in alto compare sempre la versione dell'app (e del suo frontend), non più quella del server; si alza a ogni modifica.
- **Storico**: i numeri di entrate, uscite e bilancio sono più grandi del 30%.
- **Budget sul telefono**: i tre campi del budget stanno nelle stesse tre colonne dei riquadri sotto, senza uscire dallo schermo.
- **Banche**: gli orari stanno su una sola riga (menu senza freccia, più stretti; anche con quattro orari sul telefono).
- **Opzioni**: tolti i testi «la password con cui entri…», «MyBank vX · aggiornamenti automatici alle…», «solo nell'app Android» e «il login resta valido 180 giorni…»; il pannello del server compare solo nell'app e nel localhost.
- **Widget**: barre più spesse del 50%; la barra del mese ora sale dal basso: i giorni già trascorsi sono in basso, in bianco, e il vuoto delle domeniche segue lo stesso verso.

## 0.10.0
- **Il frontend sta nell'APK**: pagina, script, stile e icona dell'app Android sono quelli dell'APK (`assets/www`, copiati da `public/` a ogni build) e la WebView li serve al posto di quelli del server; le chiamate ai dati (`/api/…`) e il resto vanno al server, che ha tutta la logica. Così l'app sul telefono mostra sempre la grafica della sua versione (prima mostrava quella del server, anche vecchia: icona e righe non aggiornate), e basta `npm run apk:installa` per aggiornarla. Il sito nel browser continua a usare le pagine del server; in alto l'app mostra la propria versione.
- **Widget**: le barre sono verticali, a sinistra di ogni cella, e si svuotano dall'alto verso il basso (mese: i giorni che restano, con un vuoto a fine di ogni domenica; categorie: il residuo del budget).
- **Banche → orari**: uno accanto all'altro in orizzontale (si va a capo se non c'è spazio), con la × più vicina all'orario; vale per web e telefono.

## 0.9.0
- **Widget** (telefono): le quattro celle hanno la stessa larghezza; un solo carattere (sans-serif) in tutto il widget; **nessuna riga rossa sulle domeniche**: la barra del mese lascia un vuoto a fine di ogni domenica; i **giorni che restano stanno sopra la barra**; ogni cella di categoria ha una **barra del residuo** (si accorcia man mano che si spende, rossa quando resta il 20% o meno) e **il nome della categoria** (prima il nome non compariva: il codice non lo scriveva); un tocco su **Spesa, Svago o Carburante apre i Movimenti del mese filtrati per quella categoria**, sulla cella del mese apre Banche, altrove l'app.
- **Web**: l'icona dell'app sta all'estrema sinistra, prima del nome; gli indirizzi come `#movimenti:spesa` aprono i Movimenti del mese filtrati per quel tag (li usa il widget) e la pagina segue i cambi di indirizzo.

## 0.8.0
- **Icona**: di nuovo le tre barre di dimensioni diverse con quella in basso rossa (senza cerchio e quadrato), sul sito, in alto a destra nell'app web e nell'APK.
- **Banche → Aggiornamento**: tolti i testi «si memorizzano i movimenti dal…», «massimo 4, tocca un orario per cambiarlo», «le banche non concedono più accessi…», «prossimo…» e «per gli aggiornamenti in più…». Restano l'ultimo aggiornamento, gli orari e «Aggiorna ora»; gli errori dell'ultimo aggiornamento automatico compaiono solo se ci sono.
- **Movimenti**: la barra rossa dei pagamenti in sospeso non cambia più la spaziatura (le altre righe hanno lo stesso margine, trasparente). Sul telefono i dati stanno su tre colonne: data, titolo con sotto il destinatario, importo con sotto la categoria.

## 0.7.0
- **Logo** (proposta B): un quadrato e un cerchio in contorno attorno a tre barre che si accorciano, l'ultima rossa, su fondo inchiostro. È l'icona dell'app Android, l'icona del sito e compare in alto a destra nell'app web (i quattro mockup e la scelta sono in `design/`).
- **Widget**: corretto il «Problema nel caricamento del widget». I separatori erano `<View>`, che il launcher non accetta nei widget (solo FrameLayout, LinearLayout, ImageView, TextView…): ora sono LinearLayout. Un test controlla che i layout dei widget usino solo view ammesse.
- **Storico e Budget su tre colonne**: entrate, uscite e bilancio dell'anno, i tre campi del budget e i tre riquadri del mese stanno sempre affiancati, anche sul telefono.
- **Movimenti sul web** (non sul telefono): a sinistra la data (giorno e mese, sotto l'anno), poi il titolo (la causale se c'è) e sotto il destinatario e il conto, poi l'importo e infine la categoria.

## 0.6.0
- **Movimenti solo dal 1 ottobre 2026** (per ora): quelli precedenti non si leggono dalla banca, non si salvano e non si mostrano; all'avvio il server toglie dai dati quelli già presenti. La data di inizio è `settings.cutoff` (di base `2026-10-01`).
- **Orari di aggiornamento in verticale**, uno sotto l'altro; si tocca un orario per cambiarlo direttamente (menu) e si toglie con «Togli».
- Elenco a discesa leggibile nel tema scuro (testo chiaro su fondo scuro).
- Freccia dei blocchi collassabili uguale per Enable Banking, UniCredit e Revolut.
- Testo della versione dimezzato; tolte le note in fondo allo Storico.
- Demo: avviso rosso «Dati di prova inventati» in alto, per non scambiarli per movimenti veri; la banca finta ora ha dati recenti.
- **Widget**: anteprima con i dati reali nella lista dei widget (Android 15+); prima resta quella con dati di esempio.
- **Localhost solo frontend**: `npm start` serve soltanto le pagine e non ha dati né logica; nella pagina di accesso si sceglie il server a cui collegarsi (ricordato nel browser, «Opzioni → Cambia server» lo cambia) e ogni chiamata va a quel server. Il server vero si avvia con `npm run server` (e da Docker, invariato).
- Frecce dei blocchi collassabili grandi il doppio; testo della versione +35% e poi +20% (13px); orari di aggiornamento tolti con un quadratino con la × rossa.

## 0.5.0
- **Orari di aggiornamento modificabili** (scheda Banche → Aggiornamento): si tolgono con la × e se ne aggiungono con il menu, da 1 a 4 (le banche concedono 4 accessi automatici al giorno); salvati sul server, il prossimo aggiornamento si ricalcola subito. Quelli di base restano 5, 11, 14 e 19.
- **Password da almeno 5 caratteri** (prima 8).
- **Localhost che punta al server**: con `MYBANK_SERVER` nel file `.env`, `npm start` serve le pagine di questa cartella e inoltra dati e login al server (nessun dato locale).

## 0.4.0
- **Opzioni** non è più una scheda: è un pulsante in alto a destra, al posto di «Esci». In cima alle Opzioni c'è **Cambia password**, che apre una finestra (password attuale e due volte la nuova); **Esci** sta in fondo alle Opzioni.
- **Banche collassabili**: UniCredit e Revolut si chiudono e si aprono; Revolut parte chiusa.
- **Versione** in alto a destra al posto della data dell'ultimo aggiornamento (che resta nella scheda Banche), ingrandita del 50%.

## 0.3.1
- **Correzione**: dopo un aggiornamento un browser, l'app o un proxy poteva tenere un `app.js` vecchio con la pagina nuova, e la scheda Opzioni riportava alla pagina iniziale. Ora la pagina non si tiene mai in cache e punta a script e stile con la versione nell'indirizzo (`app.js?v=0.3.1`).

## 0.3.0
- **Scheda Opzioni**: cambio della password dell'account (serve la password attuale, almeno 8 caratteri; salvata come impronta scrypt in `data/auth.json`; gli altri accessi decadono e quello che cambia resta attivo), uscita dall'account, informazioni e, nell'app Android, «Cambia server». `MYBANK_PASSWORD` resta la password iniziale.
- Documentato come ritrovare la chiave di Enable Banking (si scarica una sola volta: se è persa, se ne crea una nuova).

## 0.2.0
- **Prima versione di MyBank**, scritta da zero (server Node, web e app Android con widget).
- **Collegamento di UniCredit e Revolut** con Enable Banking, in sola lettura; storico di un anno (90 giorni se la banca non lo concede).
- **Tag per pocket**: 01 Spesa → Spesa, 02 Svago → Svago, 03 Carburante → Carburante, 04 Altro → Altro; ogni altro pocket, il conto principale e UniCredit → Non definito. Entrate e giroconti riconosciuti in automatico; tag modificabile a mano.
- **Storico** dell'anno con entrate, uscite e bilancio per mese; **Movimenti** con filtri; **Budget** mensile per Spesa, Svago e Carburante.
- **Aggiornamento automatico 4 volte al giorno** (5, 11, 14, 19, ora italiana) e pulsante «Aggiorna ora»; limiti delle banche contati a parte per gli accessi automatici e per quelli a mano.
- **Widget 5×1**: barra del mese con tacche sulle domeniche e giorni che restano, ora dell'ultimo aggiornamento, residuo del budget di Spesa, Svago e Carburante con spesa giornaliera stimata e reale.
- **Estetica nuova** (carta e inchiostro, rosso vermiglio, angoli vivi, serif e monospazio) su web, app, icona e widget.
- Docker (immagine `ghcr.io/jstplink/mybank`), banca finta e demo per provare senza banche vere.

## 0.1.0
- Progetto vuoto: l'app Bilancio è stata archiviata (ramo `archivio/bilancio`, tag `archivio-bilancio-v0.45.0`, che in realtà punta all'ultimo stato, la 0.55.5) e MyBank riparte da zero.
