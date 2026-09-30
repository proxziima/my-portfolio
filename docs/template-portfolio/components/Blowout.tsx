'use client';

import { useRef } from 'react';
import { playBulb, thud, audio } from '@/lib/audio';

/** Flick the switch too fast and the bulb goes.
 *  10 clicks inside 4s; from the 6th the filament starts to complain. */
const WINDOW = 4000;
const NEEDED = 10;
const WARN = 6;

export function useBlowout() {
  const clicks = useRef<number[]>([]);
  const active = useRef(false);
  const flickT = useRef(0);

  const flicker = (level: number) => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.setAttribute('data-flicker', String(Math.min(4, level)));
    window.clearTimeout(flickT.current);
    flickT.current = window.setTimeout(() => root.removeAttribute('data-flicker'), 420);
  };

  const register = () => {
    const now = performance.now();
    clicks.current.push(now);
    while (clicks.current.length && now - clicks.current[0] > WINDOW) clicks.current.shift();
    if (active.current) return;
    if (clicks.current.length >= NEEDED) {
      clicks.current.length = 0;
      run();
      return;
    }
    if (clicks.current.length >= WARN) flicker(clicks.current.length - WARN + 1);
  };

  function run() {
    active.current = true;
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const prevTheme = root.getAttribute('data-theme');
    const sw = document.getElementById('switcher')!;
    const r = sw.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    playBulb();

    const flash = document.createElement('div');
    flash.className = 'bo-flash';
    const veil = document.createElement('div');
    veil.className = 'bo-veil';
    for (const el of [flash, veil]) {
      el.style.setProperty('--x', cx + 'px');
      el.style.setProperty('--y', cy + 'px');
      document.body.appendChild(el);
    }
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-blackout', '');
    requestAnimationFrame(() => {
      flash.classList.add('in');
      veil.classList.add('in');
    });

    /* the switch comes off the wall */
    const ghost = sw.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('id');
    ghost.className = 'bo-fall';
    ghost.querySelectorAll('[id]').forEach((e) => e.removeAttribute('id'));
    Object.assign(ghost.style, {
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
    });
    const src = document.getElementById('rockerc') as HTMLCanvasElement | null;
    const gc = ghost.querySelector('canvas');
    if (gc && src) {
      try {
        gc.getContext('2d')!.drawImage(src, 0, 0);
      } catch {}
    }
    document.body.appendChild(ghost);
    sw.style.opacity = '0';
    sw.style.pointerEvents = 'none';

    /* shards */
    const shards = Array.from({ length: reduce ? 0 : 16 }, () => {
      const el = document.createElement('div');
      el.className = 'bo-shard';
      const sz = 3 + Math.random() * 5;
      el.style.width = sz + 'px';
      el.style.height = sz * (0.6 + Math.random()) + 'px';
      document.body.appendChild(el);
      const a = Math.random() * Math.PI * 2;
      const sp = 260 + Math.random() * 520;
      return { el, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260, ang: 0, va: (Math.random() - 0.5) * 24, life: 1 };
    });

    /* physics */
    const floor = innerHeight - r.height - 4;
    let x = r.left;
    let y = r.top;
    let vx = (Math.random() - 0.5) * 220;
    let vy = -160;
    let ang = 0;
    let va = (Math.random() - 0.5) * 7;
    const g = 2700;
    let last = performance.now();
    const stopAt = last + 3600;
    if (reduce) ghost.style.transform = `translate(0, ${floor - r.top}px) rotate(.35rad)`;

    const step = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      if (!reduce) {
        vy += g * dt;
        x += vx * dt;
        y += vy * dt;
        ang += va * dt;
        if (x < 2) { x = 2; vx = Math.abs(vx) * 0.5; }
        if (x > innerWidth - r.width - 2) { x = innerWidth - r.width - 2; vx = -Math.abs(vx) * 0.5; }
        if (y >= floor) {
          y = floor;
          if (Math.abs(vy) > 160) {
            vy = -vy * 0.34; vx *= 0.72; va = (Math.random() - 0.5) * 9 + va * 0.35;
            thud(Math.min(1, Math.abs(vy) / 800));
          } else {
            vy = 0; vx *= 0.82; va *= 0.7;
            ang += (Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) - ang) * 0.12;
          }
        }
        ghost.style.transform = `translate(${(x - r.left).toFixed(1)}px, ${(y - r.top).toFixed(1)}px) rotate(${ang.toFixed(3)}rad)`;
        for (const s of shards) {
          s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.ang += s.va * dt;
          if (s.y > innerHeight - 4) { s.y = innerHeight - 4; s.vy = -s.vy * 0.3; s.vx *= 0.6; s.life -= 0.25; }
          s.life -= dt * 0.22;
          s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.ang}rad)`;
          s.el.style.opacity = String(Math.max(0, s.life));
        }
      }
      if (now < stopAt) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    /* the lights come back: a puff at the mount, the switch inside it, then the room */
    setTimeout(() => {
      ghost.classList.add('out');
      shards.forEach((s) => { s.el.style.transition = 'opacity .4s'; s.el.style.opacity = '0'; });
      poof();
      puff(cx, cy, reduce);
      sw.style.opacity = '';
      sw.style.pointerEvents = '';
      sw.style.transformOrigin = '50% 50%';
      if (!reduce)
        sw.animate(
          [
            { transform: 'scale(.45)', opacity: 0 },
            { transform: 'scale(1.09)', opacity: 1, offset: 0.62 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 420, delay: 90, easing: 'cubic-bezier(.2,1.1,.3,1)', fill: 'backwards' }
        );

      setTimeout(() => {
        root.removeAttribute('data-blackout');
        if (prevTheme) root.setAttribute('data-theme', prevTheme);
        else root.removeAttribute('data-theme');
      }, 160);
      setTimeout(() => { veil.classList.remove('in'); veil.classList.add('out'); }, 520);
      setTimeout(() => {
        veil.remove(); flash.remove(); ghost.remove();
        shards.forEach((s) => s.el.remove());
        active.current = false;
      }, 1500);
    }, 3300);
  }

  return { register, active: () => active.current };
}

function puff(cx: number, cy: number, reduce: boolean) {
  if (reduce) return;
  const N = 11;
  for (let i = 0; i < N; i++) {
    const e = document.createElement('span');
    e.className = 'bo-puff';
    const a = (i / N) * Math.PI * 2 + Math.random() * 0.6;
    const d = 8 + Math.random() * 26;
    const size = 26 + Math.random() * 30;
    e.style.width = e.style.height = size + 'px';
    e.style.left = cx - size / 2 + 'px';
    e.style.top = cy - size / 2 + 'px';
    document.body.appendChild(e);
    const dx = Math.cos(a) * d;
    const dy = Math.sin(a) * d - 10;
    const anim = e.animate(
      [
        { transform: 'translate(0,0) scale(.3)', opacity: 0 },
        { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(1)`, opacity: 0.85, offset: 0.18 },
        { transform: `translate(${dx * 1.6}px, ${dy * 1.8 - 22}px) scale(1.7)`, opacity: 0 },
      ],
      { duration: 720 + Math.random() * 320, easing: 'cubic-bezier(.16,.7,.3,1)', fill: 'forwards' }
    );
    anim.onfinish = () => e.remove();
  }
}

function poof() {
  try {
    const t = audio();
    if (!t) return;
    const n = t.currentTime;
    const r = 0.32;
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate);
    const a = buf.getChannelData(0);
    for (let i = 0; i < a.length; i++) {
      const s = i / t.sampleRate;
      a[i] = (Math.random() * 2 - 1) * Math.pow(1 - s / r, 1.6) * (1 - Math.exp(-s * 260));
    }
    const src = t.createBufferSource();
    const lp = t.createBiquadFilter();
    const g = t.createGain();
    src.buffer = buf;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, n);
    lp.frequency.exponentialRampToValueAtTime(220, n + r);
    g.gain.setValueAtTime(0.001, n);
    g.gain.exponentialRampToValueAtTime(0.28, n + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, n + r);
    src.connect(lp).connect(g).connect(t.destination);
    src.start(n);
    src.stop(n + r);
  } catch {}
}
