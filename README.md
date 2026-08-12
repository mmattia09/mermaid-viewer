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

I diagrammi sono renderizzati con `htmlLabels: false`, quindi l'SVG contiene `<text>`
e non `<foreignObject>`: è la condizione che permette all'export PNG di funzionare.

## Com'è fatto

Nessun build step, nessuna dipendenza a runtime.

```
server.mjs                node puro: statico + watch dei file via SSE
public/index.html
public/app.js             render, pan/zoom, export
public/style.css
public/vendor/mermaid.min.js
```

Il watch combina `fs.watch` e un poll di sicurezza ogni secondo, deduplicando sul
`mtime`: da solo `fs.watch` perde gli aggiornamenti degli editor che salvano con
rename+replace.

Se apri un file col pulsante **Apri…** invece che da riga di comando, il live reload
passa dal File System Access API (Chrome, Edge). Su Safari e Firefox in quel caso il
file viene caricato una volta sola — il pallino accanto al nome resta rosso.

Aggiornare Mermaid:

```bash
cd ~/mermaid-viewer && npm update mermaid
cp node_modules/mermaid/dist/mermaid.min.js public/vendor/
```
