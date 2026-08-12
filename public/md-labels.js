/* Markdown dentro le celle.
 *
 * Mermaid interpreta **grassetto**, *corsivo* e `codice` solo dentro le
 * "markdown string", cioè le label racchiuse tra backtick. Le mappe scritte a
 * mano non lo fanno quasi mai, quindi qui le label vengono riscritte al volo
 * prima di passare il sorgente a Mermaid.
 *
 * Il sorgente va attraversato una volta sola tenendo conto del contesto: le
 * label tra virgolette e quelle nude vanno trattate diversamente, e il testo
 * già dentro una stringa non va più toccato. Applicare le due regole in
 * passaggi separati rompe casi come
 *
 *     A("finanziare l'esercito (**Guerra dei Trent'anni**, dal 1618)")
 *
 * dove la parentesi interna verrebbe scambiata per una label nuda.
 */

const MD = /\*\*[^*]+\*\*|__[^_]+__|(?:^|[\s(])\*[^*\s][^*]*\*|`[^`]+`/;

/** Label nude, es. `X(nega il **libero arbitrio**)`. Restiamo conservativi:
 *  niente parentesi, quadre, graffe o virgolette annidate. */
const BARE = /(\[\[|\[\(|\[\/|\[\\|\{\{|\[|\(|\{)([^"`(){}[\]\n]*?)(\]\]|\)\]|\/\]|\\\]|\}\}|\]|\)|\})/g;

const wrapBare = (chunk) =>
  chunk.replace(BARE, (m, open, body, close) =>
    MD.test(body) ? `${open}"\`${body}\`"${close}` : m
  );

export function prepareMarkdown(src) {
  let out = '';
  let plain = '';
  let i = 0;
  const n = src.length;

  // il testo fuori dalle virgolette si accumula e viene trattato in blocco
  const flush = () => { out += wrapBare(plain); plain = ''; };

  while (i < n) {
    // le righe di commento passano intatte
    if (i === 0 || src[i - 1] === '\n') {
      let j = i;
      while (j < n && (src[j] === ' ' || src[j] === '\t')) j++;
      if (src[j] === '%' && src[j + 1] === '%') {
        const eol = src.indexOf('\n', j);
        const end = eol === -1 ? n : eol + 1;
        flush();
        out += src.slice(i, end);
        i = end;
        continue;
      }
    }

    if (src[i] === '"') {
      const close = src.indexOf('"', i + 1);
      if (close === -1) { plain += src.slice(i); break; }  // virgoletta spaiata
      flush();
      const body = src.slice(i + 1, close);
      const already = body.startsWith('`') && body.endsWith('`');
      out += already || !MD.test(body) ? `"${body}"` : `"\`${body}\`"`;
      i = close + 1;
      continue;
    }

    plain += src[i++];
  }

  flush();
  return out;
}
