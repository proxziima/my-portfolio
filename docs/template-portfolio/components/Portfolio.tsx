'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ORDER, ROLES } from '@/lib/roles';
import type { Hooks, RoleKey } from '@/lib/types';
import { RoleContext } from '@/hooks/useRole';
import WallSwitch from './WallSwitch';
import Reel from './Reel';
import Bio from './Bio';
import Plate from './Plate';
import Lists from './Lists';
import CuriousMode from './CuriousMode';

export default function Portfolio({
  initialRole = 'se',
  initialBio,
}: {
  initialRole?: RoleKey;
  initialBio?: string[];
}) {
  const [role, setRoleState] = useState<RoleKey>(initialRole);
  const [reduce, setReduce] = useState(false);

  /** The seam to the imperative layers. Plate and CuriousMode overwrite these
   *  when they mount; until then they are no-ops, which is exactly what keeps
   *  the page usable when WebGL is unavailable. */
  const hooks = useRef<Hooks>({
    reel: () => {},
    plate: () => {},
    repaint: () => {},
    annot: () => {},
    curiousRelayout: () => {},
    isCurious: () => false,
  });

  /* restore the role from the hash or storage, once */
  useEffect(() => {
    setReduce(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const hash = location.hash.slice(1) as RoleKey;
    let next: RoleKey | null = ORDER.includes(hash) ? hash : null;
    if (!next) {
      try {
        const s = localStorage.getItem('rl-role') as RoleKey | null;
        if (s && ORDER.includes(s)) next = s;
      } catch {}
    }
    if (next && next !== role) setRoleState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRole = useCallback((key: RoleKey) => {
    if (!ROLES[key]) return;
    setRoleState((prev) => {
      hooks.current.reel(key);
      if (prev !== key) {
        hooks.current.plate(key);
        hooks.current.curiousRelayout();
        try {
          localStorage.setItem('rl-role', key);
        } catch {}
        history.replaceState(null, '', '#' + key);
      }
      return key;
    });
  }, []);

  /* 1 / 2 / 3 switch role from anywhere */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (/input|textarea/i.test(t.tagName)) return;
      const map: Record<string, RoleKey> = { '1': 'se', '2': 'ai', '3': 'civil' };
      if (map[e.key]) setRole(map[e.key]);
    };
    const onHash = () => {
      const k = location.hash.slice(1) as RoleKey;
      if (ORDER.includes(k)) setRole(k);
    };
    document.addEventListener('keydown', onKey);
    addEventListener('hashchange', onHash);
    return () => {
      document.removeEventListener('keydown', onKey);
      removeEventListener('hashchange', onHash);
    };
  }, [setRole]);

  const r = ROLES[role];

  return (
    <RoleContext.Provider value={{ role, setRole, hooks, reduce }}>
      <div id="flick" aria-hidden="true" />
      <div id="curiosity-overlay" className="curiosity-overlay" aria-hidden="true" />

      <main>
        <WallSwitch />

        <h1>
          <span className="who">Vinicius Queiroz</span>
          <span className="what">
            <Reel />
            <span className="tail">and builder.</span>
          </span>
        </h1>
        <p className="sr" role="status">
          {r.say} selected
        </p>

        <Bio initial={initialBio} />
        <Plate />

        <nav className="links" id="links">
          <a className="fav" href="mailto:vqueiroz@autodoc.com.br">
            <i className="chip">@</i>
            <span>Send me a message</span>
          </a>
          <a className="fav" href="#">
            <i className="chip">in</i>
            <span>/in/vqueiroz</span>
          </a>
          <a className="fav" href="#">
            <i className="chip">gh</i>
            <span>@vqueiroz</span>
          </a>
        </nav>

        <Lists />
      </main>

      <CuriousMode />
    </RoleContext.Provider>
  );
}
