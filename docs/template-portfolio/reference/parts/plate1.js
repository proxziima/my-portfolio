
/* =================== three.js: the reel drum and the plate =================== */
(function(){
  if(typeof THREE === 'undefined'){
    const el = document.getElementById('reel');
    el.innerHTML = '<span id="reeltxt" style="display:block;font:430 28px Inter,sans-serif;color:var(--ink-soft);line-height:36px">'+ROLES[current].reel+'</span>';
    el.style.width = 'auto';
    hooks.reel = k => { const t=document.getElementById('reeltxt'); if(t) t.textContent = ROLES[k].reel; };
    el.addEventListener('click', ()=> setRole(ORDER[(ORDER.indexOf(current)+1)%3]));
    document.getElementById('plate').style.display = 'none';
    return;
  }

  /* ---------- the reel: a 3-sided drum set into the headline ---------- */
  const reelEl = document.getElementById('reel'), reelCanvas = document.getElementById('reelc');
  const RH = 36, RW = 340, DPR = Math.min(devicePixelRatio||1, 2);
  const rScene = new THREE.Scene();
  const rCam = new THREE.OrthographicCamera(-RW/2, RW/2, RH/2, -RH/2, .1, 1000);
  rCam.position.z = 100;
  const rRenderer = new THREE.WebGLRenderer({canvas:reelCanvas, alpha:true, antialias:true});
  rRenderer.setPixelRatio(DPR); rRenderer.setSize(RW, RH, false);
  reelCanvas.style.width = RW+'px'; reelCanvas.style.height = RH+'px';

  const drum = new THREE.Group(); rScene.add(drum);
  const R = RH/(2*Math.sqrt(3));
  const faces = ORDER.map((key,i)=>{
    const cv = document.createElement('canvas');
    cv.width = Math.round(RW*DPR*2); cv.height = Math.round(RH*DPR*2);
    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 8; tex.minFilter = THREE.LinearFilter;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(RW, RH),
      new THREE.MeshBasicMaterial({map:tex, transparent:true, side:THREE.FrontSide, depthWrite:false}));
    const a = i*Math.PI*2/3;
    mesh.position.set(0, R*Math.sin(a), R*Math.cos(a));
    mesh.rotation.x = -a;
    drum.add(mesh);
    return {cv, tex, mesh, key, width:RW};
  });
  function paintReel(colour){
    const col = colour || getComputedStyle(document.body).getPropertyValue('--ink-soft').trim() || '#686863';
    faces.forEach(f=>{
      const g = f.cv.getContext('2d'), s = DPR*2;
      g.setTransform(1,0,0,1,0,0); g.clearRect(0,0,f.cv.width,f.cv.height); g.scale(s,s);
      g.font = '430 28px Inter, sans-serif'; g.fillStyle = col;
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.fillText(ROLES[f.key].reel, 1, RH/2 + 1);
      f.width = Math.ceil(g.measureText(ROLES[f.key].reel).width) + 4;
      f.tex.needsUpdate = true;
    });
    sizeReel();
  }
  function sizeReel(){ reelEl.style.width = Math.min(faces[ORDER.indexOf(current)].width, RW)+'px'; }

  let spinNow = 0, spinTarget = 0;
  function reelTo(key){
    const want = ORDER.indexOf(key)*Math.PI*2/3;
    const d = ((want - spinTarget + Math.PI) % (Math.PI*2) + Math.PI*2) % (Math.PI*2) - Math.PI;
    spinTarget += d; if(reduce) spinNow = spinTarget; sizeReel();
  }
  /* the drum only ever displays the class the page is in; the picker changes it */
  function faceIndex(){ return ((Math.round(spinNow/(Math.PI*2/3)) % 3) + 3) % 3; }

  /* ================= the plate: three drawings, one morph ================= */
  const plate = document.getElementById('plate'), platebox = document.getElementById('platebox'),
        plateCanvas = document.getElementById('platec');
  const pScene = new THREE.Scene();
  const pCam = new THREE.PerspectiveCamera(32, 3, .1, 100);
  const pRenderer = new THREE.WebGLRenderer({canvas:plateCanvas, alpha:true, antialias:true});
  pRenderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
  const world = new THREE.Group(); pScene.add(world);

  const S = (x0,y0,z0,x1,y1,z1) => [x0,y0,z0,x1,y1,z1];
  function boxEdges(cx,cy,cz,w,h,d){
    const X=w/2,Y=h/2,Z=d/2, c=[[-X,-Y,-Z],[X,-Y,-Z],[X,Y,-Z],[-X,Y,-Z],[-X,-Y,Z],[X,-Y,Z],[X,Y,Z],[-X,Y,Z]];
    return [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
      .map(e=>S(cx+c[e[0]][0],cy+c[e[0]][1],cz+c[e[0]][2], cx+c[e[1]][0],cy+c[e[1]][1],cz+c[e[1]][2]));
  }

  /* ---- shared drawing helpers ---- */
  function ring(cx,cy,cz, rx, rz, n, s, axis){          /* an ellipse; axis 'y' lies flat, 'x' stands on its side */
    for(let i=0;i<n;i++){ const a0=i/n*Math.PI*2, a1=(i+1)/n*Math.PI*2;
      if(axis === 'x') s.push(S(cx, cy+Math.cos(a0)*rx, cz+Math.sin(a0)*rz, cx, cy+Math.cos(a1)*rx, cz+Math.sin(a1)*rz));
      else if(axis === 'z') s.push(S(cx+Math.cos(a0)*rx, cy+Math.sin(a0)*rz, cz, cx+Math.cos(a1)*rx, cy+Math.sin(a1)*rz, cz));
      else s.push(S(cx+Math.cos(a0)*rx, cy, cz+Math.sin(a0)*rz, cx+Math.cos(a1)*rx, cy, cz+Math.sin(a1)*rz)); }
  }
  function dbDrum(cx,cy,cz, r, h, s){                       /* a database: stacked discs */
    for(const yy of [h/2, h/6, -h/6, -h/2]) ring(cx, cy+yy, cz, r, r*.55, 22, s, 'y');
    for(const a of [0, Math.PI/2, Math.PI, Math.PI*1.5]) s.push(S(cx+Math.cos(a)*r, cy-h/2, cz+Math.sin(a)*r*.55, cx+Math.cos(a)*r, cy+h/2, cz+Math.sin(a)*r*.55));
  }
  function pipe(x0, x1, cy, cz, r, s){                    /* a queue: a horizontal cylinder with partitions */
    for(const x of [x0, x0+(x1-x0)*.33, x0+(x1-x0)*.66, x1]) ring(x, cy, cz, r, r*.9, 18, s, 'x');
    for(const a of [Math.PI/2, Math.PI*1.5, 0.35, Math.PI-0.35]) s.push(S(x0, cy+Math.cos(a)*r, cz+Math.sin(a)*r*.9, x1, cy+Math.cos(a)*r, cz+Math.sin(a)*r*.9));
  }
  function poly(pts, s){ for(let i=0;i<pts.length-1;i++) s.push(S(...pts[i], ...pts[i+1])); }

  /* 01 — a request path: edge, gateway, three services, a queue and two stores */
  const SYS = {
    edge:[-2.35, 1.35, 0], gate:[0, 1.35, 0], svc:[[-1.25,.25,0],[0,.25,0],[1.25,.25,0]],
    queue:[0,-.72,0], db:[[-1.95,-1.28,0],[1.95,-1.28,0]]
  };
  function shapeSystem(){
    let s=[];
    s = s.concat(boxEdges(...SYS.edge, .9, .34, .55));
    s.push(S(SYS.edge[0]-.3, SYS.edge[1]+.04, .28, SYS.edge[0]+.3, SYS.edge[1]+.04, .28));   /* a line of "text" on the edge box */
    s = s.concat(boxEdges(...SYS.gate, 1.7, .34, .7));
    SYS.svc.forEach(c=>{ s = s.concat(boxEdges(...c, .82, .5, .82));
      for(let k=0;k<3;k++) s.push(S(c[0]-.25, c[1]+.16-k*.14, c[2]+.415, c[0]+.05+k*.06, c[1]+.16-k*.14, c[2]+.415)); }); /* "logs" */
    pipe(-1.35, 1.35, SYS.queue[1], SYS.queue[2], .27, s);
    SYS.db.forEach(c=> dbDrum(...c, .42, .86, s));
    /* wires */
    s.push(S(SYS.edge[0]+.45, SYS.edge[1], 0, SYS.gate[0]-.85, SYS.gate[1], 0));
    SYS.svc.forEach(c=>{ s.push(S(c[0]*.55, SYS.gate[1]-.17, 0, c[0], c[1]+.25, 0)); s.push(S(c[0], c[1]-.25, 0, c[0]*.7, SYS.queue[1]+.27, 0)); });
    SYS.db.forEach(c=>{ s.push(S(Math.sign(c[0])*1.35, SYS.queue[1], 0, c[0], c[1]+.43, 0)); });
    /* ground */
    const B=2.75, D=1.25, y=-1.78;
    s.push(S(-B,y,-D, B,y,-D), S(-B,y,D, B,y,D), S(-B,y,-D, -B,y,D), S(B,y,-D, B,y,D));
    return s;
  }
  /* the routes a request can take through it */
  const SYS_PATHS = [];
  SYS.svc.forEach((c,i)=> SYS.db.forEach(d=> SYS_PATHS.push([
    [SYS.edge[0]-.4, SYS.edge[1], 0], [SYS.edge[0]+.45, SYS.edge[1], 0], [SYS.gate[0]-.85, SYS.gate[1], 0],
    [c[0]*.55, SYS.gate[1]-.17, 0], [c[0], c[1]+.25, 0], [c[0], c[1]-.25, 0], [c[0]*.7, SYS.queue[1]+.27, 0],
    [c[0]*.7, SYS.queue[1], 0], [Math.sign(d[0])*1.35, SYS.queue[1], 0], [d[0], d[1]+.43, 0]
  ])));

  /* 02 — a small network floating over the loss surface it is descending */
  const NET = [];
  const LOSS = { x0:-2.7, x1:2.7, z0:-1.55, z1:1.55, base:-1.62, nx:14, nz:9 };
  const lossF = (x,z) => { const u=x/2.7, v=z/1.55;
    return .62*(u*u*.9 + v*v*.7) + .16*Math.sin(2.1*x + .4)*Math.cos(1.7*z) + .08*Math.cos(3.1*x)*.5 + .05; };
  const lossY = (x,z) => LOSS.base + lossF(x,z);
  function shapeLearn(){
    const s=[]; NET.length = 0;
    /* the network */
    const L=[3,5,5,2];
    L.forEach((n,li)=>{ const col=[];
      for(let i=0;i<n;i++){ const x=(li-1.5)*1.05, y=1.05+(i-(n-1)/2)*.36, z=(li%2?.1:-.1);
        col.push([x,y,z]); const r=.075;
        s.push(S(x-r,y,z, x,y+r,z), S(x,y+r,z, x+r,y,z), S(x+r,y,z, x,y-r,z), S(x,y-r,z, x-r,y,z)); }
      NET.push(col); });
    for(let li=0; li<NET.length-1; li++) NET[li].forEach(a=> NET[li+1].forEach(b=> s.push(S(a[0]+.09,a[1],a[2], b[0]-.09,b[1],b[2]))));
    /* the loss surface */
    for(let i=0;i<=LOSS.nx;i++){ const x=LOSS.x0+(LOSS.x1-LOSS.x0)*i/LOSS.nx, pts=[];
      for(let j=0;j<=LOSS.nz;j++){ const z=LOSS.z0+(LOSS.z1-LOSS.z0)*j/LOSS.nz; pts.push([x, lossY(x,z), z]); } poly(pts, s); }
    for(let j=0;j<=LOSS.nz;j++){ const z=LOSS.z0+(LOSS.z1-LOSS.z0)*j/LOSS.nz, pts=[];
      for(let i=0;i<=LOSS.nx*2;i++){ const x=LOSS.x0+(LOSS.x1-LOSS.x0)*i/(LOSS.nx*2); pts.push([x, lossY(x,z), z]); } poly(pts, s); }
    /* the descent, by actual gradient steps */
    poly(DESCENT, s);
    return s;
  }
  const DESCENT = (function(){
    const pts=[]; let x=-2.15, z=1.25, eps=1e-3;
    for(let k=0;k<64;k++){
      pts.push([x, lossY(x,z)+.03, z]);
      const gx=(lossF(x+eps,z)-lossF(x-eps,z))/(2*eps), gz=(lossF(x,z+eps)-lossF(x,z-eps))/(2*eps);
      x -= gx*.55; z -= gz*.55;
      x = Math.max(LOSS.x0+.05, Math.min(LOSS.x1-.05, x)); z = Math.max(LOSS.z0+.05, Math.min(LOSS.z1-.05, z));
    }
    return pts;
  })();

  /* 03 — a Warren truss bridge over a river: abutments, road, railings, water */
  const N=8, L=5.5, H=1.1, dx=L/N, WZ=.5;
  function shapeBridge(){
    const s=[];
    const bot=(i,z)=>[-L/2+i*dx,-H/2,z], top=(i,z)=>[-L/2+i*dx,H/2,z];
    for(const z of [-WZ, WZ]){
      for(let i=0;i<N;i++) s.push(S(...bot(i,z), ...bot(i+1,z)));
      for(let i=1;i<N-1;i++) s.push(S(...top(i,z), ...top(i+1,z)));
      for(let i=1;i<N;i++){ s.push(S(...bot(i-1,z), ...top(i,z))); s.push(S(...top(i,z), ...bot(i+1,z))); }
    }
    for(let i=0;i<=N;i++) s.push(S(...bot(i,-WZ), ...bot(i,WZ)));
    for(let i=1;i<N;i++) s.push(S(...top(i,-WZ), ...top(i,WZ)));
    for(let i=0;i<N;i++){ s.push(S(...bot(i,-WZ), ...bot(i+1,WZ))); if(i%2===0) s.push(S(...bot(i,WZ), ...bot(i+1,-WZ))); }
    /* road: centre line dashes */
    for(let i=0;i<N*2;i+=2) s.push(S(-L/2+i*dx/2+.1, -H/2+.01, 0, -L/2+(i+1)*dx/2-.1, -H/2+.01, 0));
    /* abutments and approach ramps */
    for(const sgn of [-1, 1]){
      const x=sgn*L/2, xo=sgn*(L/2+.9);
      for(const z of [-WZ-.12, WZ+.12]){ s.push(S(x, -H/2, z, x, -H/2-1.05, z), S(xo, -H/2-.25, z, xo, -H/2-1.05, z), S(x, -H/2, z, xo, -H/2-.25, z), S(x,-H/2-1.05,z, xo,-H/2-1.05,z)); }
      s.push(S(x,-H/2,-WZ-.12, x,-H/2,WZ+.12), S(xo,-H/2-.25,-WZ-.12, xo,-H/2-.25,WZ+.12), S(x,-H/2-1.05,-WZ-.12, x,-H/2-1.05,WZ+.12), S(xo,-H/2-1.05,-WZ-.12, xo,-H/2-1.05,WZ+.12));
    }
    /* piers with footings, a third of the way in */
    for(const x of [-L/2+2*dx, L/2-2*dx]) for(const z of [-WZ*.6, WZ*.6]){ s.push(S(x,-H/2,z, x,-H/2-1.0,z)); s.push(S(x-.22,-H/2-1.0,z, x+.22,-H/2-1.0,z)); }
    /* the river */
    for(const [yy, amp] of [[-H/2-1.22,.05],[-H/2-1.38,.04],[-H/2-1.52,.03]]){
      const pts=[]; for(let i=0;i<=40;i++){ const x=-L/2-1.3+(L+2.6)*i/40; pts.push([x, yy+Math.sin(i*.9+yy*7)*amp, WZ*.2+Math.sin(i*.5)*.2]); } poly(pts, s); }
    return s;
  }
  /* a truck, drawn once and driven along the deck */
  const TRUCK = (function(){ const s=[]; const x=0, y=-H/2+.02, z=-.18;
    s.push(...boxEdges(x-.02, y+.19, z, .62, .34, .3)); s.push(...boxEdges(x+.44, y+.13, z, .26, .22, .3));
    for(const wx of [x-.22, x+.2, x+.46]) ring(wx, y+.01, z-.16, .07, .07, 10, s, 'z'), ring(wx, y+.01, z+.16, .07, .07, 10, s, 'z');
    return s; })();
  function resample(segs, N){
    const len = segs.map(s=>Math.hypot(s[3]-s[0], s[4]-s[1], s[5]-s[2]));
    const total = len.reduce((a,b)=>a+b,0) || 1;
    const out = new Float32Array(N*6); let k=0;
    segs.forEach((s,i)=>{
      const share = Math.max(1, Math.round(N*len[i]/total));
      for(let j=0;j<share && k<N;j++,k++){
        const t0=j/share, t1=(j+1)/share;
        for(let v=0;v<3;v++){
          out[k*6+v]   = s[v] + (s[v+3]-s[v])*t0;
          out[k*6+3+v] = s[v] + (s[v+3]-s[v])*t1;
        }
      }
    });
    while(k<N && k>0){ out.copyWithin(k*6, (k-1)*6, (k-1)*6+6); k++; }
    return out;
  }
  const SEG = 760;
  const PLATES = { se:resample(shapeSystem(),SEG), ai:resample(shapeLearn(),SEG), civil:resample(shapeBridge(),SEG) };
  const pFrom = new Float32Array(SEG*6), pTo = new Float32Array(SEG*6), pPos = new Float32Array(SEG*6);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos,3));
  const pMat = new THREE.LineBasicMaterial({transparent:true, opacity:.85});
  world.add(new THREE.LineSegments(pGeo, pMat));

  /* ---- what moves through each drawing ---- */
  const PN = 130;
  const flowPos = new Float32Array(PN*3), flowT = new Float32Array(PN), flowP = new Float32Array(PN*4);
  const flowGeo = new THREE.BufferGeometry();
  flowGeo.setAttribute('position', new THREE.BufferAttribute(flowPos,3));
  const flowMat = new THREE.PointsMaterial({size:.055, transparent:true, opacity:0, depthWrite:false});
  world.add(new THREE.Points(flowGeo, flowMat));

  function pathPoint(path, t, out){
    if(!path._lens){ const l=[0]; for(let i=1;i<path.length;i++) l.push(l[i-1]+Math.hypot(path[i][0]-path[i-1][0], path[i][1]-path[i-1][1], path[i][2]-path[i-1][2])); path._lens=l; }
    const lens=path._lens, d=t*lens[lens.length-1]; let i=1; while(i<lens.length-1 && lens[i]<d) i++;
    const a=path[i-1], b=path[i], u=(d-lens[i-1])/((lens[i]-lens[i-1])||1);
    out[0]=a[0]+(b[0]-a[0])*u; out[1]=a[1]+(b[1]-a[1])*u; out[2]=a[2]+(b[2]-a[2])*u;
  }
  const tmpP = [0,0,0];
  function seedFlow(key){
    for(let i=0;i<PN;i++){
      flowT[i] = Math.random();
      if(key==='se'){ flowP[i*4]=Math.floor(Math.random()*SYS_PATHS.length); flowP[i*4+1]=.35+Math.random()*.45; }
      else if(key==='ai'){
        const li = Math.floor(Math.random()*(NET.length-1));
        flowP[i*4]=li; flowP[i*4+1]=Math.floor(Math.random()*NET[li].length);
        flowP[i*4+2]=Math.floor(Math.random()*NET[li+1].length); flowP[i*4+3]=.45+Math.random()*.8;
      } else { flowP[i*4]=-H/2-1.22-Math.random()*.32; flowP[i*4+1]=(Math.random()-.5)*.5; flowP[i*4+2]=.12+Math.random()*.12; }
    }
  }
  function stepFlow(key, dt){
    for(let i=0;i<PN;i++){
      const k=i*3;
      if(key==='se'){
        flowT[i] += dt*flowP[i*4+1]*.28; if(flowT[i]>1){ flowT[i]-=1; flowP[i*4]=Math.floor(Math.random()*SYS_PATHS.length); }
        pathPoint(SYS_PATHS[flowP[i*4]], flowT[i], tmpP); flowPos[k]=tmpP[0]; flowPos[k+1]=tmpP[1]; flowPos[k+2]=tmpP[2];
      } else if(key==='ai'){
        if(i < 3){                                  /* three balls rolling down the loss surface */
          flowT[i] += dt*.09; if(flowT[i]>1) flowT[i]-=1;
          pathPoint(DESCENT, flowT[i], tmpP); flowPos[k]=tmpP[0]; flowPos[k+1]=tmpP[1]+.04; flowPos[k+2]=tmpP[2];
          continue;
        }
        flowT[i] += dt*flowP[i*4+3]*.5;
        if(flowT[i]>1){ flowT[i]-=1;
          const li=Math.floor(Math.random()*(NET.length-1));
          flowP[i*4]=li; flowP[i*4+1]=Math.floor(Math.random()*NET[li].length);
          flowP[i*4+2]=Math.floor(Math.random()*NET[li+1].length);
        }
        const a = NET[flowP[i*4]][flowP[i*4+1]], b = NET[flowP[i*4]+1][flowP[i*4+2]];
        if(a && b){ const t=flowT[i];
          flowPos[k]=a[0]+(b[0]-a[0])*t; flowPos[k+1]=a[1]+(b[1]-a[1])*t; flowPos[k+2]=a[2]+(b[2]-a[2])*t; }
      } else {                                       /* the river moves */
        flowT[i] += dt*flowP[i*4+2]*.25; if(flowT[i]>1) flowT[i]-=1;
        const t=flowT[i];
        flowPos[k]=-L/2-1.3 + t*(L+2.6); flowPos[k+1]=flowP[i*4]+Math.sin(t*9)*.03; flowPos[k+2]=flowP[i*4+1];
      }
    }
    flowGeo.attributes.position.needsUpdate = true;
  }

  /* the truck */
  const truckGeo = new THREE.BufferGeometry();
  { const arr = new Float32Array(TRUCK.length*6); TRUCK.forEach((sg,i)=>arr.set(sg,i*6)); truckGeo.setAttribute('position', new THREE.BufferAttribute(arr,3)); }
  const truckMat = new THREE.LineBasicMaterial({transparent:true, opacity:0});
  const truck = new THREE.LineSegments(truckGeo, truckMat); truck.visible = false; world.add(truck);
  let truckT = .2;

  /* ---- curious mode: engineering annotations drawn on the model ---- */
  const ANN = {};
  (function(){
    const arrowDown = (x, y0, y1, z, s) => { s.push(S(x,y0,z, x,y1,z), S(x-.09,y1+.15,z, x,y1,z), S(x+.09,y1+.15,z, x,y1,z)); };
    const arrowLeft = (x0, x1, y, z, s) => { s.push(S(x0,y,z, x1,y,z), S(x1+.16,y+.1,z, x1,y,z), S(x1+.16,y-.1,z, x1,y,z)); };
    const bracketV = (x, y0, y1, z, dir, s) => { s.push(S(x,y0,z, x,y1,z), S(x,y0,z, x+dir*.18,y0,z), S(x,y1,z, x+dir*.18,y1,z)); };
    /* software: arrivals into the edge tier (lambda), time in system down the side (W) */
    let s = [];
    for(const x of [-.5, 0, .5]) arrowDown(x, 2.25, 1.56, 0, s);
    bracketV(2.78, 1.35, -1.28, 0, -1, s);
    ANN.se = s;
    /* ai: one forward path, the loss bracket at the output, the gradient walking back */
    s = [];
    const path = [NET[0][1], NET[1][2], NET[2][3], NET[3][0]];
    for(let i=0;i<path.length-1;i++){ const a=path[i], b=path[i+1];
      for(const o of [-.02, .02]) s.push(S(a[0]+.12,a[1]+o,a[2], b[0]-.12,b[1]+o,b[2])); }
    const ox = NET[3][0][0] + .34; bracketV(ox, 1.05+.5, 1.05-.5, 0, -1, s);
    arrowLeft(1.7, -1.7, 2.05, 0, s);
    ANN.ai = s;
    /* civil: a UDL along the deck, the reactions, the span, and the moment diagram it produces */
    s = [];
    const yTop = H/2 + .12;
    s.push(S(-L/2, yTop + .55, 0, L/2, yTop + .55, 0));
    for(let i=0;i<=10;i++) arrowDown(-L/2 + i*L/10, yTop + .55, yTop, 0, s);
    for(const x of [-L/2, L/2]){ s.push(S(x, -H/2-.62-.1, 0, x, -H/2-.62-.62, 0), S(x-.09, -H/2-.62-.25, 0, x, -H/2-.62-.1, 0), S(x+.09, -H/2-.62-.25, 0, x, -H/2-.62-.1, 0)); }
    const yDim = -H/2 - 1.42; s.push(S(-L/2, yDim, 0, L/2, yDim, 0), S(-L/2, yDim-.1, 0, -L/2, yDim+.1, 0), S(L/2, yDim-.1, 0, L/2, yDim+.1, 0));
    const yM = -H/2 - 1.62, depth = .42, NP = 36;
    for(let i=0;i<NP;i+=2){ const t0=i/NP, t1=(i+1)/NP;
      s.push(S(-L/2+t0*L, yM - depth*4*t0*(1-t0), 0, -L/2+t1*L, yM - depth*4*t1*(1-t1), 0)); }
    s.push(S(-L/2, yM, 0, L/2, yM, 0));
    ANN.civil = s;
  })();
  const annMat = new THREE.LineBasicMaterial({transparent:true, opacity:0});
  const annMeshes = {};
  for(const k of ORDER){
    const arr = new Float32Array(ANN[k].length*6); ANN[k].forEach((sg,i)=> arr.set(sg, i*6));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr,3));
    const m = new THREE.LineSegments(g, annMat.clone()); m.visible = false; world.add(m); annMeshes[k] = m;
  }
  let annotOn = hooks.isCurious();
  hooks.annot = on => { annotOn = on; };
  const annTarget = new THREE.Color();

  const lineTarget = new THREE.Color(), reelTarget = new THREE.Color(), reelNow = new THREE.Color();
  let reelHex = '', colourSettled = true;
  function repaint(){
    const cs = getComputedStyle(document.body);
    lineTarget.set(cs.getPropertyValue('--line3d').trim() || '#3A3A34');
    reelTarget.set(cs.getPropertyValue('--ink-soft').trim() || '#686863');
    annTarget.set(cs.getPropertyValue('--accent').trim() || '#3155ff');
    if(reduce || !reelHex){            /* first paint, or no motion: land immediately */
      pMat.color.copy(lineTarget); flowMat.color.copy(lineTarget);
      reelNow.copy(reelTarget); reelHex = '#' + reelNow.getHexString(); paintReel(reelHex);
    }
    colourSettled = false;
  }

  let pT = 1; const pDelay = new Float32Array(SEG);
  for(let i=0;i<SEG;i++) pDelay[i]=Math.random()*.4;
  function plateTo(key){
    pFrom.set(pPos); pTo.set(PLATES[key]);
    for(let i=0;i<SEG;i++) pDelay[i]=Math.random()*.4;
    seedFlow(key);
    if(reduce){ pPos.set(PLATES[key]); pGeo.attributes.position.needsUpdate = true; pT = 1; }
    else pT = 0;
  }

  /* ---- orbit: drifts on its own, follows the pointer, yields to a drag ---- */
  let tiltX=-.17, tiltY=.34, aimX=-.17, aimY=.34, spin=0, drag=false, lastX=0, lastY=0;
  plate.addEventListener('pointermove', e=>{
    const r=platebox.getBoundingClientRect();
    if(drag){ spin += (e.clientX-lastX)*.007; aimX = Math.max(-.7, Math.min(.7, aimX + (e.clientY-lastY)*.005));
      lastX=e.clientX; lastY=e.clientY; return; }
    aimY = .34 + ((e.clientX-r.left)/r.width - .5)*.7;
    aimX = -.17 + ((e.clientY-r.top)/r.height - .5)*.3;
  });
  plate.addEventListener('pointerdown', e=>{ drag=true; lastX=e.clientX; lastY=e.clientY;
    try{ plate.setPointerCapture(e.pointerId); }catch(err){} });
  addEventListener('pointerup', ()=>{ drag=false; });
  plate.addEventListener('pointerleave', ()=>{ if(!drag){ aimX=-.17; aimY=.34; } });

  function resize(){
    const r = platebox.getBoundingClientRect();
    if(r.width < 2) return;
    pRenderer.setSize(r.width, r.height, false);
    pCam.aspect = r.width/r.height; pCam.updateProjectionMatrix();
    pCam.position.set(0, .1, r.width < 460 ? 9.8 : 7.3);
    pCam.lookAt(0, 0, 0);
  }
  addEventListener('resize', resize);

  const watchTheme = cb => {
    try{
      new MutationObserver(cb).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme','class','style']});
      matchMedia('(prefers-color-scheme:dark)').addEventListener('change', cb);
    }catch(e){}
    [0,120,400,1200].forEach(ms=>setTimeout(cb, ms));
  };
  watchTheme(repaint);
  hooks.reel = reelTo; hooks.plate = plateTo; hooks.repaint = repaint;

  pPos.set(PLATES[current]); pGeo.attributes.position.needsUpdate = true;
  seedFlow(current);
  spinTarget = spinNow = ORDER.indexOf(current)*Math.PI*2/3;
  repaint(); resize();
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(paintReel);

  const easeOut = t => 1-Math.pow(1-t,3);
  let last = performance.now(), clock = 0, lastW = 0;
  (function frame(now){
    const pw = platebox.clientWidth;
    if(pw !== lastW){ lastW = pw; resize(); }
    const dt = Math.min((now-last)/1000,.05); last = now; clock += dt;

    if(!colourSettled){                 /* the same 380 ms the page takes */
      const k = Math.min(1, dt*7.5);
      pMat.color.lerp(lineTarget, k); flowMat.color.copy(pMat.color);
      reelNow.lerp(reelTarget, k);
      const hex = '#' + reelNow.getHexString();
      if(hex !== reelHex){ reelHex = hex; paintReel(hex); }
      const near = (a,b) => Math.abs(a.r-b.r)+Math.abs(a.g-b.g)+Math.abs(a.b-b.b) < .004;
      if(near(pMat.color, lineTarget) && near(reelNow, reelTarget)){
        pMat.color.copy(lineTarget); flowMat.color.copy(lineTarget); reelNow.copy(reelTarget);
        const hex = '#' + reelNow.getHexString(); if(hex !== reelHex){ reelHex = hex; paintReel(hex); }
        colourSettled = true;
      }
    }
    spinNow += (spinTarget - spinNow) * Math.min(1, dt*9);
    if(Math.abs(spinTarget - spinNow) < .0015 && faceIndex() !== ORDER.indexOf(current)) reelTo(current);
    drum.rotation.x = spinNow;
    rRenderer.render(rScene, rCam);

    if(pT < 1){
      pT = Math.min(1, pT + dt*1.15);
      for(let i=0;i<SEG;i++){
        const p = easeOut(Math.min(1, Math.max(0,(pT - pDelay[i])/.6)));
        for(let v=0; v<6; v++){ const k=i*6+v; pPos[k] = pFrom[k] + (pTo[k]-pFrom[k])*p; }
      }
      pGeo.attributes.position.needsUpdate = true;
    }
    for(const k of ORDER){ const m = annMeshes[k], want = (annotOn && k === current && pT > .85) ? .9 : 0;
      m.material.color.lerp(annTarget, Math.min(1, dt*8));
      m.material.opacity += (want - m.material.opacity) * Math.min(1, dt*6);
      m.visible = m.material.opacity > .01; }
    if(!reduce) stepFlow(current, dt);
    truckT += dt*.11; if(truckT>1) truckT -= 1;
    truck.position.set(-L/2-.9 + truckT*(L+1.8), -Math.sin(truckT*Math.PI)*.05, 0);
    truckMat.color.copy(pMat.color);
    truckMat.opacity += (((current==='civil' && pT>.85) ? .9 : 0) - truckMat.opacity) * Math.min(1, dt*4);
    truck.visible = truckMat.opacity > .01;
    flowMat.opacity += ((pT>.85 ? .85 : 0) - flowMat.opacity) * Math.min(1, dt*3.4);

    tiltX += (aimX-tiltX)*.07; tiltY += (aimY-tiltY)*.07;
    world.rotation.x = tiltX;
    world.rotation.y = tiltY + spin + (reduce?0:Math.sin(clock*.2)*.07);
    pRenderer.render(pScene, pCam);
    requestAnimationFrame(frame);
  })(performance.now());
})();
</script>
