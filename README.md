# mermaid-viewer

[![Licenza: MIT](https://img.shields.io/badge/licenza-MIT-blue?style=for-the-badge)](LICENSE)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e1?style=for-the-badge)](https://bun.sh)
[![Zero dipendenze a runtime](https://img.shields.io/badge/dipendenze%20runtime-0-34c759?style=for-the-badge)](#comè-fatto)

Anteprima live di diagrammi [Mermaid](https://mermaid.js.org), in stile estensione
VS Code ma nel browser: apri un `.mmd` da riga di comando e la pagina si ridisegna a
ogni salvataggio **mantenendo zoom e posizione**, così puoi lavorare su un dettaglio
senza perdere l'inquadratura. Zoom senza limiti, markdown reso dentro le celle,
export in SVG, PNG e PDF.

Nato per rileggere mappe concettuali scritte a mano, funziona con qualsiasi file
`.mmd` o `.mermaid`. Niente build, niente account, niente rete: un server locale che
serve una pagina statica e guarda un file.

```bash
mmv "percorso/del/file.mmd"
```

## Funzionalità

- **Ricarica live che non perde il punto** — a ogni salvataggio il diagramma viene
  rifatto, ma zoom e posizione restano quelli di prima. Un pallino accanto al nome
  del file dice se la connessione è viva.
- **Pan e zoom senza limiti** — trascinamento, rotella, pinch, zoom sul puntatore,
  *adatta alla finestra*, ritorno al 100%.
- **Markdown nelle celle** — `**grassetto**`, `*corsivo*` e `` `codice` `` resi
  anche nelle label scritte senza backtick, riscrivendo il sorgente al volo senza
  toccare il file. Disattivabile con una spunta.
- **Export SVG, PNG 1×/2×/4× e PDF** — vettoriale dove conta, con i limiti del PNG
  dichiarati invece di produrre file vuoti (vedi [Come funziona](#come-funziona)).
- **Cinque temi** — auto (segue il sistema), chiaro, scuro, neutro, forest. La
  scelta resta.
- **Selettore di file integrato** — sfoglia le cartelle dal browser (⌘O), con i
  file recenti a portata di clic, oppure trascina un `.mmd` nella finestra.
- **Una sola istanza** — se la porta è già occupata dal visualizzatore, il file
  viene passato a quella attiva in una nuova scheda invece di far fallire il
  comando.
- **Nessuna dipendenza a runtime** — Mermaid è incluso nel repository, il resto è
  JavaScript nativo. Non esce una richiesta di rete.

## Come funziona

Il comando `mmv` avvia un server locale su `127.0.0.1`, apre il browser sulla pagina
e resta in ascolto. Il file viene servito via HTTP e tenuto sotto osservazione con
un canale [SSE](https://developer.mozilla.org/docs/Web/API/Server-sent_events): a
ogni modifica il testo nuovo arriva alla pagina, che rifà solo il render.

### Rilevamento delle modifiche

Il watch confronta il **contenuto** del file ogni 500 ms; `fs.watch` è solo un
acceleratore sui dischi locali. Sembra grossolano, ma è l'unica cosa che regge tutti
e tre i casi:

- **salvataggio atomico** — molti editor scrivono un file temporaneo e lo rinominano
  sopra l'originale, quindi `fs.watch` resta agganciato al vecchio inode e ammutolisce;
- **share di rete (SMB)** — `fs.watch` non notifica nulla, e il client SMB di macOS
  cachea gli attributi: `stat()` continua a restituire lo **stesso `mtime`** anche
  dopo una riscrittura. Il contenuto letto è invece sempre aggiornato, quindi
  confrontare i byte funziona dove confrontare l'`mtime` fallisce in silenzio;
- **disco locale** — qui va tutto, e `fs.watch` rende la risposta immediata.

### Markdown nelle celle

Mermaid interpreta il markdown **solo** dentro le label racchiuse tra backtick, e le
mappe scritte a mano di solito non lo fanno:

```
A("**Controriforma**: reazione della Chiesa")
```

Con l'opzione **Markdown** attiva (default) il sorgente viene riscritto prima di
passarlo a Mermaid, quindi il grassetto si vede senza modificare i file. Le righe di
commento `%%` e le label già in formato markdown vengono lasciate stare.

### Perché il PNG a volte non si può fare

I diagrammi vengono resi con `htmlLabels: true`, altrimenti Mermaid non regge le
etichette multiriga fra backtick e fallisce con *"splitLineToFitWidth does not
support newlines in the line"*. Ma `htmlLabels: true` produce `<foreignObject>`, e un
SVG che li contiene **non è rasterizzabile**: il canvas viene marcato *tainted* e
`toBlob()` solleva `SecurityError`.

Per il PNG si rifà quindi il render con `htmlLabels: false`, che emette `<text>`. Sui
diagrammi senza etichette multiriga funziona; sugli altri no, e il pulsante lo dice
invece di salvare un file vuoto. SVG e PDF funzionano sempre. Oltre ~16384 px per
lato il fattore di scala del PNG viene ridotto in automatico, perché Chrome
produrrebbe un'immagine vuota.

### Com'è fatto

Nessun passo di build: quello che c'è nel repository è quello che gira.

```
mmv                       lanciatore da riga di comando
server.ts                 server Bun: statico, sfoglia i file, watch via SSE
public/index.html
public/app.js             render, pan/zoom, export
public/md-labels.js       riscrittura delle label per il markdown
public/style.css
public/vendor/mermaid.min.js
test.mjs                  regressione su una cartella di .mmd
```

## Installazione

### Requisiti

[Bun](https://bun.sh) 1.1 o superiore. Il lanciatore `mmv` è uno script bash, quindi
serve una shell POSIX: macOS e Linux vanno, su Windows serve WSL o Git Bash.
L'apertura automatica del browser usa il comando `open` di macOS; altrove il server
parte comunque e basta aprire l'indirizzo stampato a terminale.

```bash
git clone https://github.com/mmattia09/mermaid-viewer.git
cd mermaid-viewer
chmod +x mmv
```

Non serve installare nulla per usarlo: `bun install` scarica solo le dipendenze di
sviluppo, che servono ai test e ad aggiornare Mermaid.

### Alias

```bash
alias mmv='~/mermaid-viewer/mmv'
```

Da mettere in `~/.zshrc` o `~/.bashrc`, con il percorso in cui hai clonato il
repository. Poi:

```bash
mmv diagramma.mmd
```

Senza argomenti il visualizzatore parte a vuoto: usa **Apri…** oppure trascina un
file nella finestra.

### Aggiornare Mermaid

```bash
bun install
bun run vendor
```

## Configurazione

Non c'è un file di configurazione: tutto passa da variabili d'ambiente o dai
controlli nella barra.

| Variabile | Default | Cosa fa |
|---|---|---|
| `PORT` | `4321` | Porta di partenza. Se occupata da un'altra istanza il file le viene passato; se la occupa un programma estraneo si provano fino a 12 porte successive |
| `NO_OPEN` | — | Con `NO_OPEN=1` il browser non viene aperto: il server stampa solo l'indirizzo |

Il server ascolta solo su `127.0.0.1` e può sfogliare unicamente tre radici: la home
dell'utente, `/Volumes` e la cartella da cui è stato lanciato. Tutto il resto del
filesystem è fuori portata. Le estensioni riconosciute sono `.mmd` e `.mermaid`.

Tema scelto, cartella dell'ultima apertura e file recenti restano nel `localStorage`
del browser.

### Comandi

| | |
|---|---|
| trascina | sposta il diagramma |
| rotella / due dita | sposta |
| ⌘ o ctrl + rotella, pinch | zoom sul puntatore |
| doppio clic, `F` | adatta alla finestra |
| `+` `−` | zoom |
| `0` | torna al 100% |
| ⌘O | apri un file |

Il pulsante con la percentuale riporta al 100%.

## Test

```bash
bun install
bun test.mjs percorso/della/cartella
```

Rende ogni `.mmd` trovato due volte, grezzo e passato per `prepareMarkdown()`. Usa
`render()` e non `parse()` di proposito: un diagramma può superare il parser e poi
fallire in fase di disegno, ed è esattamente così che era passato inosservato il
problema delle etichette multiriga.

## Contribuire

Segnalazioni e proposte → [GitHub Issues](https://github.com/mmattia09/mermaid-viewer/issues).
Per una pull request:

1. Apri prima una issue se la modifica è grossa, così non lavori a vuoto.
2. Un ramo per argomento, commit piccoli e messaggi in italiano all'imperativo, come
   quelli già presenti.
3. Prima di aprire la PR fai girare i test su una cartella di diagrammi veri e
   controlla che l'export SVG, PNG e PDF funzioni ancora.
4. Niente dipendenze a runtime e niente passi di build: se una funzione richiede un
   pacchetto in più, parliamone nella issue.

Lo stile del codice è quello dei file esistenti — moduli ES, nessun framework,
commenti solo dove il *perché* non si legge dal codice.

## Autori

Di [@mmattia09](https://github.com/mmattia09). Sviluppato con l'aiuto di
[Claude Code](https://claude.com/claude-code).

## Licenza

[MIT](LICENSE).
