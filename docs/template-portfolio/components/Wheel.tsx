'use client';

import { useEffect, useRef, useState } from 'react';
import { ORDER, ROLES } from '@/lib/roles';
import { useRole } from '@/hooks/useRole';
import type { RoleKey } from '@/lib/types';

const ROW = 42;
const META: Record<RoleKey, string> = {
  se: 'LV 9 · backend',
  ai: 'LV 4 · applied ml',
  civil: 'LV 9 · structures',
};

/** Hovering the role expands it into a three-row picker. The list is three
 *  copies of ORDER, so it rolls forever; after each step the index is silently
 *  renormalised back into the middle copy. */
export default function Wheel({
  anchor,
  trigger,
}: {
  anchor: React.RefObject<HTMLElement>;
  trigger: React.RefObject<HTMLElement>;
}) {
  const { role, setRole } = useRole();
  const [open, setOpen] = useState(false);
  const rows = useRef<HTMLDivElement>(null);
  const idx = useRef(3);
  const acc = useRef(0);
  const cool = useRef(0);
  const closeT = useRef(0);
  const suppress = useRef(false);

  const ITEMS = [...ORDER, ...ORDER, ...ORDER];

  const place = (animate: boolean) => {
    const el = rows.current;
    if (!el) return;
    el.style.transition = animate ? 'transform .28s cubic-bezier(.2,.9,.25,1)' : 'none';
    el.style.transform = `translateY(${-(idx.current - 1) * ROW}px)`;
  };
  const normalize = () => {
    if (idx.current < 3) { idx.current += 3; place(false); }
    else if (idx.current > 5) { idx.current -= 3; place(false); }
  };
  const goto = (next: number, animate: boolean) => {
    idx.current = next;
    place(animate);
    setRole(ORDER[((next % 3) + 3) % 3]);
    setTimeout(normalize, animate ? 300 : 0);
  };
  const step = (dir: number) => goto(idx.current + dir, true);

  const show = () => {
    if (open || suppress.current) return;
    window.clearTimeout(closeT.current);
    idx.current = 3 + ORDER.indexOf(role);
    setOpen(true);
    requestAnimationFrame(() => place(false));
  };
  const hide = () => setOpen(false);
  const softHide = () => {
    window.clearTimeout(closeT.current);
    closeT.current = window.setTimeout(hide, 160);
  };

  useEffect(() => {
    const wrap = anchor.current;
    const btn = trigger.current;
    if (!wrap || !btn) return;
    const onEnter = () => show();
    const onLeave = () => { suppress.current = false; softHide(); };
    const onClick = () => { if (open) { hide(); suppress.current = true; } else show(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); show(); step(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); show(); step(-1); }
      else if (e.key === 'Escape') hide();
    };
    const onDoc = (e: MouseEvent) => { if (open && !wrap.contains(e.target as Node)) hide(); };
    wrap.addEventListener('mouseenter', onEnter);
    wrap.addEventListener('mouseleave', onLeave);
    btn.addEventListener('click', onClick);
    btn.addEventListener('focus', show);
    btn.addEventListener('keydown', onKey);
    document.addEventListener('click', onDoc);
    return () => {
      wrap.removeEventListener('mouseenter', onEnter);
      wrap.removeEventListener('mouseleave', onLeave);
      btn.removeEventListener('click', onClick);
      btn.removeEventListener('focus', show);
      btn.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onDoc);
    };
  });

  useEffect(() => {
    if (anchor.current) anchor.current.classList.toggle('open', open);
    if (trigger.current) trigger.current.setAttribute('aria-expanded', String(open));
  }, [open, anchor, trigger]);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const now = performance.now();
    acc.current += e.deltaY;
    if (now < cool.current || Math.abs(acc.current) < 26) return;
    step(acc.current > 0 ? 1 : -1);
    acc.current = 0;
    cool.current = now + 170;
  };

  return (
    <div id="wheel" className={open ? 'on' : ''} role="listbox" aria-label="Choose a class"
         onMouseEnter={() => window.clearTimeout(closeT.current)}>
      <div className="win" id="win" onWheel={onWheel}>
        <div className="sel" aria-hidden="true" />
        <div className="rows" id="rows" ref={rows}>
          {ITEMS.map((k, i) => (
            <div
              key={i}
              className={`row${i === idx.current ? ' is-current' : ''}`}
              role="option"
              aria-selected={i === idx.current}
              onClick={() => (i === idx.current ? hide() : goto(i, true))}
            >
              <span className="nm">{ROLES[k].reel}</span>
              <span className="mt">{META[k]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="hint" aria-hidden="true">
        <svg width="8" height="11" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4.5 1.4v9.2M1.6 4.3 4.5 1.2l2.9 3.1M1.6 7.7l2.9 3.1 2.9-3.1" />
        </svg>
        scroll to change class
      </div>
    </div>
  );
}
