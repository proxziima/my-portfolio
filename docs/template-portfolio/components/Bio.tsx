'use client';

import { useEffect, useRef } from 'react';
import { ROLES } from '@/lib/roles';
import { createMorph, tok, wrap, allOf } from '@/lib/morph';
import { useRole } from '@/hooks/useRole';

/** The letter. Deliberately imperative: the morph needs a two-phase class dance
 *  and per-word transition delays that React's reconciler would fight. */
export default function Bio({ initial }: { initial?: string[] }) {
  const el = useRef<HTMLDivElement>(null);
  const morph = useRef<ReturnType<typeof createMorph> | null>(null);
  const { role, reduce } = useRole();
  const first = useRef(true);

  useEffect(() => {
    if (!el.current) return;
    if (!morph.current) morph.current = createMorph(el.current, (k) => ROLES[k as keyof typeof ROLES].bio);
    if (first.current) {
      first.current = false;
      morph.current.render(role);
      return;
    }
    morph.current.to(role, reduce);
  }, [role, reduce]);

  /* server-rendered first paint, so the text is in the HTML */
  const ssr = (initial ?? ROLES.se.bio)
    .map((p) => {
      const t = tok(p);
      return `<p>${wrap(t, allOf(t), '')}</p>`;
    })
    .join('');

  return <div className="bio" id="bio" ref={el} dangerouslySetInnerHTML={{ __html: ssr }} />;
}
