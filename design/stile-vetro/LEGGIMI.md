# Stile «vetro» di MyBank: kit per altre app

Contenuto:
- `tema.css`: variabili, 8 palette (`data-pal`) e componenti pronti (`vt-*`). Il font Figtree si carica da `fonts/` (copia anche la cartella).
- `palette.js`: scelta della palette e memoria in `localStorage` (modulo ES: `palettePicker(elemento)`, `applyPalette(nome)`).
- `esempio.html`: pagina di prova (aprila da un server locale, per esempio `npx serve`, perché usa un modulo ES).
- `riferimento-mybank.css`: il CSS reale di MyBank (blocco vetro con palette e tutte le schermate), per copiare le soluzioni di dettaglio.

## Uso

```html
<link rel="stylesheet" href="tema.css">
<body class="vt" data-pal="grafite"> <div class="vt-page"> … </div> </body>
```

Palette: grafite (predefinita, neutra), ambra, salvia, ghiaccio, lime, turchese, arancio, smeraldo. Per aggiungerne una basta un blocco `.vt[data-pal="nome"]` con le variabili `--g0 --g1 --g2` (sfondo), `--acc --acc2 --acc-rgb --acc2-rgb --onacc` (accento e testo sopra l'accento), `--good --bad --bad-rgb` (entrate e avvisi), `--mute` (testo secondario).

## Regole dello stile (da dare a chi, o a quale AI, lo applica)

- Solo tema scuro. Sfondo quasi nero con una sfumatura leggerissima a 170° (`--g0` → `--g1` → `--g2`) e tre aloni d'accento molto tenui.
- Contenuti in **schede di vetro**: sfondo bianco al 5–7,5%, filetto chiaro (`rgba(255,255,255,.15)`), riflesso sul bordo alto (`inset 0 1px 0`), ombra morbida, angoli **22px**, sfocatura 12px. La cifra principale sta in una scheda con tinta d'accento.
- **Un solo accento** (`--acc`) per scelta attiva, pulsante principale, barre e titoli di sezione (barra verticale di 4px a sinistra); il colore di avviso (`--bad`) solo per uscite, arretrati ed errori; `--good` per le entrate.
- Carattere **Figtree** ovunque (500–800); cifre con `tabular-nums`. Scala del testo unica: 11 (etichette maiuscole, spaziate) · 13 · 15 · 22 · 34.
- Forme tonde: pulsanti 16px, campi 14px, targhette e barre a pillola (999px). Nessun bordo spesso, nessuna ombra colorata, niente riflessi decorativi aggiuntivi (intensità scelta «1,5»: né piatto né ricco).
- Barra delle schede in basso sul telefono: vetro con sfocatura, scheda attiva con sfondo bianco al 10% e testo d'accento.
- **Intestazioni di scheda a fascia d'accento** (`vt-sect` + `vt-head`): la fascia riempie il bordo alto della scheda (sfumatura d'accento 20% → 7%), titolo 15px, a destra un contatore e, se la scheda si chiude, un chevron lime; aperta ha un filetto d'accento da 2px sotto la fascia, chiusa la scheda è tutta stondata e senza filetto; la versione fissa (non collassabile) è la stessa senza chevron. Niente barre verticali.
- Il titolo della pagina sta in alto a sinistra (nome della scheda), senza logo.
- **Spaziature** (linee guida flessibili, base di 4 px): tra pannelli 14–16; dentro un pannello 16; testata → contenuto 14; righe di elenco 12 sopra e sotto; etichetta → valore 4–6; campi e pulsanti vicini 10; targhette 8; campi e pulsanti alti 44 (40 se compatti); almeno 24 tra gruppi distinti. Dentro un gruppo si sta stretti, tra gruppi larghi: la distanza dice cosa è legato a cosa.
