
/* =================== state, content, theme (no WebGL dependency) =================== */
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const root = document.documentElement;
const hooks = { reel:()=>{}, plate:()=>{}, repaint:()=>{}, annot:()=>{}, curiousRelayout:()=>{}, isCurious:()=>false };

let current = 'se';
try{ const s = localStorage.getItem('rl-role'); if(ROLES[s]) current = s; }catch(e){}
if(ROLES[location.hash.slice(1)]) current = location.hash.slice(1);

/* ---- word-level morph ---- */
const TOKEN = /<a class="fav"[\s\S]*?<\/a>|<button class="curiosity-trigger"[\s\S]*?<\/button>|<strong>[\s\S]*?<\/strong>|[^\s]+/g;
/* keep each token together with the exact whitespace that followed it */
const splitStrong = h => h.replace(/<strong>([^<]*)<\/strong>/g,
  (m,inner)=> inner.trim().split(/\s+/).map(w=>'<strong>'+w+'</strong>').join(' '));
function tok(raw){
  const html = splitStrong(raw);
  const out=[]; let m, end=0;
  TOKEN.lastIndex = 0;
  while((m = TOKEN.exec(html))){
    if(out.length) out[out.length-1].sep = html.slice(end, m.index);
    out.push({t:m[0], sep:''});
    end = m.index + m[0].length;
  }
  return out;
}
function lcs(A,B){
  const a=A.map(x=>x.t), b=B.map(x=>x.t);
  const n=a.length, m=b.length, dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--)
    dp[i][j] = a[i]===b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const keepA=new Set(), keepB=new Set(); let i=0,j=0;
  while(i<n && j<m){
    if(a[i]===b[j]){ keepA.add(i); keepB.add(j); i++; j++; }
    else if(dp[i+1][j] >= dp[i][j+1]) i++; else j++;
  }
  return {keepA, keepB};
}
const wrap = (tokens, keep, cls) => tokens.map((tk,i)=>
  '<span class="w'+(keep.has(i)?'':' '+cls)+'">'+tk.t+'</span>'+tk.sep).join('');
const allOf = arr => new Set(arr.map((_,i)=>i));

let pendingTimer = 0, pendingKey = null;
function renderBio(bio, key){
  bio.innerHTML = ROLES[key].bio.map(p=>{ const t=tok(p); return '<p>'+wrap(t, allOf(t), '')+'</p>'; }).join('');
}
function morphBio(nextKey){
  const bio = document.getElementById('bio');
  if(pendingTimer){ clearTimeout(pendingTimer); pendingTimer = 0; renderBio(bio, pendingKey); }
  const next = ROLES[nextKey].bio;
  const prev = bio.dataset.role ? ROLES[bio.dataset.role].bio : null;
  bio.dataset.role = nextKey;
  if(!prev || reduce){ renderBio(bio, nextKey); return; }
  const plans = next.map((p,k)=>{ const a=tok(prev[k]||''), b=tok(p); const r=lcs(a,b); return {a,b,keepA:r.keepA,keepB:r.keepB}; });
  [...bio.children].forEach((p,k)=>{
    p.querySelectorAll('.w').forEach((s,i)=>{ if(plans[k] && !plans[k].keepA.has(i)) s.classList.add('out'); });
  });
  pendingKey = nextKey;
  pendingTimer = setTimeout(()=>{
    pendingTimer = 0; pendingKey = null;
    bio.innerHTML = plans.map(pl=>'<p>'+wrap(pl.b, pl.keepB, 'in')+'</p>').join('');
    requestAnimationFrame(()=>requestAnimationFrame(()=>
      bio.querySelectorAll('.w.in').forEach((s,i)=>{ s.style.transitionDelay=(i%14)*9+'ms'; s.classList.remove('in'); })));
  }, 240);
}
function fillLists(key){
  const r = ROLES[key];
  document.getElementById('work').innerHTML = r.work.map(w=>
    '<li><div class="pos"><a class="fav" href="#"><i class="chip">'+w[0]+'</i><span>'+w[1]+'</span></a>'+
    '<span class="desc">'+w[2]+'</span></div><span class="years">'+w[3]+'</span></li>').join('');
  document.getElementById('projects').innerHTML = r.projects.map(p=>
    '<li><div class="pos"><a class="fav" href="#"><i class="chip">'+p[0]+'</i><span>'+p[1]+'</span></a>'+
    '<span class="desc">'+p[2]+'</span></div></li>').join('');
  document.getElementById('platecap').textContent = r.plate;
  document.getElementById('say').textContent = r.say + ' selected';
  document.getElementById('reel').setAttribute('aria-label', r.say + '. Open the class list.');
}
document.getElementById('links').innerHTML =
  '<a class="fav" href="mailto:vqueiroz@autodoc.com.br"><i class="chip">@</i><span>Send me a message</span></a>'+
  '<a class="fav" href="#"><i class="chip">in</i><span>/in/vqueiroz</span></a>'+
  '<a class="fav" href="#"><i class="chip">gh</i><span>@vqueiroz</span></a>';
morphBio(current); fillLists(current);

function setRole(key){
  if(!ROLES[key]) return;
  const changed = key !== current;
  current = key;
  hooks.reel(key);
  if(changed){ morphBio(key); fillLists(key); hooks.plate(key); hooks.curiousRelayout(); }
  try{ localStorage.setItem('rl-role', key); }catch(e){}
  history.replaceState(null,'','#'+key);
}
document.addEventListener('keydown', e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||/input|textarea/i.test(e.target.tagName)) return;
  const m={'1':'se','2':'ai','3':'civil'}; if(m[e.key]) setRole(m[e.key]);
});
addEventListener('hashchange', ()=>{ const k=location.hash.slice(1); if(ROLES[k]&&k!==current) setRole(k); });

/* ---- the wall switch: the reference's rocker atlas, its timing and its click ---- */
try{ const t=localStorage.getItem('rl-theme'); if(t) root.setAttribute('data-theme',t); }catch(e){}
const isDark = ()=> root.getAttribute('data-theme')==='dark' ||
  (!root.getAttribute('data-theme') && matchMedia('(prefers-color-scheme:dark)').matches);

const ATLAS = { src:'theme-switch/rocker-atlas.webp', frames:17, columns:5, width:212, height:280 };
const wall = document.getElementById('wall'), wallStage = document.getElementById('wallstage'),
      rockerC = document.getElementById('rockerc'), rockerX = rockerC.getContext('2d');
const atlas = new Image(); let motionReady = false, frameNow = isDark() ? 1 : 0, rockerRaf = 0, transT = 0;
function drawFrame(p){
  const n = Math.round(p * (ATLAS.frames - 1));
  rockerX.clearRect(0, 0, rockerC.width, rockerC.height);
  rockerX.drawImage(atlas, (n % ATLAS.columns) * ATLAS.width, Math.floor(n / ATLAS.columns) * ATLAS.height,
    ATLAS.width, ATLAS.height, 0, 0, rockerC.width, rockerC.height);
  frameNow = p;
}
let rockerTarget = frameNow, lastToggle = 0;
function rockerTo(target, rapid){
  /* a flip that is still running finishes instantly, so every click starts from a rested rocker */
  if(rockerRaf){ cancelAnimationFrame(rockerRaf); rockerRaf = 0; if(motionReady) drawFrame(rockerTarget); frameNow = rockerTarget; }
  rockerTarget = target;
  if(!motionReady || reduce || frameNow === target){ if(motionReady) drawFrame(target); frameNow = target; return; }
  const from = frameNow, start = performance.now();
  const dur = (rapid ? 115 : 200) * Math.abs(target - from);
  const tick = now => {
    const o = Math.max(0, Math.min(1, (now - start) / dur)), s = o * o * (3 - 2 * o);
    drawFrame(from + (target - from) * s);
    rockerRaf = o < 1 ? requestAnimationFrame(tick) : 0;
  };
  rockerRaf = requestAnimationFrame(tick);
}
atlas.decoding = 'async'; atlas.src = ATLAS.src;
(atlas.decode ? atlas.decode() : new Promise((res, rej)=>{ atlas.onload = res; atlas.onerror = rej; })).then(()=>{
  if(atlas.naturalWidth !== ATLAS.width * ATLAS.columns ||
     atlas.naturalHeight !== ATLAS.height * Math.ceil(ATLAS.frames / ATLAS.columns)) throw Error('atlas');
  motionReady = true; drawFrame(isDark() ? 1 : 0); wallStage.dataset.motionReady = 'true';
}).catch(()=>{ motionReady = false; });

let actx = null;
const AC = window.AudioContext || window.webkitAudioContext;
function audio(){ if(!AC) return null; actx = actx || new AC(); if(actx.state === 'suspended') actx.resume(); return actx; }
function clickSound(theme){
  try{
    const t = audio(); if(!t) return;
    const n = t.currentTime, r = .065;
    const buf = t.createBuffer(1, Math.ceil(t.sampleRate * r), t.sampleRate), a = buf.getChannelData(0);
    let o = 42;
    for(let e = 0; e < a.length; e++){
      o = o * 16807 % 2147483647;
      const w = o / 2147483647 * 2 - 1, s = e / t.sampleRate;
      a[e] = w * (Math.exp(-s * 132) + (s > .016 ? Math.exp(-(s - .016) * 220) * .52 : 0));
    }
    const src = t.createBufferSource(), bp = t.createBiquadFilter(), g = t.createGain();
    src.buffer = buf; bp.type = 'bandpass';
    const u = theme === 'light' ? 1450 : 1050;
    bp.frequency.setValueAtTime(u, n); bp.frequency.exponentialRampToValueAtTime(u * .74, n + r); bp.Q.setValueAtTime(.72, n);
    g.gain.setValueAtTime(1e-4, n);
    g.gain.exponentialRampToValueAtTime(theme === 'light' ? .115 : .105, n + .002);
    g.gain.exponentialRampToValueAtTime(1e-4, n + r);
    src.connect(bp).connect(g).connect(t.destination); src.start(n); src.stop(n + r);
  }catch(e){}
}
function syncWall(){
  const dark = isDark();
  wall.setAttribute('aria-pressed', dark ? 'true' : 'false');
  wall.setAttribute('aria-label', dark ? 'Turn the lights on' : 'Turn the lights off');
}
function themeTransition(){
  if(reduce) return;
  clearTimeout(transT); root.dataset.themeTransition = 'true'; void root.offsetWidth;
  transT = setTimeout(()=>{ delete root.dataset.themeTransition; }, 380);
}
function applyTheme(next){
  root.setAttribute('data-theme', next);
  try{ localStorage.setItem('rl-theme', next); }catch(e){}
  syncWall(); hooks.repaint();
}
syncWall();
/* the host may stamp its theme after load: keep the rocker on the right frame */
try{
  const settle = ()=>{ syncWall(); if(!rockerRaf && rockerTarget !== (isDark() ? 1 : 0)) rockerTo(isDark() ? 1 : 0); };
  new MutationObserver(settle).observe(root, {attributes:true, attributeFilter:['data-theme']});
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change', settle);
}catch(e){}
wall.addEventListener('click', ()=>{
  if(blowout.active) return;
  const next = isDark() ? 'light' : 'dark';
  const now = performance.now(), rapid = now - lastToggle < 300; lastToggle = now;
  themeTransition();
  applyTheme(next); clickSound(next); rockerTo(next === 'dark' ? 1 : 0, rapid);
  blowout.register();
});

/* ---- keyboard + pointer on the reel work with or without WebGL ---- */
const reelEl = document.getElementById('reel');
reelEl.addEventListener('keydown', e=>{
  const d = e.key==='ArrowDown'||e.key==='ArrowRight' ? 1 : e.key==='ArrowUp'||e.key==='ArrowLeft' ? -1 : 0;
  if(!d) return; e.preventDefault();
  setRole(ORDER[(ORDER.indexOf(current)+d+3)%3]);
});
