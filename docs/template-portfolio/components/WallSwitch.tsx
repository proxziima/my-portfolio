'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { useRole } from '@/hooks/useRole';
import { clickSound, warmBulb } from '@/lib/audio';
import { useBlowout } from './Blowout';

/** The reference site's rocker, frame for frame.
 *  17-frame atlas, 5 columns, 212×280 each; frame 0 = lights on. */
const ATLAS = { src: '/theme-switch/rocker-atlas.webp', frames: 17, columns: 5, width: 212, height: 280 };

export default function WallSwitch() {
  const { theme, apply, isDark } = useTheme();
  const { hooks, reduce } = useRole();
  const blowout = useBlowout();

  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const ready = useRef(false);
  const frame = useRef(isDark ? 1 : 0);
  const target = useRef(frame.current);
  const raf = useRef(0);
  const lastToggle = useRef(0);

  const draw = useCallback((p: number) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx || !img.current) return;
    const n = Math.round(p * (ATLAS.frames - 1));
    ctx.clearRect(0, 0, ATLAS.width, ATLAS.height);
    ctx.drawImage(
      img.current,
      (n % ATLAS.columns) * ATLAS.width,
      Math.floor(n / ATLAS.columns) * ATLAS.height,
      ATLAS.width,
      ATLAS.height,
      0,
      0,
      ATLAS.width,
      ATLAS.height
    );
    frame.current = p;
  }, []);

  /** A click during a flip finishes that flip instantly, so every click starts
   *  from a rested rocker. Rapid clicks get a shorter flip so it keeps pace. */
  const rockerTo = useCallback(
    (to: number, rapid = false) => {
      if (raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        if (ready.current) draw(target.current);
        frame.current = target.current;
      }
      target.current = to;
      if (!ready.current || reduce || frame.current === to) {
        if (ready.current) draw(to);
        frame.current = to;
        return;
      }
      const from = frame.current;
      const start = performance.now();
      const dur = (rapid ? 115 : 200) * Math.abs(to - from);
      const tick = (now: number) => {
        const o = Math.max(0, Math.min(1, (now - start) / dur));
        const s = o * o * (3 - 2 * o);
        draw(from + (to - from) * s);
        raf.current = o < 1 ? requestAnimationFrame(tick) : 0;
      };
      raf.current = requestAnimationFrame(tick);
    },
    [draw, reduce]
  );

  /* decode the atlas, validate it, then hand over from the <img> fallback */
  useEffect(() => {
    const a = new Image();
    a.decoding = 'async';
    a.src = ATLAS.src;
    img.current = a;
    const done = a.decode ? a.decode() : new Promise<void>((res, rej) => { a.onload = () => res(); a.onerror = rej; });
    done
      .then(() => {
        if (
          a.naturalWidth !== ATLAS.width * ATLAS.columns ||
          a.naturalHeight !== ATLAS.height * Math.ceil(ATLAS.frames / ATLAS.columns)
        )
          throw new Error('unexpected rocker atlas dimensions');
        ready.current = true;
        draw(isDark ? 1 : 0);
        if (stage.current) stage.current.dataset.motionReady = 'true';
      })
      .catch(() => {
        ready.current = false;
      });
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* follow the theme when it changes from anywhere else */
  useEffect(() => {
    if (!raf.current) rockerTo(isDark ? 1 : 0);
  }, [isDark, rockerTo]);

  const onClick = () => {
    if (blowout.active()) return;
    const now = performance.now();
    const rapid = now - lastToggle.current < 300;
    lastToggle.current = now;
    const next = isDark ? 'light' : 'dark';
    apply(next); // keeps the 380ms transition alive even on rapid clicks
    clickSound(next);
    rockerTo(next === 'dark' ? 1 : 0, rapid);
    void warmBulb();
    blowout.register();
    hooks.current.repaint();
  };

  return (
    <div className="theme-switcher" id="switcher">
      <button
        className="theme-wall-toggle"
        id="wall"
        type="button"
        aria-pressed={isDark}
        aria-label={isDark ? 'Turn the lights on' : 'Turn the lights off'}
        onClick={onClick}
      >
        <span className="theme-wall-stage" id="wallstage" ref={stage} aria-hidden="true">
          {/* no-JS / no-canvas fallback; hidden once data-motion-ready is set */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="theme-wall-image theme-wall-state theme-wall-state--light" src="/theme-switch/rocker-on.webp" alt="" width={530} height={700} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="theme-wall-image theme-wall-state theme-wall-state--dark" src="/theme-switch/rocker-off.webp" alt="" width={530} height={700} />
          <canvas className="theme-wall-image theme-wall-motion" id="rockerc" ref={canvas} width={212} height={280} />
        </span>
      </button>
    </div>
  );
}
