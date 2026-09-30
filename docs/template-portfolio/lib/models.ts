/** Pure geometry for the three figures. No three.js in here — every model is a
 *  flat list of [x0,y0,z0,x1,y1,z1] segments, and `resample` redistributes any
 *  model to a fixed segment count so morphing between them is a straight
 *  per-vertex lerp.
 *
 *  Lifted verbatim from the single-file implementation; only the module
 *  plumbing is new.
 */

export type Seg = number[];
export type Pt = [number, number, number];

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

/** Every model resampled to the same length, ready to lerp between. */
export const SEG_COUNT = 760;

export const MODELS = {
  se: resample(shapeSystem(), SEG_COUNT),
  ai: resample(shapeLearn(), SEG_COUNT),
  civil: resample(shapeBridge(), SEG_COUNT),
};

export { shapeSystem, shapeLearn, shapeBridge, resample, boxEdges, ring, poly, S };
export { SYS, SYS_PATHS, NET, LOSS, DESCENT, TRUCK, lossY, N, L, H, dx, WZ };
