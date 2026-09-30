
/* =================== the picker wheel: the role becomes a short list =================== */
(function(){
  const wrap = document.getElementById('reelwrap'), reel = document.getElementById('reel'),
        wheel = document.getElementById('wheel'), win = document.getElementById('win'),
        rowsEl = document.getElementById('rows');
  const ROW = 42;
  const META = { se:'LV 9 · backend', ai:'LV 4 · applied ml', civil:'LV 9 · structures' };
  const ITEMS = [...ORDER, ...ORDER, ...ORDER];          /* three copies, so the wheel never ends */
  let open = false, idx = 3, closeT = 0, suppress = false, acc = 0, cool = 0;

  function render(){
    rowsEl.innerHTML = ITEMS.map((k,i)=>
      '<div class="row" role="option" data-i="'+i+'" data-role="'+k+'" aria-selected="false">'+
        '<span class="nm">'+ROLES[k].reel+'</span><span class="mt">'+META[k]+'</span></div>').join('');
    mark();
  }
  function mark(){
    [...rowsEl.children].forEach((r,i)=>{
      const cur = i === idx;
      r.classList.toggle('is-current', cur);
      r.setAttribute('aria-selected', cur ? 'true' : 'false');
    });
  }
  function place(animate){
    rowsEl.style.transition = animate ? 'transform .28s cubic-bezier(.2,.9,.25,1)' : 'none';
    rowsEl.style.transform = 'translateY(' + (-(idx-1)*ROW) + 'px)';
  }
  function normalize(){
    if(idx < 3){ idx += 3; place(false); mark(); }
    else if(idx > 5){ idx -= 3; place(false); mark(); }
  }
  function goto(next, animate){
    idx = next; place(animate); mark();
    setRole(ORDER[((idx % 3) + 3) % 3]);
    setTimeout(normalize, animate ? 300 : 0);
  }
  const step = dir => goto(idx + dir, true);

  function show(){
    if(open || suppress) return;
    clearTimeout(closeT);
    idx = 3 + ORDER.indexOf(current);
    render(); place(false);
    wheel.classList.add('on'); wrap.classList.add('open');
    reel.setAttribute('aria-expanded','true');
    open = true;
  }
  function hide(){
    if(!open) return;
    open = false;
    wheel.classList.remove('on'); wrap.classList.remove('open');
    reel.setAttribute('aria-expanded','false');
  }
  const softHide = ()=>{ clearTimeout(closeT); closeT = setTimeout(hide, 160); };

  wrap.addEventListener('mouseenter', show);
  wrap.addEventListener('mouseleave', ()=>{ suppress = false; softHide(); });
  wheel.addEventListener('mouseenter', ()=> clearTimeout(closeT));
  reel.addEventListener('focus', show);
  wrap.addEventListener('focusout', e=>{ if(!wrap.contains(e.relatedTarget)) softHide(); });
  reel.addEventListener('click', ()=>{ if(open){ hide(); suppress = true; } else show(); });

  /* the wheel is driven by the wheel */
  win.addEventListener('wheel', e=>{
    e.preventDefault();
    const now = performance.now();
    acc += e.deltaY;
    if(now < cool || Math.abs(acc) < 26) return;
    step(acc > 0 ? 1 : -1);
    acc = 0; cool = now + 170;
  }, {passive:false});

  /* …and by a drag, for touch */
  let dragging = false, startY = 0, startIdx = 3;
  win.addEventListener('pointerdown', e=>{
    dragging = true; startY = e.clientY; startIdx = idx;
    try{ win.setPointerCapture(e.pointerId); }catch(err){}
  });
  win.addEventListener('pointermove', e=>{
    if(!dragging) return;
    const next = startIdx + Math.round((startY - e.clientY)/ROW);
    if(next !== idx) goto(next, true);
  });
  const endDrag = ()=>{ dragging = false; };
  win.addEventListener('pointerup', endDrag);
  win.addEventListener('pointercancel', endDrag);

  win.addEventListener('click', e=>{
    const row = e.target.closest('.row'); if(!row || dragging) return;
    const i = +row.dataset.i;
    if(i === idx) hide(); else goto(i, true);
  });

  reel.addEventListener('keydown', e=>{
    if(e.key === 'ArrowDown' || e.key === 'ArrowRight'){ e.preventDefault(); show(); step(1); }
    else if(e.key === 'ArrowUp' || e.key === 'ArrowLeft'){ e.preventDefault(); show(); step(-1); }
    else if(e.key === 'Escape'){ hide(); }
  });
  document.addEventListener('click', e=>{ if(open && !wrap.contains(e.target)) hide(); });
  render();
})();
