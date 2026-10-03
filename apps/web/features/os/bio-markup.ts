/**
 * The letter's bio paragraphs (lib/cms/bio-html.ts) for the OS: the curious-mode toggle is a page
 * feature, so its switch role goes and the word stays as plain text (os.css hides the switch track).
 */
export const osBioHtml = (paragraphs: readonly string[]): string =>
  paragraphs
    .map((p) => `<p>${p.replace(/<button class="curiosity-trigger"[^>]*>/g, '<span class="curiosity-trigger">').replaceAll('</button>', '</span>')}</p>`)
    .join('')
