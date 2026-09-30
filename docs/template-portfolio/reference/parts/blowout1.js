
/* =================== the blowout: flick the switch too fast and the bulb goes =================== */
const blowout = (function(){
  const clicks = []; let active = false;
  const WINDOW = 4000, NEEDED = 10, WARN = 6;

  function register(){
    const now = performance.now();
    clicks.push(now);
    while(clicks.length && now - clicks[0] > WINDOW) clicks.shift();
    if(active) return;
    if(clicks.length >= NEEDED){ clicks.length = 0; run(); return; }
    if(clicks.length >= 2) loadBulb();
    if(clicks.length >= WARN) flicker(clicks.length - WARN + 1);   /* the filament starts to complain */
  }
  let flickT = 0;
  function flicker(level){
    if(reduce) return;
    root.setAttribute('data-flicker', String(Math.min(4, level)));
    clearTimeout(flickT); flickT = setTimeout(()=> root.removeAttribute('data-flicker'), 420);
  }

  /* ---- sounds ---- */
  /* decoded once, played through the same context as the switch click */
  let bulbBuf = null, bulbLoading = null;
  function loadBulb(){
    const t = audio(); if(!t || bulbBuf || bulbLoading) return bulbLoading;
    bulbLoading = fetch(BULB_MP3).then(r=>r.arrayBuffer())
      .then(ab=>new Promise((res,rej)=>{ const p = t.decodeAudioData(ab, res, rej); if(p && p.then) p.then(res, rej); }))
      .then(buf=>{ bulbBuf = buf; }).catch(()=>{ bulbLoading = null; });
    return bulbLoading;
  }
  function pop(){
    try{
      const t = audio(); if(!t) return; const n = t.currentTime;
      if(bulbBuf){
        const s = t.createBufferSource(), g = t.createGain();
        s.buffer = bulbBuf; g.gain.value = .9;
        s.connect(g).connect(t.destination); s.start(n);
      } else {
        /* not decoded yet: the plain element still gets the sound out */
        try{ const a = new Audio(BULB_MP3); a.volume = .9; a.play().catch(()=>{}); }catch(e){}
      }
      /* a little low end under the sample */
      const o = t.createOscillator(), og = t.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(100, n); o.frequency.exponentialRampToValueAtTime(36, n + .26);
      og.gain.setValueAtTime(.32, n); og.gain.exponentialRampToValueAtTime(1e-4, n + .32);
      o.connect(og).connect(t.destination); o.start(n); o.stop(n + .34);
    }catch(e){}
  }
  function thud(v){
    try{
      const t = audio(); if(!t) return; const n = t.currentTime, r = .09;
      const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate), a = buf.getChannelData(0);
      for(let i = 0; i < a.length; i++){ const s = i / t.sampleRate; a[i] = (Math.random() * 2 - 1) * Math.exp(-s * 60); }
      const src = t.createBufferSource(), lp = t.createBiquadFilter(), g = t.createGain();
      src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(.18 * v, n); g.gain.exponentialRampToValueAtTime(1e-4, n + r);
      src.connect(lp).connect(g).connect(t.destination); src.start(n); src.stop(n + r);
      const o = t.createOscillator(), og = t.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(95, n); o.frequency.exponentialRampToValueAtTime(50, n + .08);
      og.gain.setValueAtTime(.22 * v, n); og.gain.exponentialRampToValueAtTime(1e-4, n + .1);
      o.connect(og).connect(t.destination); o.start(n); o.stop(n + .11);
    }catch(e){}
  }

  function run(){
    active = true;
    const prevTheme = root.getAttribute('data-theme');
    const sw = document.getElementById('switcher');
    const r = sw.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    /* the bulb goes */
    pop();
    const flash = document.createElement('div'); flash.className = 'bo-flash';
    const veil = document.createElement('div'); veil.className = 'bo-veil';
    for(const el of [flash, veil]){ el.style.setProperty('--x', cx + 'px'); el.style.setProperty('--y', cy + 'px'); document.body.appendChild(el); }
    root.setAttribute('data-theme', 'dark'); root.setAttribute('data-blackout', '');
    syncWall(); hooks.repaint();
    requestAnimationFrame(()=>{ flash.classList.add('in'); veil.classList.add('in'); });

    /* the switch comes off the wall */
    const ghost = sw.cloneNode(true); ghost.removeAttribute('id'); ghost.className = 'bo-fall';
    ghost.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));
    ghost.style.left = r.left + 'px'; ghost.style.top = r.top + 'px';
    ghost.style.width = r.width + 'px'; ghost.style.height = r.height + 'px';
    const gc = ghost.querySelector('canvas');
    if(gc && motionReady){ try{ gc.getContext('2d').drawImage(rockerC, 0, 0); }catch(e){} }
    document.body.appendChild(ghost);
    sw.style.opacity = '0'; sw.style.pointerEvents = 'none';

    /* shards */
    const shards = [];
    const NS = reduce ? 0 : 16;
    for(let i = 0; i < NS; i++){
      const s = document.createElement('div'); s.className = 'bo-shard';
      const sz = 3 + Math.random() * 5; s.style.width = sz + 'px'; s.style.height = sz * (0.6 + Math.random()) + 'px';
      document.body.appendChild(s);
      const a = Math.random() * Math.PI * 2, sp = 260 + Math.random() * 520;
      shards.push({ el:s, x:cx, y:cy, vx:Math.cos(a) * sp, vy:Math.sin(a) * sp - 260, ang:0, va:(Math.random() - .5) * 24, life:1 });
    }

    /* physics */
    const floor = innerHeight - r.height - 4;
    let x = r.left, y = r.top, vx = (Math.random() - .5) * 220, vy = -160, ang = 0, va = (Math.random() - .5) * 7;
    const g = 2700; let last = performance.now(); const stopAt = last + 3600;
    if(reduce){ vy = 0; ghost.style.transform = 'translate(0,' + (floor - r.top) + 'px) rotate(.35rad)'; }
    const step = now => {
      const dt = Math.min(.033, (now - last) / 1000); last = now;
      if(!reduce){
        vy += g * dt; x += vx * dt; y += vy * dt; ang += va * dt;
        if(x < 2){ x = 2; vx = Math.abs(vx) * .5; } if(x > innerWidth - r.width - 2){ x = innerWidth - r.width - 2; vx = -Math.abs(vx) * .5; }
        if(y >= floor){
          y = floor;
          if(Math.abs(vy) > 160){ vy = -vy * .34; vx *= .72; va = (Math.random() - .5) * 9 + va * .35; thud(Math.min(1, Math.abs(vy) / 800)); }
          else { vy = 0; vx *= .82; va *= .7; ang += (Math.round(ang / (Math.PI / 2)) * (Math.PI / 2) - ang) * .12; }
        }
        ghost.style.transform = 'translate(' + (x - r.left).toFixed(1) + 'px,' + (y - r.top).toFixed(1) + 'px) rotate(' + ang.toFixed(3) + 'rad)';
        for(const s of shards){
          s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.ang += s.va * dt;
          if(s.y > innerHeight - 4){ s.y = innerHeight - 4; s.vy = -s.vy * .3; s.vx *= .6; s.life -= .25; }
          s.life -= dt * .22;
          s.el.style.transform = 'translate(' + s.x + 'px,' + s.y + 'px) rotate(' + s.ang + 'rad)';
          s.el.style.opacity = Math.max(0, s.life);
        }
      }
      if(now < stopAt) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    /* the lights come back: a puff at the mount, the switch back inside it, then the room */
    setTimeout(()=>{
      ghost.classList.add('out');
      shards.forEach(s=>{ s.el.style.transition = 'opacity .4s'; s.el.style.opacity = 0; });
      poof();
      puff(cx, cy);
      /* the switch reappears inside the puff */
      sw.style.opacity = ''; sw.style.pointerEvents = '';
      sw.style.transformOrigin = '50% 50%';
      if(!reduce) sw.animate(
        [{transform:'scale(.45)', opacity:0}, {transform:'scale(1.09)', opacity:1, offset:.62}, {transform:'scale(1)', opacity:1}],
        {duration:420, delay:90, easing:'cubic-bezier(.2,1.1,.3,1)', fill:'backwards'});
      /* the theme is put back while the veil still hides the room… */
      setTimeout(()=>{
        root.removeAttribute('data-blackout');
        if(prevTheme) root.setAttribute('data-theme', prevTheme); else root.removeAttribute('data-theme');
        syncWall(); hooks.repaint(); rockerTo(isDark() ? 1 : 0, false);
      }, 160);
      /* …and the room comes back slowly */
      setTimeout(()=>{ veil.classList.remove('in'); veil.classList.add('out'); }, 520);
      setTimeout(()=>{
        veil.remove(); flash.remove(); ghost.remove(); shards.forEach(s=>s.el.remove());
        active = false;
      }, 1500);
    }, 3300);
  }

  /* a puff of smoke where the switch was */
  function puff(cx, cy){
    if(reduce) return;
    const N = 11;
    for(let i = 0; i < N; i++){
      const e = document.createElement('span'); e.className = 'bo-puff';
      const a = (i / N) * Math.PI * 2 + Math.random() * .6, d = 8 + Math.random() * 26;
      const size = 26 + Math.random() * 30;
      e.style.width = e.style.height = size + 'px';
      e.style.left = (cx - size/2) + 'px'; e.style.top = (cy - size/2) + 'px';
      document.body.appendChild(e);
      const dx = Math.cos(a) * d, dy = Math.sin(a) * d - 10;
      e.animate(
        [{transform:'translate(0,0) scale(.3)', opacity:0},
         {transform:'translate('+dx*.6+'px,'+dy*.6+'px) scale(1)', opacity:.85, offset:.18},
         {transform:'translate('+dx*1.6+'px,'+(dy*1.8 - 22)+'px) scale(1.7)', opacity:0}],
        {duration:720 + Math.random()*320, easing:'cubic-bezier(.16,.7,.3,1)', fill:'forwards'})
        .onfinish = ()=> e.remove();
    }
  }
  function poof(){
    try{
      const t = audio(); if(!t) return; const n = t.currentTime, r = .32;
      const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate), a = buf.getChannelData(0);
      for(let i = 0; i < a.length; i++){ const s = i / t.sampleRate; a[i] = (Math.random()*2-1) * Math.pow(1 - s/r, 1.6) * (1 - Math.exp(-s*260)); }
      const src = t.createBufferSource(), lp = t.createBiquadFilter(), g = t.createGain();
      src.buffer = buf; lp.type = 'lowpass';
      lp.frequency.setValueAtTime(1600, n); lp.frequency.exponentialRampToValueAtTime(220, n + r);
      g.gain.setValueAtTime(.001, n); g.gain.exponentialRampToValueAtTime(.28, n + .02); g.gain.exponentialRampToValueAtTime(1e-4, n + r);
      src.connect(lp).connect(g).connect(t.destination); src.start(n); src.stop(n + r);
    }catch(e){}
  }
  return { register, get active(){ return active; }, get bulbReady(){ return !!bulbBuf; } };
})();
