# mermaid-viewer

Anteprima Mermaid in stile estensione VS Code: si aggiorna da sola mentre modifichi
il file, zoom senza limiti, markdown reso dentro le celle, export in SVG, PNG e PDF.

Nato per le mappe di storia in `~/diagrammi`, ma funziona
con qualsiasi `.mmd`.

## Uso

```bash
~/mermaid-viewer/mmv "percorso/del/file.mmd"
```

Apre il browser sul file e lo tiene sotto osservazione: ogni salvataggio ridisegna il
diagramma **mantenendo zoom e posizione**, così puoi lavorare su un dettaglio senza
perdere l'inquadratura a ogni modifica.

Senza argomenti parte a vuoto: usa **Apri…** oppure trascina un file nella finestra.

Un alias comodo da mettere in `~/.zshrc`:

```bash
alias mmv='~/mermaid-viewer/mmv'
```

## Comandi

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

## Markdown nelle celle

Mermaid interpreta `**grassetto**`, `*corsivo*` e `` `codice` `` **solo** dentro le
label racchiuse tra backtick. Le mappe scritte a mano di solito non lo fanno:

```
A("**Controriforma**: reazione della Chiesa")
```

Con l'opzione **Markdown** attiva (default) il sorgente viene riscritto al volo prima
di passarlo a Mermaid, quindi il grassetto si vede senza toccare i file. Le righe di
commento `%%` e le label già in formato markdown vengono lasciate stare.

Togli la spunta per vedere il file esattamente com'è.

## Export

- **SVG** — vettoriale, sfondo opaco secondo il tema
- **PNG 1× / 2× / 4×** — se il diagramma è enorme il fattore viene ridotto in
  automatico e te lo dice: oltre ~16384px per lato Chrome produrrebbe un file vuoto
- **PDF** — apre la finestra di stampa con la pagina già dimensionata sul diagramma:
  scegli *Salva come PDF*. Resta vettoriale

SVG e PDF funzionano sempre. Il PNG no, e vale la pena sapere perché.

I diagrammi vanno renderizzati con `htmlLabels: true`, altrimenti Mermaid non regge
le etichette multiriga fra backtick — quelle scritte così —

```
GI4A("`- ricche pensioni ai parlamentari
- mantenimento del feudalesimo`")
```

e fallisce con *"splitLineToFitWidth does not support newlines in the line"*. Ma
`htmlLabels: true` produce `<foreignObject>`, e un SVG che li contiene **non è
rasterizzabile**: il canvas viene marcato *tainted* e `toBlob()` solleva
`SecurityError`.

Per il PNG si rifà quindi il render con `htmlLabels: false`, che emette `<text>`. Sui
diagrammi senza etichette multiriga funziona; sugli altri non è possibile, e il
pulsante lo dice invece di salvare un file vuoto.

## Com'è fatto

Nessun build step, nessuna dipendenza a runtime.

```
server.mjs                node puro: statico + watch dei file via SSE
public/index.html
public/app.js             render, pan/zoom, export
public/md-labels.js       riscrittura delle label per il markdown
public/style.css
public/vendor/mermaid.min.js
test.mjs                  regressione su una cartella di .mmd
```

### Test

```bash
node test.mjs ~/diagrammi
```

Rende ogni `.mmd` due volte, grezzo e passato per `prepareMarkdown()`. Usa
`render()` e non `parse()` di proposito: un diagramma può superare il parser e poi
fallire in fase di disegno, ed è esattamente così che era passato inosservato il
problema delle etichette multiriga.

### Come vengono rilevate le modifiche

Il watch confronta il **contenuto** del file ogni 500 ms; `fs.watch` è solo un
acceleratore sui dischi locali. Sembra grossolano, ma è l'unica cosa che regge
tutti e tre i casi:

- **salvataggio atomico** — VS Code scrive un file temporaneo e lo rinomina sopra
  l'originale, quindi `fs.watch` resta agganciato al vecchio inode e ammutolisce;
- **share SMB** (`/Volumes/share` sta su TrueNAS) — `fs.watch` non notifica
  proprio nulla, e il client SMB di macOS cachea gli attributi: `stat()` continua
  a restituire lo **stesso `mtime`** anche dopo una riscrittura. Il contenuto
  letto è invece sempre aggiornato, quindi confrontare i byte funziona dove
  confrontare l'`mtime` fallisce in silenzio;
- **disco locale** — qui va tutto, e `fs.watch` rende la risposta immediata.

### Porta occupata

La porta di default è la 4321. Se è già occupata da un'altra istanza del
visualizzatore, quella nuova non parte: passa il file a quella già attiva aprendo
una scheda. Se invece la occupa un programma estraneo, prova le porte successive.

Se apri un file col pulsante **Apri…** invece che da riga di comando, il live reload
passa dal File System Access API (Chrome, Edge). Su Safari e Firefox in quel caso il
file viene caricato una volta sola — il pallino accanto al nome resta rosso.

Aggiornare Mermaid:

```bash
cd ~/mermaid-viewer && npm update mermaid
cp node_modules/mermaid/dist/mermaid.min.js public/vendor/
```
