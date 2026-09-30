'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ORDER, ROLES } from '@/lib/roles';
import { useRole } from '@/hooks/useRole';
import Wheel from './Wheel';

const RH = 36;
const RW = 340;

/** The role in the headline: a three-sided drum, one face per discipline.
 *  Orthographic, so the front face is pixel-flat and the text stays crisp;
 *  back faces are culled, which is what stops the other roles ghosting through. */
export default function Reel() {
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { role, hooks, reduce } = useRole();
  const [webgl, setWebgl] = useState(true);

  const api = useRef<{ to: (k: string) => void; paint: () => void } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true });
    } catch {
      setWebgl(false);
      return;
    }
    // modern three manages colour by default and would shift these hexes
    (THREE as any).ColorManagement.enabled = false;

    const DPR = Math.min(devicePixelRatio || 1, 2);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-RW / 2, RW / 2, RH / 2, -RH / 2, 0.1, 1000);
    cam.position.z = 100;
    renderer.setPixelRatio(DPR);
    renderer.setSize(RW, RH, false);
    el.style.width = RW + 'px';
    el.style.height = RH + 'px';

    const drum = new THREE.Group();
    scene.add(drum);
    const R = RH / (2 * Math.sqrt(3));

    const faces = ORDER.map((key, i) => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(RW * DPR * 2);
      cv.height = Math.round(RH * DPR * 2);
      const tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = 8;
      tex.minFilter = THREE.LinearFilter;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(RW, RH),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide, depthWrite: false })
      );
      const a = (i * Math.PI * 2) / 3;
      mesh.position.set(0, R * Math.sin(a), R * Math.cos(a));
      mesh.rotation.x = -a;
      drum.add(mesh);
      return { cv, tex, key, width: RW };
    });

    const sizeReel = () => {
      const f = faces[ORDER.indexOf(role as any)];
      if (btn.current) btn.current.style.width = Math.min(f.width, RW) + 'px';
    };

    const paint = (colour?: string) => {
      const col = colour || getComputedStyle(document.body).getPropertyValue('--ink-soft').trim() || '#686863';
      faces.forEach((f) => {
        const g = f.cv.getContext('2d')!;
        const s = DPR * 2;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, f.cv.width, f.cv.height);
        g.scale(s, s);
        g.font = `430 28px ${getComputedStyle(document.body).fontFamily}`;
        g.fillStyle = col;
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        const text = ROLES[f.key].reel;
        g.fillText(text, 1, RH / 2 + 1);
        f.width = Math.ceil(g.measureText(text).width) + 4;
        f.tex.needsUpdate = true;
      });
      sizeReel();
    };

    /* rotating by phi moves a face's angle by -phi, so the front face for
       index i needs phi = +i*2pi/3 (getting this backwards swaps AI and Civil) */
    let now = ORDER.indexOf(role as any) * ((Math.PI * 2) / 3);
    let want = now;
    const to = (key: string) => {
      const t = ORDER.indexOf(key as any) * ((Math.PI * 2) / 3);
      const d = (((t - want + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      want += d;
      if (reduce) now = want;
      sizeReel();
    };
    const faceIndex = () => ((Math.round(now / ((Math.PI * 2) / 3)) % 3) + 3) % 3;

    api.current = { to, paint };
    hooks.current.reel = to as any;
    paint();
    if (document.fonts?.ready) void document.fonts.ready.then(() => paint());

    let raf = 0;
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      now += (want - now) * Math.min(1, dt * 9);
      // self-heal: if we ever rest on the wrong face, correct it
      if (Math.abs(want - now) < 0.0015 && faceIndex() !== ORDER.indexOf(role as any)) to(role);
      drum.rotation.x = now;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const mo = new MutationObserver(() => paint());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.to(role);
  }, [role]);

  return (
    <span className="reelwrap" id="reelwrap" ref={wrap}>
      <button
        className="reel"
        id="reel"
        ref={btn}
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-label={`${ROLES[role].say}. Open the class list.`}
      >
        {webgl ? (
          <canvas id="reelc" ref={canvas} />
        ) : (
          <span style={{ display: 'block', font: '430 28px var(--font-inter)', color: 'var(--ink-soft)', lineHeight: '36px' }}>
            {ROLES[role].reel}
          </span>
        )}
      </button>
      <Wheel anchor={wrap} trigger={btn} />
    </span>
  );
}
