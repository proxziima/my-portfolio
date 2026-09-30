'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ROLES } from '@/lib/roles';
import { useRole } from '@/hooks/useRole';
import {
  MODELS, SEG_COUNT, SYS_PATHS, NET, DESCENT, TRUCK, L, H, WZ,
} from '@/lib/models';
import type { RoleKey } from '@/lib/types';

/** The figure. One LineSegments of 760 segments morphs between the three
 *  models; a Points cloud carries what moves through them; a third layer holds
 *  the curious-mode annotations. */
export default function Plate() {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { role, hooks, reduce } = useRole();
  const api = useRef<{ to: (k: RoleKey) => void } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const holder = box.current;
    if (!el || !holder) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, alpha: true, antialias: true });
    } catch {
      holder.style.display = 'none';
      return; // hooks stay no-ops; the page is fine without this
    }
    (THREE as any).ColorManagement.enabled = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 3, 0.1, 100);
    const world = new THREE.Group();
    scene.add(world);

    /* the morphing line work */
    const pos = new Float32Array(SEG_COUNT * 6);
    const from = new Float32Array(SEG_COUNT * 6);
    const to = new Float32Array(SEG_COUNT * 6);
    pos.set(MODELS[role]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.85 });
    world.add(new THREE.LineSegments(geo, mat));

    /* what moves through it */
    const PN = 130;
    const flowPos = new Float32Array(PN * 3);
    const flowT = new Float32Array(PN);
    const flowP = new Float32Array(PN * 4);
    const flowGeo = new THREE.BufferGeometry();
    flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos, 3));
    const flowMat = new THREE.PointsMaterial({ size: 0.055, transparent: true, opacity: 0, depthWrite: false });
    world.add(new THREE.Points(flowGeo, flowMat));

    /* the truck on the bridge */
    const truckGeo = new THREE.BufferGeometry();
    const tArr = new Float32Array(TRUCK.length * 6);
    TRUCK.forEach((sg: number[], i: number) => tArr.set(sg, i * 6));
    truckGeo.setAttribute('position', new THREE.BufferAttribute(tArr, 3));
    const truckMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0 });
    const truck = new THREE.LineSegments(truckGeo, truckMat);
    truck.visible = false;
    world.add(truck);
    let truckT = 0.2;

    /* colours glide over the same 380ms the CSS takes */
    const lineTarget = new THREE.Color();
    let settled = false;
    const repaint = () => {
      const cs = getComputedStyle(document.body);
      lineTarget.set(cs.getPropertyValue('--line3d').trim() || '#3A3A34');
      settled = false;
    };
    repaint();
    mat.color.copy(lineTarget);
    flowMat.color.copy(lineTarget);

    /* morph */
    let pT = 1;
    const delay = new Float32Array(SEG_COUNT).map(() => Math.random() * 0.4);
    let cur: RoleKey = role;
    const seedFlow = (key: RoleKey) => {
      for (let i = 0; i < PN; i++) {
        flowT[i] = Math.random();
        if (key === 'se') {
          flowP[i * 4] = Math.floor(Math.random() * SYS_PATHS.length);
          flowP[i * 4 + 1] = 0.35 + Math.random() * 0.45;
        } else if (key === 'ai') {
          const li = Math.floor(Math.random() * (NET.length - 1));
          flowP[i * 4] = li;
          flowP[i * 4 + 1] = Math.floor(Math.random() * NET[li].length);
          flowP[i * 4 + 2] = Math.floor(Math.random() * NET[li + 1].length);
          flowP[i * 4 + 3] = 0.45 + Math.random() * 0.8;
        } else {
          flowP[i * 4] = -H / 2 - 1.22 - Math.random() * 0.32;
          flowP[i * 4 + 1] = (Math.random() - 0.5) * 0.5;
          flowP[i * 4 + 2] = 0.12 + Math.random() * 0.12;
        }
      }
    };
    seedFlow(role);

    const plateTo = (key: RoleKey) => {
      cur = key;
      from.set(pos);
      to.set(MODELS[key]);
      for (let i = 0; i < SEG_COUNT; i++) delay[i] = Math.random() * 0.4;
      seedFlow(key);
      if (reduce) { pos.set(MODELS[key]); geo.attributes.position.needsUpdate = true; pT = 1; }
      else pT = 0;
    };
    api.current = { to: plateTo };
    hooks.current.plate = plateTo as any;
    hooks.current.repaint = repaint;

    /* orbit: drifts, follows the pointer, yields to a drag */
    let tiltX = -0.17, tiltY = 0.34, aimX = -0.17, aimY = 0.34, spin = 0;
    let drag = false, lastX = 0, lastY = 0;
    const onMove = (e: PointerEvent) => {
      const r = holder.getBoundingClientRect();
      if (drag) {
        spin += (e.clientX - lastX) * 0.007;
        aimX = Math.max(-0.7, Math.min(0.7, aimX + (e.clientY - lastY) * 0.005));
        lastX = e.clientX; lastY = e.clientY;
        return;
      }
      aimY = 0.34 + ((e.clientX - r.left) / r.width - 0.5) * 0.7;
      aimX = -0.17 + ((e.clientY - r.top) / r.height - 0.5) * 0.3;
    };
    const onDown = (e: PointerEvent) => { drag = true; lastX = e.clientX; lastY = e.clientY; };
    const onUp = () => { drag = false; };
    const onLeave = () => { if (!drag) { aimX = -0.17; aimY = 0.34; } };
    holder.addEventListener('pointermove', onMove);
    holder.addEventListener('pointerdown', onDown);
    holder.addEventListener('pointerleave', onLeave);
    addEventListener('pointerup', onUp);

    const resize = () => {
      const r = holder.getBoundingClientRect();
      if (r.width < 2) return;
      renderer.setSize(r.width, r.height, false);
      cam.aspect = r.width / r.height;
      cam.updateProjectionMatrix();
      cam.position.set(0, 0.1, r.width < 460 ? 9.8 : 7.3);
      cam.lookAt(0, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(holder);

    const mo = new MutationObserver(repaint);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tmp: [number, number, number] = [0, 0, 0];
    const pathPoint = (path: any, t: number) => {
      if (!path._lens) {
        const l = [0];
        for (let i = 1; i < path.length; i++)
          l.push(l[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]));
        path._lens = l;
      }
      const lens = path._lens;
      const d = t * lens[lens.length - 1];
      let i = 1;
      while (i < lens.length - 1 && lens[i] < d) i++;
      const a = path[i - 1], b = path[i];
      const u = (d - lens[i - 1]) / (lens[i] - lens[i - 1] || 1);
      tmp[0] = a[0] + (b[0] - a[0]) * u;
      tmp[1] = a[1] + (b[1] - a[1]) * u;
      tmp[2] = a[2] + (b[2] - a[2]) * u;
    };

    let raf = 0, last = performance.now(), clock = 0;
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      clock += dt;

      if (!settled) {
        mat.color.lerp(lineTarget, Math.min(1, dt * 7.5));
        flowMat.color.copy(mat.color);
        if (Math.abs(mat.color.r - lineTarget.r) + Math.abs(mat.color.g - lineTarget.g) + Math.abs(mat.color.b - lineTarget.b) < 0.004) {
          mat.color.copy(lineTarget); flowMat.color.copy(lineTarget); settled = true;
        }
      }

      if (pT < 1) {
        pT = Math.min(1, pT + dt * 1.15);
        for (let i = 0; i < SEG_COUNT; i++) {
          const p = ease(Math.min(1, Math.max(0, (pT - delay[i]) / 0.6)));
          for (let v = 0; v < 6; v++) {
            const k = i * 6 + v;
            pos[k] = from[k] + (to[k] - from[k]) * p;
          }
        }
        geo.attributes.position.needsUpdate = true;
      }

      if (!reduce) {
        for (let i = 0; i < PN; i++) {
          const k = i * 3;
          if (cur === 'se') {
            flowT[i] += dt * flowP[i * 4 + 1] * 0.28;
            if (flowT[i] > 1) { flowT[i] -= 1; flowP[i * 4] = Math.floor(Math.random() * SYS_PATHS.length); }
            pathPoint(SYS_PATHS[flowP[i * 4]], flowT[i]);
            flowPos[k] = tmp[0]; flowPos[k + 1] = tmp[1]; flowPos[k + 2] = tmp[2];
          } else if (cur === 'ai') {
            if (i < 3) {
              flowT[i] += dt * 0.09;
              if (flowT[i] > 1) flowT[i] -= 1;
              pathPoint(DESCENT, flowT[i]);
              flowPos[k] = tmp[0]; flowPos[k + 1] = tmp[1] + 0.04; flowPos[k + 2] = tmp[2];
              continue;
            }
            flowT[i] += dt * flowP[i * 4 + 3] * 0.5;
            if (flowT[i] > 1) {
              flowT[i] -= 1;
              const li = Math.floor(Math.random() * (NET.length - 1));
              flowP[i * 4] = li;
              flowP[i * 4 + 1] = Math.floor(Math.random() * NET[li].length);
              flowP[i * 4 + 2] = Math.floor(Math.random() * NET[li + 1].length);
            }
            const a = NET[flowP[i * 4]][flowP[i * 4 + 1]];
            const b = NET[flowP[i * 4] + 1][flowP[i * 4 + 2]];
            if (a && b) {
              const t = flowT[i];
              flowPos[k] = a[0] + (b[0] - a[0]) * t;
              flowPos[k + 1] = a[1] + (b[1] - a[1]) * t;
              flowPos[k + 2] = a[2] + (b[2] - a[2]) * t;
            }
          } else {
            flowT[i] += dt * flowP[i * 4 + 2] * 0.25;
            if (flowT[i] > 1) flowT[i] -= 1;
            const t = flowT[i];
            flowPos[k] = -L / 2 - 1.3 + t * (L + 2.6);
            flowPos[k + 1] = flowP[i * 4] + Math.sin(t * 9) * 0.03;
            flowPos[k + 2] = flowP[i * 4 + 1];
          }
        }
        flowGeo.attributes.position.needsUpdate = true;
      }
      flowMat.opacity += ((pT > 0.85 ? 0.85 : 0) - flowMat.opacity) * Math.min(1, dt * 3.4);

      truckT += dt * 0.11;
      if (truckT > 1) truckT -= 1;
      truck.position.set(-L / 2 - 0.9 + truckT * (L + 1.8), -Math.sin(truckT * Math.PI) * 0.05, 0);
      truckMat.color.copy(mat.color);
      truckMat.opacity += ((cur === 'civil' && pT > 0.85 ? 0.9 : 0) - truckMat.opacity) * Math.min(1, dt * 4);
      truck.visible = truckMat.opacity > 0.01;

      tiltX += (aimX - tiltX) * 0.07;
      tiltY += (aimY - tiltY) * 0.07;
      world.rotation.x = tiltX;
      world.rotation.y = tiltY + spin + (reduce ? 0 : Math.sin(clock * 0.2) * 0.07);
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
      holder.removeEventListener('pointermove', onMove);
      holder.removeEventListener('pointerdown', onDown);
      holder.removeEventListener('pointerleave', onLeave);
      removeEventListener('pointerup', onUp);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api.current?.to(role);
  }, [role]);

  return (
    <figure className="plate" id="plate">
      <div className="platebox" id="platebox" ref={box}>
        <canvas id="platec" ref={canvas} />
      </div>
      <figcaption id="platecap">{ROLES[role].plate}</figcaption>
    </figure>
  );
}
