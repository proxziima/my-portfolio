/** The word-level morph.
 *
 *  The three bios are the same sentences with different vocabulary, so a diff
 *  keeps most words in place and only animates the specialist terms. Three
 *  details matter and each fixes a real bug:
 *
 *  1. multi-word <strong> runs are split into single-word <strong>s, because an
 *     inline-block span containing several words cannot wrap → forced breaks;
 *  2. the tokenizer records the exact whitespace that followed each token, or
 *     `<strong>x</strong>.` renders as `x .`;
 *  3. the trailing space is emitted OUTSIDE the animated span so text wraps.
 */

export interface Token {
  t: string;
  sep: string;
}

const TOKEN =
  /<a class="fav"[\s\S]*?<\/a>|<button class="curiosity-trigger"[\s\S]*?<\/button>|<strong>[\s\S]*?<\/strong>|[^\s]+/g;

const splitStrong = (h: string) =>
  h.replace(/<strong>([^<]*)<\/strong>/g, (_m, inner: string) =>
    inner
      .trim()
      .split(/\s+/)
      .map((w) => `<strong>${w}</strong>`)
      .join(' ')
  );

export function tok(raw: string): Token[] {
  const html = splitStrong(raw);
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  let end = 0;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(html))) {
    if (out.length) out[out.length - 1].sep = html.slice(end, m.index);
    out.push({ t: m[0], sep: '' });
    end = m.index + m[0].length;
  }
  return out;
}

/** Longest common subsequence over token text. */
export function lcs(A: Token[], B: Token[]) {
  const a = A.map((x) => x.t);
  const b = B.map((x) => x.t);
  const n = a.length;
  const m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const keepA = new Set<number>();
  const keepB = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      keepA.add(i);
      keepB.add(j);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { keepA, keepB };
}

export const wrap = (tokens: Token[], keep: Set<number>, cls: string) =>
  tokens
    .map((tk, i) => `<span class="w${keep.has(i) ? '' : ' ' + cls}">${tk.t}</span>${tk.sep}`)
    .join('');

export const allOf = (arr: unknown[]) => new Set(arr.map((_, i) => i));

/** Drives the two-phase swap on a container element.
 *  Returns a disposer that flushes any pending swap. */
export function createMorph(el: HTMLElement, bios: (key: string) => string[]) {
  let pendingTimer = 0;
  let pendingKey: string | null = null;
  let rendered: string | null = null;

  const render = (key: string) => {
    el.innerHTML = bios(key)
      .map((p) => {
        const t = tok(p);
        return `<p>${wrap(t, allOf(t), '')}</p>`;
      })
      .join('');
    rendered = key;
  };

  const flush = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = 0;
      if (pendingKey) render(pendingKey);
      pendingKey = null;
    }
  };

  const to = (nextKey: string, reduce: boolean) => {
    flush();
    const next = bios(nextKey);
    const prev = rendered ? bios(rendered) : null;
    if (!prev || reduce) {
      render(nextKey);
      return;
    }
    const plans = next.map((p, k) => {
      const a = tok(prev[k] || '');
      const b = tok(p);
      const r = lcs(a, b);
      return { b, keepA: r.keepA, keepB: r.keepB };
    });
    Array.from(el.children).forEach((p, k) => {
      p.querySelectorAll('.w').forEach((s, i) => {
        if (plans[k] && !plans[k].keepA.has(i)) s.classList.add('out');
      });
    });
    pendingKey = nextKey;
    pendingTimer = window.setTimeout(() => {
      pendingTimer = 0;
      pendingKey = null;
      el.innerHTML = plans.map((pl) => `<p>${wrap(pl.b, pl.keepB, 'in')}</p>`).join('');
      rendered = nextKey;
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          el.querySelectorAll('.w.in').forEach((s, i) => {
            (s as HTMLElement).style.transitionDelay = `${(i % 14) * 9}ms`;
            s.classList.remove('in');
          })
        )
      );
    }, 240);
  };

  return { to, render, flush };
}
