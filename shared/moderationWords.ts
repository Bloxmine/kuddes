/**
 * Matching the admin's word list (Toezicht, shared/bots.ts): used by the
 * watching bot on the server, and by Beheer to try a text out.
 */
/** Lower case, without accents, and the usual disguises undone (k0t, $p@m). */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[01345@$]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '@': 'a', $: 's' })[c]!)

/** "kut*" as a test on whole words: * is anything, and letters may be spaced out or repeated ("k u u u t"). */
function wordPattern(entry: string) {
  const letters = fold(entry.trim())
    .split('*')
    .map((part) =>
      [...part]
        .filter((ch) => /[a-z0-9]/.test(ch))
        // Each letter once or more, with spaces or dots between ("k u u t", "k.u.t")
        .map((ch) => `(?:${ch}[\\s._-]*)+`)
        .join(''),
    )
  const body = letters.join('[a-z]*')
  return body ? new RegExp(`(^|[^a-z])${body}(?=$|[^a-z])`) : null
}

/** The entries on the list that a text uses. */
export function wordsIn(text: string, words: string[]) {
  const folded = fold(text)
  return words.filter((w) => wordPattern(w)?.test(folded))
}
