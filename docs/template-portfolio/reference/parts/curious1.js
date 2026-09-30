
/* =================== curious mode: the page shows its working =================== */
(function(){
  const ov = document.getElementById('curiosity-overlay');
  let curious = false;
  try{ curious = localStorage.getItem('rl-curious') === '1'; }catch(e){}

  /* notes about the page itself, in the reference's voice */
  const PAGE_NOTES = {
    h1:     'Inter, everywhere. One family keeps the page quiet.',
    width:  '{w}px. Narrow enough to read; wide enough to breathe.',
    wall:   'A real rocker, 17 frames. Flick it ten times and see what happens.',
    gap:    '64px between sections. Separate, not disconnected.',
    chips:  '16px chips: enough character\nwithout becoming a logo wall.',
    reel:   'Hover the role. It rolls, the letter rewrites itself — only the words that change.'
  };
  /* notes about the model, per discipline */
  const MODEL_NOTES = {
    se:[
      {side:'right', text:'Little’s law for the whole stack', fm:'L = λ·W', dy:-.28},
      {side:'right', text:'1.2M req/day ≈ 14 rps; at W = 84 ms the queue holds about one request.', fm:'L ≈ 14 × 0.084 ≈ 1.2', dy:.18},
      {side:'left',  text:'p99 budget for checkout', fm:'W₉₉ ≤ 84 ms', dy:-.22},
      {side:'left',  text:'every write carries an idempotency key, so a retry is a no-op', dy:.3}
    ],
    ai:[
      {side:'right', text:'what the layers minimise', fm:'ℒ = −∑ yᵢ log ŷᵢ', dy:-.3},
      {side:'right', text:'and how the gradient walks back through them', fm:'∂ℒ/∂Wₗ = δₗ · aₗ₋₁ᵀ', dy:.16},
      {side:'left',  text:'the ring is retrieval; the gate is', fm:'recall@k = |R ∩ Tₖ| / |R|', dy:-.22},
      {side:'left',  text:'output layer', fm:'softmax(z)ᵢ = e^{zᵢ} / ∑ e^{zⱼ}', dy:.32}
    ],
    civil:[
      {side:'right', text:'uniformly distributed load on the deck', fm:'w = 12 kN/m', dy:-.34},
      {side:'right', text:'simply supported, so the moment peaks at mid-span', fm:'Mₘₐₓ = wL²/8', dy:.02},
      {side:'right', text:'and the deck sags by', fm:'δₘₐₓ = 5wL⁴ / 384EI', dy:.34},
      {side:'left',  text:'each pier carries half', fm:'Rₐ = Rᵦ = wL/2', dy:-.2},
      {side:'left',  text:'span', fm:'L = 52 m', dy:.26}
    ]
  };

  const el = (cls, style, html) => {
    const s = document.createElement('span'); s.className = 'curiosity-guide ' + cls;
    Object.assign(s.style, style); if(html) s.innerHTML = html; ov.appendChild(s); return s;
  };
  const label = t => '<span class="curiosity-label">' + t + '</span>';
  const pageRect = e => { const r = e.getBoundingClientRect(); return { left:r.left + scrollX, top:r.top + scrollY, width:r.width, height:r.height, right:r.right + scrollX, bottom:r.bottom + scrollY }; };

  let lastKey = '';
  function layoutKey(){
    const main = document.querySelector('main'); if(!main) return '';
    const m = pageRect(main), plate = document.getElementById('platebox');
    return [Math.round(m.left), Math.round(m.top), Math.round(m.width), Math.round(m.height),
            plate ? Math.round(pageRect(plate).top) : 0, current, document.documentElement.scrollHeight].join(':');
  }
  function layout(){
    const main = document.querySelector('main'); if(!main) return;
    if(main.getBoundingClientRect().width < 2){ setTimeout(()=>{ if(curious) layout(); }, 150); return; }   /* not laid out yet */
    ov.innerHTML = '';
    lastKey = layoutKey();
    const m = pageRect(main), col = { left: m.left + 16, right: m.right - 16 };
    const docH = Math.max(document.documentElement.scrollHeight, m.bottom + 40);
    ov.style.height = docH + 'px';
    let i = 0; const delay = ()=> (i++ * 35) + 'ms';
    const px = v => v + 'px';

    el('curiosity-rail', {'--guide-delay':delay(), left:px(col.left), top:'0px', height:px(docH)});
    el('curiosity-rail', {'--guide-delay':delay(), left:px(col.right), top:'0px', height:px(docH)});
    el('curiosity-width', {'--guide-delay':delay(), left:px(col.left), top:px(m.top + 12), width:px(col.right - col.left)}, label(Math.round(col.right - col.left) + 'px'));

    const sections = [['bio', document.getElementById('bio')], ['figure', document.getElementById('plate')],
                      ['work', document.querySelector('section')], ['projects', document.querySelectorAll('section')[1]]];
    sections.forEach(([name, node])=>{
      if(!node || node.offsetHeight < 2) return; const r = pageRect(node);
      el('curiosity-section-guide', {'--guide-delay':delay(), left:px(col.left), top:px(r.top), width:px(col.right - col.left)}, label(name));
    });
    const secs = document.querySelectorAll('section');
    [[document.getElementById('links'), secs[0]], [secs[0], secs[1]]].forEach(([a, b])=>{
      if(!a || !b) return; const ra = pageRect(a), rb = pageRect(b), gap = rb.top - ra.bottom;
      if(gap > 20) el('curiosity-gap', {'--guide-delay':delay(), left:px(col.left - 14), top:px(ra.bottom), height:px(gap)}, label(Math.round(gap) + 'px'));
    });

    const note = (side, top, text, rot, extraClass, fm)=>{
      const w = 200, x = side === 'right' ? col.right + 52 : col.left - 52 - w;
      const s = el('curiosity-annotation' + (extraClass ? ' ' + extraClass : ''),
        {'--guide-delay':delay(), '--note-rotation':rot + 'deg', left:px(x), top:px(top)},
        text + (fm ? '<span class="fm">' + fm + '</span>' : ''));
      s.setAttribute('data-side', side);
    };
    const h1 = document.querySelector('h1'); if(h1){ const r = pageRect(h1); note('left', r.top + 10, PAGE_NOTES.h1, -1.5); }
    note('right', m.top + 24, PAGE_NOTES.width.replace('{w}', Math.round(col.right - col.left)), 1);
    const sw = document.getElementById('switcher'); if(sw){ const r = pageRect(sw); note('right', r.top + r.height + 14, PAGE_NOTES.wall, -0.8); }
    const reel = document.getElementById('reel'); if(reel){ const r = pageRect(reel); note('left', r.top + 118, PAGE_NOTES.reel, 1.1); }
    const work = document.querySelector('section'); if(work){ const r = pageRect(work); note('right', r.top - 42, PAGE_NOTES.gap, 1.2); note('left', r.top + 58, PAGE_NOTES.chips, -1); }

    const plate = document.getElementById('platebox');
    if(plate && plate.offsetHeight > 2){ const r = pageRect(plate), cy = r.top + r.height/2;
      const notes = MODEL_NOTES[current] || [];
      ['right','left'].forEach(side=>{
        const list = notes.filter(n=>n.side === side), step = 82;
        list.forEach((n, k)=> note(side, cy - ((list.length-1)/2 - k) * step - 22, n.text, (k%2 ? 1 : -1) * (0.6 + k*0.3), 'formula', n.fm));
      }); }
  }

  function apply(){
    document.querySelectorAll('.curiosity-trigger').forEach(b=> b.setAttribute('aria-checked', curious ? 'true' : 'false'));
    ov.setAttribute('aria-hidden', curious ? 'false' : 'true');
    if(curious){ layout(); requestAnimationFrame(()=> ov.dataset.visible = 'true'); }
    else { delete ov.dataset.visible; setTimeout(()=>{ if(!curious) ov.innerHTML = ''; }, 260); }
    hooks.annot(curious);
  }
  function set(v){ curious = v; try{ localStorage.setItem('rl-curious', v ? '1' : '0'); }catch(e){} apply(); }

  document.addEventListener('click', e=>{
    const t = e.target.closest && e.target.closest('.curiosity-trigger'); if(!t) return;
    e.preventDefault(); set(!curious);
  });
  /* the bio is rebuilt on every role switch — keep the switch state and the notes in step */
  new MutationObserver(()=>{
    document.querySelectorAll('.curiosity-trigger').forEach(b=> b.setAttribute('aria-checked', curious ? 'true' : 'false'));
    if(curious) clearTimeout(relayoutT), relayoutT = setTimeout(layout, 420);
  }).observe(document.getElementById('bio'), {childList:true});
  let relayoutT = 0;
  addEventListener('resize', ()=>{ if(curious){ clearTimeout(relayoutT); relayoutT = setTimeout(layout, 120); } });
  /* the host can size the page after load — lay the guides out again whenever the column moves */
  try{ new ResizeObserver(()=>{ if(curious){ clearTimeout(relayoutT); relayoutT = setTimeout(layout, 80); } })
    .observe(document.querySelector('main')); }catch(e){}
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ if(curious) layout(); });
  /* and, belt and braces: if the column has moved since the last layout, lay out again */
  setInterval(()=>{ if(curious && ov.children.length && layoutKey() !== lastKey) layout(); }, 400);
  hooks.curiousRelayout = ()=>{ if(curious){ clearTimeout(relayoutT); relayoutT = setTimeout(layout, 450); } };
  hooks.isCurious = ()=> curious;
  apply();
})();
